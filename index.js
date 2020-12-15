const pkg = require('./package.json');
const crypto = require('crypto');
const genesisBlock = require('./genesis/testnet/genesis.json');
const WritableConsumableStream = require('writable-consumable-stream');

const { verifyBlockSchema } = require('./schemas/block-schema');
const { verifyTransactionSchema } = require('./schemas/transaction-schema');
const { verifyTransferTransactionSchema } = require('./schemas/transfer-transaction-schema');
const { verifyVoteTransactionSchema } = require('./schemas/vote-transaction-schema');
const { verifyUnvoteTransactionSchema } = require('./schemas/unvote-transaction-schema');
const { verifyRegisterMultisigTransactionSchema } = require('./schemas/register-multisig-transaction-schema');
const { verifyBlockSignatureSchema } = require('./schemas/block-signature-schema');
const { verifyMultisigTransactionSchema } = require('./schemas/multisig-transaction-schema');
const { verifySigTransactionSchema } = require('./schemas/sig-transaction-schema');
const { verifyBlocksResponse } = require('./schemas/blocks-response-schema');
const { verifyBlockSignaturesResponseSchema } = require('./schemas/block-signatures-response-schema');

const DEFAULT_MODULE_ALIAS = 'ldpos_chain';
const DEFAULT_GENESIS_PATH = './genesis/mainnet/genesis.json';
const DEFAULT_CRYPTO_CLIENT_LIB_PATH = 'ldpos-client';
const DEFAULT_DELEGATE_COUNT = 21;
const DEFAULT_FORGING_INTERVAL = 30000;
const DEFAULT_FETCH_BLOCK_LIMIT = 20;
const DEFAULT_FETCH_BLOCK_PAUSE = 100;
const DEFAULT_FETCH_BLOCK_END_CONFIRMATIONS = 10;
const DEFAULT_FORGING_BLOCK_BROADCAST_DELAY = 2000;
const DEFAULT_FORGING_SIGNATURE_BROADCAST_DELAY = 5000;
const DEFAULT_PROPAGATION_TIMEOUT = 5000;
const DEFAULT_PROPAGATION_RANDOMNESS = 10000;
const DEFAULT_TIME_POLL_INTERVAL = 200;
const DEFAULT_MAX_TRANSACTIONS_PER_BLOCK = 300;
const DEFAULT_MIN_MULTISIG_MEMBERS = 1;
const DEFAULT_MAX_MULTISIG_MEMBERS = 20;
const DEFAULT_PENDING_TRANSACTION_EXPIRY = 604800000; // 1 week
const DEFAULT_PENDING_TRANSACTION_EXPIRY_CHECK_INTERVAL = 3600000; // 1 hour
const DEFAULT_MAX_SPENDABLE_DIGITS = 25;

// TODO 222: Make sure that all external data is validated with schema.

const DEFAULT_MIN_TRANSACTION_FEES = {
  transfer: '1000000',
  vote: '2000000',
  unvote: '2000000',
  registerMultisig: '5000000'
};

const NO_PEER_LIMIT = -1;
const ACCOUNT_TYPE_MULTISIG = 'multisig';

module.exports = class LDPoSChainModule {
  constructor(options) {
    this.alias = options.alias || DEFAULT_MODULE_ALIAS;
    this.logger = options.logger || console;
    if (options.dal) {
      this.dal = options.dal;
    } else {
      // TODO 222: Default to postgres adapter as Data Access Layer
    }
    this.pendingTransactionMap = new Map();
    this.pendingBlocks = [];
    this.latestFullySignedBlock = null;
    this.latestProcessedBlock = null;
    this.latestReceivedBlock = this.latestProcessedBlock;

    this.verifiedBlockStream = new WritableConsumableStream();
    this.verifiedBlockSignatureStream = new WritableConsumableStream();
    this.isActive = false;
  }

  get dependencies() {
    return ['app', 'network'];
  }

  get info() {
    return {
      author: 'Jonathan Gros-Dubois',
      version: pkg.version,
      name: DEFAULT_MODULE_ALIAS
    };
  }

  get events() {
    return [
      'bootstrap',
      'chainChanges'
    ];
  }

  get actions() {
    return {
      postTransaction: {
        handler: async action => {
          return this.broadcastTransaction(action.transaction);
        }
      },
      getNodeStatus: {
        handler: async () => {}
      },
      getMultisigWalletMembers: {
        handler: async action => {}
      },
      getMinMultisigRequiredSignatures: {
        handler: async action => {}
      },
      getOutboundTransactions: {
        handler: async action => {}
      },
      getInboundTransactionsFromBlock: {
        handler: async action => {}
      },
      getOutboundTransactionsFromBlock: {
        handler: async action => {}
      },
      getLastBlockAtTimestamp: {
        handler: async action => {}
      },
      getMaxBlockHeight: {
        handler: async action => {}
      },
      getBlocksFromHeight: {
        handler: async action => {
          let { height, limit } = action;
          return this.dal.getBlocksFromHeight(height, limit);
        },
        isPublic: true
      },
      getLatestBlockSignatures: {
        handler: async action => {
          if (!this.latestFullySignedBlock) {
            throw new Error('Node does not have the latest block signatures');
          }
          if (action.blockId && action.blockId !== this.latestFullySignedBlock.id) {
            throw new Error(
              `The specified blockId ${
                action.blockId
              } did not match the id of the latest block ${
                this.latestFullySignedBlock.id
              } on this node`
            );
          }
          return this.latestFullySignedBlock.signatures;
        },
        isPublic: true
      },
      getBlocksBetweenHeights: {
        handler: async action => {}
      },
      getBlockAtHeight: {
        handler: async action => {}
      },
      getModuleOptions: {
        handler: async action => {}
      }
    };
  }

  async catchUpWithNetwork(options) {
    let {
      forgingInterval,
      fetchBlockEndConfirmations,
      fetchBlockLimit,
      fetchBlockPause,
      delegateMajorityCount
    } = options;

    let now = Date.now();
    if (
      Math.floor(this.latestProcessedBlock.timestamp / forgingInterval) >= Math.floor(now / forgingInterval)
    ) {
      return this.latestProcessedBlock.height;
    }

    let pendingBlocks = [];
    let latestGoodBlock = this.latestProcessedBlock;

    while (true) {
      if (!this.isActive) {
        break;
      }

      let newBlocks;
      try {
        newBlocks = await this.channel.invoke('network:request', {
          procedure: `${this.alias}:getBlocksFromHeight`,
          data: {
            height: latestGoodBlock.height + 1,
            limit: fetchBlockLimit
          }
        });
        verifyBlocksResponse(newBlocks);
      } catch (error) {
        this.logger.warn(error);
        pendingBlocks = [];
        latestGoodBlock = this.latestProcessedBlock;
        await this.wait(fetchBlockPause);
        continue;
      }

      let latestVerifiedBlock = latestGoodBlock;
      try {
        for (let block of newBlocks) {
          await this.verifyBlock(block, latestVerifiedBlock);
          latestVerifiedBlock = block;
        }
      } catch (error) {
        this.logger.warn(
          `Received invalid block while catching up with the network - ${error.message}`
        );
        pendingBlocks = [];
        latestGoodBlock = this.latestProcessedBlock;
        await this.wait(fetchBlockPause);
        continue;
      }

      for (let block of newBlocks) {
        pendingBlocks.push(block);
      }

      let safeBlockCount = pendingBlocks.length - delegateMajorityCount;

      if (!newBlocks.length) {
        if (latestGoodBlock.height === 1) {
          break;
        }
        try {
          let latestBlockSignatures = await this.channel.invoke('network:request', {
            procedure: `${this.alias}:getLatestBlockSignatures`,
            data: {
              blockId: latestGoodBlock.id
            }
          });
          verifyBlockSignaturesResponseSchema(latestBlockSignatures, delegateMajorityCount, this.networkSymbol);

          await Promise.all(
            latestBlockSignatures.map(blockSignature => this.verifyBlockSignature(this.latestProcessedBlock, blockSignature))
          );

          // If we have the latest block with all necessary signatures, then we can have instant finality.
          safeBlockCount = pendingBlocks.length;
        } catch (error) {
          this.logger.warn(
            `Failed to fetch latest block signatures because of error: ${error.message}`
          );
          // This is to cover the case where our node has received some bad blocks in the past.
          pendingBlocks = [];
          latestGoodBlock = this.latestProcessedBlock;
          await this.wait(fetchBlockPause);
          continue;
        }
      }

      try {
        for (let i = 0; i < safeBlockCount; i++) {
          let block = pendingBlocks[i];
          await this.processBlock(block);
          pendingBlocks[i] = null;
        }
      } catch (error) {
        this.logger.error(
          `Failed to process block while catching up with the network - ${error.message}`
        );
      }
      pendingBlocks = pendingBlocks.filter(block => block);

      if (!pendingBlocks.length) {
        break;
      }

      latestGoodBlock = latestVerifiedBlock;
      await this.wait(fetchBlockPause);
    }
    return this.latestProcessedBlock.height;
  }

  async receiveLatestBlock(timeout) {
    return this.verifiedBlockStream.once(timeout);
  }

  async receiveLatestBlockSignatures(latestBlock, requiredSignatureCount, timeout) {
    let signerSet = new Set();
    while (true) {
      let startTime = Date.now();
      let blockSignature = await this.verifiedBlockSignatureStream.once(timeout);
      if (blockSignature.blockId === latestBlock.id) {
        latestBlock.signatures[blockSignature.signerAddress] = blockSignature;
        signerSet.add(blockSignature.signerAddress);
      }
      let timeDiff = Date.now() - startTime;
      timeout -= timeDiff;
      if (timeout <= 0 || signerSet.size >= requiredSignatureCount) {
        break;
      }
    }
    return latestBlock.signatures;
  }

  getCurrentBlockTimeSlot(forgingInterval) {
    return Math.floor(Date.now() / forgingInterval) * forgingInterval;
  }

  async getForgingDelegateAddressAtTimestamp(timestamp) {
    let activeDelegates = await this.dal.getTopActiveDelegates(this.delegateCount);
    let slotIndex = Math.floor(timestamp / this.forgingInterval);
    let activeDelegateIndex = slotIndex % activeDelegates.length;
    return activeDelegates[activeDelegateIndex].address;
  }

  async getCurrentForgingDelegateAddress() {
    return this.getForgingDelegateAddressAtTimestamp(Date.now());
  }

  sha256(message) {
    return crypto.createHash('sha256').update(message, 'utf8').digest('hex');
  }

  forgeBlock(height, timestamp, transactions) {
    let block = {
      height,
      timestamp,
      transactions,
      previousBlockId: this.latestProcessedBlock ? this.latestProcessedBlock.id : null
    };
    return this.ldposClient.prepareBlock(block);
  }

  async processBlock(block) {
    let { transactions, height } = block;
    let affectedAddresses = new Set();
    for (let txn of transactions) {
      affectedAddresses.add(txn.senderAddress);
      if (txn.recipientAddress) {
        affectedAddresses.add(txn.recipientAddress);
      }
      // For multisig transaction, add all signer accounts.
      if (txn.signatures) {
        for (let signaturePacket of txn.signatures) {
          affectedAddresses.add(signaturePacket.signerAddress);
        }
      }
    }
    affectedAddresses.add(block.forgerAddress);

    let accountList = await Promise.all(
      [...affectedAddresses].map(address => this.dal.getAccount(address))
    );
    let accounts = {};
    for (account of accountList) {
      accounts[account.address] = account;
    }
    let forgerAccount = accounts[block.forgerAddress];
    let voteChangeList = [];
    let multisigRegistrationList = [];
    for (let txn of transactions) {
      let {
        type,
        senderAddress,
        fee,
        timestamp,
        signatures,
        sigPublicKey,
        nextSigPublicKey
      } = txn;
      let senderAccount = accounts[senderAddress];

      if (signatures) {
        for (let signaturePacket of signatures) {
          let memberAccount = accounts[signaturePacket.signerAddress];
          memberAccount.multisigPublicKey = signaturePacket.multisigPublicKey;
          memberAccount.nextMultisigPublicKey = signaturePacket.nextMultisigPublicKey;
        }
      } else {
        // If regular transaction (not multisig), update the account sig public keys.
        senderAccount.sigPublicKey = sigPublicKey;
        senderAccount.nextSigPublicKey = nextSigPublicKey;
      }

      if (type === 'transfer') {
        let { recipientAddress, amount } = txn;
        let txnAmount = BigInt(amount);
        let txnFee = BigInt(fee);
        let recipientAccount = accounts[recipientAddress];
        if (senderAccount.updateHeight < height) {
          senderAccount.balance = senderAccount.balance - txnAmount - txnFee;
          senderAccount.lastTransactionTimestamp = timestamp;
        }
        if (recipientAccount.updateHeight < height) {
          recipientAccount.balance = recipientAccount.balance + txnAmount;
          recipientAccount.lastTransactionTimestamp = timestamp;
        }
      } else {
        let txnFee = BigInt(fee);
        if (senderAccount.updateHeight < height) {
          senderAccount.balance = senderAccount.balance - txnFee;
          senderAccount.lastTransactionTimestamp = timestamp;
        }
        if (type === 'vote' || type === 'unvote') {
          voteChangeList.push({
            type,
            voterAddress: senderAddress,
            delegateAddress: txn.delegateAddress
          });
        } else if (type === 'registerMultisig') {
          multisigRegistrationList.push({
            multisigAddress: senderAddress,
            memberAddresses: txn.memberAddresses,
            requiredSignatureCount: txn.requiredSignatureCount
          });
        }
      }
    }
    await Promise.all(
      accountList.map(async (account) => {
        if (account.updateHeight < height) {
          let accountUpdatePacket;
          if (account.type === ACCOUNT_TYPE_MULTISIG) {
            accountUpdatePacket = {
              balance: account.balance,
              multisigPublicKey: account.multisigPublicKey,
              nextMultisigPublicKey: account.nextMultisigPublicKey,
              lastTransactionTimestamp: account.lastTransactionTimestamp
            };
          } else {
            accountUpdatePacket = {
              balance: account.balance,
              sigPublicKey: account.sigPublicKey,
              nextSigPublicKey: account.nextSigPublicKey,
              lastTransactionTimestamp: account.lastTransactionTimestamp
            };
          }
          try {
            await this.dal.updateAccount(
              account.address,
              accountUpdatePacket,
              height
            );
          } catch (error) {
            if (error.name === 'InvalidActionError') {
              this.logger.warn(error);
            } else {
              throw error;
            }
          }
        }
      })
    );
    let { signature, signatures, ...sanitizedBlock } = block;
    sanitizedBlock.signatureHash = this.sha256(signature);

    if (block.forgingPublicKey === forgerAccount.nextForgingPublicKey) {
      try {
        await this.dal.updateAccount(
          forgerAccount.address,
          {
            forgingPublicKey: block.forgingPublicKey,
            nextForgingPublicKey: block.nextForgingPublicKey
          },
          height
        );
      } catch (error) {
        if (error.name === 'InvalidActionError') {
          this.logger.warn(error);
        } else {
          throw error;
        }
      }
    }

    for (let voteChange of voteChangeList) {
      try {
        if (voteChange.type === 'vote') {
          await this.dal.addVote(voteChange.voterAddress, voteChange.delegateAddress);
        } else if (voteChange.type === 'unvote') {
          await this.dal.removeVote(voteChange.voterAddress, voteChange.delegateAddress);
        }
      } catch (error) {
        if (error.name === 'InvalidActionError') {
          this.logger.warn(error);
        } else {
          throw error;
        }
      }
    }

    for (let multisigRegistration of multisigRegistrationList) {
      let { multisigAddress, memberAddresses, requiredSignatureCount } = multisigRegistration;
      try {
        await this.dal.registerMultisig(multisigAddress, memberAddresses, requiredSignatureCount);
      } catch (error) {
        if (error.name === 'InvalidActionError') {
          this.logger.warn(error);
        } else {
          throw error;
        }
      }
    }

    await this.dal.addBlock(sanitizedBlock);

    for (let txn of transactions) {
      this.pendingTransactionMap.delete(txn.id);
    }

    this.latestProcessedBlock = block;
  }

  async verifyTransaction(transaction, fullCheck) {
    verifyTransactionSchema(transaction, this.maxSpendableDigits, this.networkSymbol);

    let { type, senderAddress, amount, fee, timestamp } = transaction;

    if (type === 'transfer') {
      verifyTransferTransactionSchema(transaction, this.maxSpendableDigits, this.networkSymbol);
    } else if (type === 'vote') {
      verifyVoteTransactionSchema(transaction, this.networkSymbol);
    } else if (type === 'unvote') {
      verifyUnvoteTransactionSchema(transaction, this.networkSymbol);
    } else if (type === 'registerMultisig') {
      verifyRegisterMultisigTransactionSchema(
        transaction,
        this.minMultisigMembers,
        this.maxMultisigMembers,
        this.networkSymbol
      );
    } else {
      throw new Error(
        `Transaction type ${type} was invalid`
      );
    }

    let txnAmount = amount || 0n;
    let txnFee = fee || 0n;
    let txnTotal = txnAmount + txnFee;

    if (fullCheck) {
      let minFee = this.minTransactionFees[type] || 0n;

      if (txnFee < minFee) {
        throw new Error(
          `Transaction fee ${
            txnFee
          } was below the minimum fee of ${
            minFee
          } for transactions of type ${
            type
          }`
        );
      }
    }

    let senderAccount;
    try {
      senderAccount = await this.dal.getAccount(senderAddress);
    } catch (error) {
      throw new Error(
        `Failed to fetch account ${senderAddress} because of error: ${error.message}`
      );
    }

    if (timestamp < senderAccount.lastTransactionTimestamp) {
      throw new Error(
        `Transaction was older than the last transaction processed from the sender ${
          senderAddress
        }`
      );
    }

    if (txnTotal > senderAccount.balance) {
      throw new Error(
        `Transaction amount plus fee was greater than the balance of sender ${
          senderAddress
        }`
      );
    }

    let { senderAddress } = transaction;

    if (senderAccount.type === ACCOUNT_TYPE_MULTISIG) {
      verifyMultisigTransactionSchema(
        transaction,
        fullCheck,
        senderAccount.multisigRequiredSignatureCount,
        this.networkSymbol
      );

      let multisigMemberAddresses;
      try {
        multisigMemberAddresses = await this.dal.getMultisigMembers(senderAddress);
      } catch (error) {
        throw new Error(
          `Failed to fetch member addresses for multisig wallet ${
            senderAddress
          } because of error: ${error.message}`
        );
      }

      let multisigMemberAccounts = {};
      try {
        let multisigMemberAccountList = await Promise.all(
          multisigMemberAddresses.map(memberAddress => this.dal.getAccount(memberAddress))
        );
        for (let memberAccount of multisigMemberAccountList) {
          multisigMemberAccounts[memberAccount.address] = memberAccount;
        }
      } catch (error) {
        throw new Error(
          `Failed to fetch member accounts for multisig wallet ${
            senderAddress
          } because of error: ${error.message}`
        );
      }
      if (fullCheck) {
        for (let signaturePacket of transaction.signatures) {
          let {
            signerAddress,
            signature,
            multisigPublicKey
          } = signaturePacket;

          if (!multisigMemberAccounts[signerAddress]) {
            throw new Error(
              `The signer with address ${
                signerAddress
              } was not a member of multisig wallet ${
                senderAccount.address
              }`
            );
          }
          let memberAccount = multisigMemberAccounts[signerAddress];
          if (
            multisigPublicKey !== memberAccount.multisigPublicKey &&
            multisigPublicKey !== memberAccount.nextMultisigPublicKey
          ) {
            throw new Error(
              `Transaction multisigPublicKey did not match the multisigPublicKey or nextMultisigPublicKey of account ${
                memberAccount.address
              }`
            );
          }
          if (!this.ldposClient.verifyMultisigTransactionSignature(transaction, multisigPublicKey, signature)) {
            throw new Error(
              `Multisig transaction signature of member ${
                memberAccount.address
              } was invalid`
            );
          }
        }
      }
    } else {
      verifySigTransactionSchema(transaction, fullCheck);

      if (
        transaction.sigPublicKey !== senderAccount.sigPublicKey &&
        transaction.sigPublicKey !== senderAccount.nextSigPublicKey
      ) {
        throw new Error(
          `Transaction sigPublicKey did not match the sigPublicKey or nextSigPublicKey of account ${
            senderAccount.address
          }`
        );
      }
      if (fullCheck && !this.ldposClient.verifyTransaction(transaction, transaction.sigPublicKey)) {
        throw new Error('Transaction signature was invalid');
      }
    }
  }

  async verifyBlock(block, lastBlock) {
    verifyBlockSchema(block, this.maxTransactionsPerBlock, this.networkSymbol);

    let expectedBlockHeight = lastBlock.height + 1;
    if (block.height !== expectedBlockHeight) {
      throw new Error(
        `Block height was invalid - Was ${block.height} but expected ${expectedBlockHeight}`
      );
    }
    if (block.timestamp % this.forgingInterval !== 0 || block.timestamp - lastBlock.timestamp < this.forgingInterval) {
      throw new Error(
        `Block timestamp ${block.timestamp} was invalid`
      );
    }
    let targetDelegateAddress = await this.getForgingDelegateAddressAtTimestamp(block.timestamp);
    if (block.forgerAddress !== targetDelegateAddress) {
      throw new Error(
        `The block forgerAddress ${
          block.forgerAddress
        } did not match the expected forger delegate address ${
          targetDelegateAddress
        }`
      );
    }
    let targetDelegateAccount;
    try {
      targetDelegateAccount = await this.dal.getAccount(targetDelegateAddress);
    } catch (error) {
      throw new Error(
        `Failed to fetch delegate account ${
          targetDelegateAddress
        } because of error: ${
          error.message
        }`
      );
    }
    if (
      block.forgingPublicKey !== targetDelegateAccount.forgingPublicKey &&
      block.forgingPublicKey !== targetDelegateAccount.nextForgingPublicKey
    ) {
      throw new Error(
        `Block forgingPublicKey did not match the forgingPublicKey or nextForgingPublicKey of delegate ${
          targetDelegateAccount.address
        }`
      );
    }
    if (!this.ldposClient.verifyBlock(block, block.forgingPublicKey, lastBlock.id)) {
      throw new Error(`Block ${block.id || 'without ID'} was invalid`);
    }

    try {
      for (let transaction of block.transactions) {
        await this.verifyTransaction(transaction, false);
      }
    } catch (error) {
      throw new Error(
        `Failed to validate transactions in block ${
          block.id || 'without ID'
        } because of error: ${
          error.message
        }`
      );
    }
  }

  async verifyBlockSignature(latestBlock, blockSignature) {
    verifyBlockSignatureSchema(blockSignature, this.networkSymbol);

    if (!latestBlock) {
      throw new Error('Cannot verify signature because there is no block pending');
    }
    let { signatures } = latestBlock;
    let { signature, signerAddress, blockId } = blockSignature;

    if (signatures && signatures[signerAddress]) {
      throw new Error(
        `Signature of block signer ${signerAddress} for blockId ${blockId} has already been received`
      );
    }

    if (latestBlock.id !== blockId) {
      throw new Error(`Signature blockId ${blockId} did not match the latest block id ${latestBlock.id}`);
    }
    let signerAccount;
    try {
      signerAccount = await this.dal.getAccount(signerAddress);
    } catch (error) {
      throw new Error(
        `Failed to fetch signer account ${signerAddress} because of error: ${error.message}`
      );
    }
    return this.ldposClient.verifyBlockSignature(latestBlock, signature, signerAccount.forgingPublicKey);
  }

  async broadcastBlock(block) {
    await this.channel.invoke('network:emit', {
      event: `${this.alias}:block`,
      data: block,
      peerLimit: NO_PEER_LIMIT
    });
  }

  async broadcastBlockSignature(signature) {
    await this.channel.invoke('network:emit', {
      event: `${this.alias}:blockSignature`,
      data: signature,
      peerLimit: NO_PEER_LIMIT
    });
  }

  async signBlock(block) {
    let signature = this.ldposClient.signBlock(block);
    let blockSignature = {
      blockId: block.id,
      signerAddress: this.ldposClient.getAccountAddress(),
      signature
    };
    return blockSignature;
  }

  async waitUntilNextBlockTimeSlot(options) {
    let { forgingInterval, timePollInterval } = options;
    let lastSlotIndex = Math.floor(Date.now() / forgingInterval);
    while (true) {
      if (!this.isActive) {
        break;
      }
      await this.wait(timePollInterval);
      let currentSlotIndex = Math.floor(Date.now() / forgingInterval);
      if (currentSlotIndex > lastSlotIndex) {
        break;
      }
    }
  }

  sortPendingTransactions(transactions) {
    // This sorting algorithm groups transactions based on the sender address and
    // sorts based on the average fee. This is necessary because the signature algorithm is
    // stateful so the algorithm should give priority to older transactions which
    // may have been signed using an older public key.
    let transactionGroupMap = {};
    for (let txn of transactions) {
      if (!transactionGroupMap[txn.senderAddress]) {
        transactionGroupMap[txn.senderAddress] = { transactions: [], totalFees: 0 };
      }
      let transactionGroup = transactionGroupMap[txn.senderAddress];
      transactionGroup.totalFees += txn.fee;
      transactionGroup.transactions.push(txn);
    }
    let transactionGroupList = Object.values(transactionGroupMap);
    for (let transactionGroup of transactionGroupList) {
      transactionGroup.transactions.sort((a, b) => {
        if (a.timestamp < b.timestamp) {
          return -1;
        }
        if (a.timestamp > b.timestamp) {
          return 1;
        }
        return 0;
      });
      transactionGroup.averageFee = transactionGroup.totalFees / transactionGroup.transactions.length;
    }

    transactionGroupList.sort((a, b) => {
      if (a.averageFee > b.averageFee) {
        return -1;
      }
      if (a.averageFee < b.averageFee) {
        return 1;
      }
      return 0;
    });

    let sortedTransactions = [];
    for (let transactionGroup of transactionGroupList) {
      for (let txn of transactionGroup.transactions) {
        sortedTransactions.push(txn);
      }
    }
    return sortedTransactions;
  }

  async startBlockProcessingLoop() {
    let options = this.options;
    let channel = this.channel;

    let {
      forgingInterval,
      forgingBlockBroadcastDelay,
      forgingSignatureBroadcastDelay,
      delegateCount,
      fetchBlockLimit,
      fetchBlockPause,
      fetchBlockEndConfirmations,
      propagationTimeout,
      propagationRandomness,
      timePollInterval,
      maxTransactionsPerBlock,
      minMultisigMembers,
      maxMultisigMembers,
      minTransactionFees
    } = options;

    this.delegateCount = delegateCount;
    this.forgingInterval = forgingInterval;
    this.propagationRandomness = propagationRandomness;
    this.maxTransactionsPerBlock = maxTransactionsPerBlock;
    this.minMultisigMembers = minMultisigMembers;
    this.maxMultisigMembers = maxMultisigMembers;

    let delegateMajorityCount = Math.ceil(delegateCount / 2);

    let ldposClient;
    let forgingWalletAddress;

    this.cryptoClientLibPath = options.cryptoClientLibPath || DEFAULT_CRYPTO_CLIENT_LIB_PATH;
    let { createClient } = require(this.cryptoClientLibPath);

    if (options.forgingPassphrase) {
      ldposClient = await createClient({
        passphrase: options.forgingPassphrase,
        adapter: this.dal
      });

      forgingWalletAddress = ldposClient.getAccountAddress();
    } else {
      ldposClient = await createClient({
        adapter: this.dal
      });
    }

    this.ldposClient = ldposClient;
    this.nodeHeight = await this.dal.getLatestHeight();
    this.latestProcessedBlock = await this.dal.getBlockAtHeight(this.nodeHeight);
    if (this.latestProcessedBlock == null) {
      this.latestProcessedBlock = {
        height: 1,
        timestamp: 0,
        transactions: [],
        previousBlockId: null,
        forgerAddress: null,
        forgingPublicKey: null,
        nextForgingPublicKey: null,
        id: null
      };
    }
    this.latestReceivedBlock = this.latestProcessedBlock;

    while (true) {
      if (!this.isActive) {
        break;
      }
      // If the node is already on the latest network height, it will just return it.
      this.networkHeight = await this.catchUpWithNetwork({
        forgingInterval,
        fetchBlockLimit,
        fetchBlockPause,
        fetchBlockEndConfirmations,
        delegateMajorityCount
      });
      this.nodeHeight = this.networkHeight;
      let nextHeight = this.networkHeight + 1;

      await this.waitUntilNextBlockTimeSlot({
        forgingInterval,
        timePollInterval
      });

      let currentForgingDelegateAddress = await this.getCurrentForgingDelegateAddress();
      let isCurrentForgingDelegate = forgingWalletAddress && forgingWalletAddress === currentForgingDelegateAddress;

      if (isCurrentForgingDelegate) {
        (async () => {
          let validTransactions = (
            await Promise.all(
              [...this.pendingTransactionMap.values()].map(
                async (pendingTxnPacket) => {
                  let pendingTxn = pendingTxnPacket.transaction;
                  try {
                    await this.verifyTransaction(pendingTxn, true);
                  } catch (error) {
                    this.logger.debug(
                      `Excluded transaction ${
                        pendingTxn.id
                      } from block because of error: ${
                        error.message
                      }`
                    );
                    this.pendingTransactionMap.delete(pendingTxn.id);
                    return null;
                  }
                  return pendingTxn;
                }
              )
            )
          ).filter(pendingTxn => pendingTxn);

          let pendingTransactions = this.sortPendingTransactions(validTransactions);
          let blockTransactions = pendingTransactions.slice(0, maxTransactionsPerBlock).map((txn) => {
            let { signature, ...simplifiedTxn } = txn;
            let signatureHash = this.sha256(signature);
            return {
              ...simplifiedTxn,
              signatureHash
            };
          });
          let blockTimestamp = this.getCurrentBlockTimeSlot(forgingInterval);
          let forgedBlock = this.forgeBlock(nextHeight, blockTimestamp, blockTransactions);
          await this.wait(forgingBlockBroadcastDelay);
          try {
            await this.broadcastBlock(forgedBlock);
          } catch (error) {
            this.logger.error(error);
          }
        })();
      }

      try {
        // Will throw if block is not received in time.
        latestBlock = await this.receiveLatestBlock(forgingBlockBroadcastDelay + propagationTimeout);

        if (forgingWalletAddress && !isCurrentForgingDelegate) {
          (async () => {
            try {
              let selfSignature = await this.signBlock(latestBlock);
              latestBlock.signatures[selfSignature.signerAddress] = selfSignature;
              await this.wait(forgingSignatureBroadcastDelay);
              if (this.latestDoubleForgedBlockTimestamp === latestBlock.timestamp) {
                throw new Error(
                  `Refused to send signature for block ${
                    latestBlock.id
                  } because delegate ${
                    latestBlock.forgerAddress
                  } tried to double-forge`
                );
              }
              await this.broadcastBlockSignature(selfSignature);
            } catch (error) {
              this.logger.error(error);
            }
          })();
        }

        // Will throw if the required number of valid signatures cannot be gathered in time.
        await this.receiveLatestBlockSignatures(latestBlock, delegateMajorityCount, forgingSignatureBroadcastDelay + propagationTimeout);
        await this.processBlock(latestBlock);
        this.latestFullySignedBlock = latestBlock;

        this.nodeHeight = nextHeight;
        this.networkHeight = nextHeight;
      } catch (error) {
        if (this.isActive) {
          this.logger.error(error);
        }
      }
    }
  }

  async broadcastTransaction(transaction) {
    return this.channel.invoke('network:emit', {
      event: `${this.alias}:transaction`,
      data: transaction,
      peerLimit: NO_PEER_LIMIT
    });
  }

  async startTransactionPropagationLoop() {
    this.channel.subscribe(`network:event:${this.alias}:transaction`, async (event) => {
      let transaction = event.data;

      try {
        await this.verifyTransaction(transaction, true);
      } catch (error) {
        this.logger.error(
          new Error(`Received invalid transaction ${transaction.id} - ${error.message}`)
        );
        return;
      }

      if (this.pendingTransactionMap.has(transaction.id)) {
        this.logger.error(
          new Error(`Transaction ${transaction.id} has already been received before`)
        );
        return;
      }
      this.pendingTransactionMap.set(transaction.id, { transaction, receivedTimestamp: Date.now() });

      // This is a performance optimization to ensure that peers
      // will not receive multiple instances of the same transaction at the same time.
      let randomPropagationDelay = Math.round(Math.random() * this.propagationRandomness);
      await this.wait(randomPropagationDelay);

      try {
        await this.broadcastTransaction(transaction);
      } catch (error) {
        this.logger.error(error);
      }
    });
  }

  async startBlockPropagationLoop() {
    let channel = this.channel;
    channel.subscribe(`network:event:${this.alias}:block`, async (event) => {
      let block = event.data;

      try {
        await this.verifyBlock(block, this.latestProcessedBlock);
        let currentBlockTimeSlot = this.getCurrentBlockTimeSlot(this.forgingInterval);
        if (block.timestamp !== currentBlockTimeSlot) {
          throw new Error(
            `Block timestamp ${block.timestamp} did not correspond to the current time slot ${currentBlockTimeSlot}`
          );
        }
      } catch (error) {
        this.logger.error(
          new Error(
            `Received invalid block ${block && block.id} - ${error.message}`
          )
        );
        return;
      }
      if (block.id === this.latestReceivedBlock.id) {
        this.logger.debug(
          new Error(`Block ${block.id} has already been received before`)
        );
        return;
      }

      // If double-forged block was received.
      if (block.timestamp === this.latestReceivedBlock.timestamp) {
        this.latestDoubleForgedBlockTimestamp = this.latestReceivedBlock.timestamp;
        this.logger.error(
          new Error(`Block ${block.id} was forged with the same timestamp as the last block ${this.latestReceivedBlock.id}`)
        );
        return;
      }
      if (block.height === this.latestReceivedBlock.height) {
        this.latestDoubleForgedBlockTimestamp = this.latestReceivedBlock.timestamp;
        this.logger.error(
          new Error(`Block ${block.id} was forged at the same height as the last block ${this.latestReceivedBlock.id}`)
        );
        return;
      }

      let { transactions } = block;
      for (let txn of transactions) {
        if (!this.pendingTransactionMap.has(txn.id)) {
          this.logger.error(
            new Error(`Block ${block.id} contained an unrecognized transaction ${txn.id}`)
          );
          return;
        }
        let pendingTxn = this.pendingTransactionMap.get(txn.id).transaction;
        let pendingTxnSignatureHash = this.sha256(pendingTxn.signature);
        if (txn.signatureHash !== pendingTxnSignatureHash) {
          this.logger.error(
            new Error(`Block ${block.id} contained a transaction ${txn.id} with an invalid signature hash`)
          );
          return;
        }
      }

      this.latestReceivedBlock = {
        ...block,
        signatures: []
      };

      this.verifiedBlockStream.write(this.latestReceivedBlock);

      // This is a performance optimization to ensure that peers
      // will not receive multiple instances of the same block at the same time.
      let randomPropagationDelay = Math.round(Math.random() * this.propagationRandomness);
      await this.wait(randomPropagationDelay);

      try {
        await this.broadcastBlock(block);
      } catch (error) {
        this.logger.error(error);
      }
    });
  }

  async startBlockSignaturePropagationLoop() {
    let channel = this.channel;
    channel.subscribe(`network:event:${this.alias}:blockSignature`, async (event) => {
      let blockSignature = event.data;

      try {
        await this.verifyBlockSignature(this.latestReceivedBlock, blockSignature);
      } catch (error) {
        this.logger.error(
          new Error(`Received invalid block signature - ${error.message}`)
        );
        return;
      }

      let { signatures } = this.latestReceivedBlock;

      if (signatures[blockSignature.signerAddress]) {
        this.logger.error(
          new Error(`Block signature of signer ${blockSignature.signerAddress} has already been received before`)
        );
        return;
      }

      this.verifiedBlockSignatureStream.write(blockSignature);

      // This is a performance optimization to ensure that peers
      // will not receive multiple instances of the same signature at the same time.
      let randomPropagationDelay = Math.round(Math.random() * this.propagationRandomness);
      await this.wait(randomPropagationDelay);

      try {
        await this.broadcastBlockSignature(blockSignature);
      } catch (error) {
        this.logger.error(error);
      }
    });
  }

  cleanupPendingTransactionMap(expiry) {
    let now = Date.now();

    let expiredTransactionList = [...this.pendingTransactionMap.values()]
      .filter(pendingTxn => now - pendingTxn.receivedTimestamp >= expiry)
      .map(pendingTxn => pendingTxn.transaction);

    for (let txn of expiredTransactionList) {
      this.pendingTransactionMap.delete(txn.id);
    }
  }

  async startPendingTransactionExpiryLoop() {
    this._pendingTransactionExpiryCheckIntervalId = setInterval(() => {
      this.cleanupPendingTransactionMap(this.pendingTransactionExpiry);
    }, this.pendingTransactionExpiryCheckInterval);
  }

  async load(channel, options) {
    this.channel = channel;
    this.isActive = true;

    let defaultOptions = {
      forgingInterval: DEFAULT_FORGING_INTERVAL,
      delegateCount: DEFAULT_DELEGATE_COUNT,
      fetchBlockLimit: DEFAULT_FETCH_BLOCK_LIMIT,
      fetchBlockPause: DEFAULT_FETCH_BLOCK_PAUSE,
      fetchBlockEndConfirmations: DEFAULT_FETCH_BLOCK_END_CONFIRMATIONS,
      forgingBlockBroadcastDelay: DEFAULT_FORGING_BLOCK_BROADCAST_DELAY,
      forgingSignatureBroadcastDelay: DEFAULT_FORGING_SIGNATURE_BROADCAST_DELAY,
      propagationTimeout: DEFAULT_PROPAGATION_TIMEOUT,
      propagationRandomness: DEFAULT_PROPAGATION_RANDOMNESS,
      timePollInterval: DEFAULT_TIME_POLL_INTERVAL,
      maxTransactionsPerBlock: DEFAULT_MAX_TRANSACTIONS_PER_BLOCK,
      minMultisigMembers: DEFAULT_MIN_MULTISIG_MEMBERS,
      maxMultisigMembers: DEFAULT_MAX_MULTISIG_MEMBERS,
      pendingTransactionExpiry: DEFAULT_PENDING_TRANSACTION_EXPIRY,
      pendingTransactionExpiryCheckInterval: DEFAULT_PENDING_TRANSACTION_EXPIRY_CHECK_INTERVAL,
      maxSpendableDigits: DEFAULT_MAX_SPENDABLE_DIGITS
    };
    this.options = {...defaultOptions, ...options};

    let unsanitizedMinTransactionFees = {
      ...DEFAULT_MIN_TRANSACTION_FEES,
      ...this.options.minTransactionFees
    };
    let minTransactionFees = {};
    let transactionTypeList = Object.keys(unsanitizedMinTransactionFees);
    for (let transactionType of transactionTypeList) {
      minTransactionFees[transactionType] = BigInt(unsanitizedMinTransactionFees[transactionType]);
    }
    this.options.minTransactionFees = minTransactionFees;
    this.minTransactionFees = minTransactionFees;

    this.pendingTransactionExpiry = this.options.pendingTransactionExpiry;
    this.pendingTransactionExpiryCheckInterval = this.options.pendingTransactionExpiryCheckInterval;
    this.maxSpendableDigits = this.options.maxSpendableDigits;

    this.genesis = require(options.genesisPath || DEFAULT_GENESIS_PATH);
    await this.dal.init({
      genesis: this.genesis
    });

    this.networkSymbol = await this.dal.getNetworkSymbol();

    this.startPendingTransactionExpiryLoop();
    this.startTransactionPropagationLoop();
    this.startBlockPropagationLoop();
    this.startBlockSignaturePropagationLoop();
    this.startBlockProcessingLoop();

    channel.publish(`${this.alias}:bootstrap`);
  }

  async unload() {
    this.isActive = false;
    clearInterval(this._pendingTransactionExpiryCheckIntervalId);
  }

  async wait(duration) {
    return new Promise((resolve) => {
      setTimeout(resolve, duration);
    });
  }
};
