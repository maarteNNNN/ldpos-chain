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
const { verifyBlockSignaturesSchema } = require('./schemas/block-signatures-schema');
const { verifyBlockSignatureSchema } = require('./schemas/block-signature-schema');
const { verifyMultisigTransactionSchema } = require('./schemas/multisig-transaction-schema');

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
const DEFAULT_MAX_MULTISIG_MEMBERS = 20;

// TODO 222: Make sure that all external data is validated with schema.

const DEFAULT_MIN_TRANSACTION_FEES = {
  transfer: '10000000',
  vote: '20000000',
  unvote: '20000000',
  registerMultisig: '50000000'
};

const NO_PEER_LIMIT = -1;

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
        try {
          let latestBlockSignatures = await this.channel.invoke('network:request', {
            procedure: `${this.alias}:getLatestBlockSignatures`,
            data: {
              blockId: this.latestProcessedBlock.id
            }
          });
          verifyBlockSignaturesSchema(latestBlockSignatures, delegateMajorityCount);

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
      let { type } = txn;
      if (type === 'transfer') {
        let { senderAddress, recipientAddress, amount, fee } = txn;
        let txnAmount = BigInt(amount);
        let txnFee = BigInt(fee);
        let senderAccount = accounts[senderAddress];
        let recipientAccount = accounts[recipientAddress];
        if (senderAccount.updateHeight < height) {
          senderAccount.balance = senderAccount.balance - txnAmount - txnFee;
        }
        if (recipientAccount.updateHeight < height) {
          recipientAccount.balance = recipientAccount.balance + txnAmount;
        }
      } else {
        let { senderAddress, fee } = txn;
        let txnFee = BigInt(fee);
        let senderAccount = accounts[senderAddress];
        if (senderAccount.updateHeight < height) {
          senderAccount.balance = senderAccount.balance - txnFee;
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
          try {
            await this.dal.updateAccount(account.address, { balance: account.balance }, height);
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

  async verifySimplifiedTransaction(transaction, enforceMinFee) {
    verifyTransactionSchema(transaction);

    let { senderAddress, amount, fee, type } = transaction;

    if (type === 'transfer') {
      verifyTransferTransactionSchema(transaction);
    } else if (type === 'vote') {
      verifyVoteTransactionSchema(transaction);
    } else if (type === 'unvote') {
      verifyUnvoteTransactionSchema(transaction);
    } else if (type === 'registerMultisig') {
      verifyRegisterMultisigTransactionSchema(transaction, this.maxMultisigMembers);
    } else {
      throw new Error(
        `Transaction type ${type} was invalid`
      );
    }

    let txnAmount = amount || 0n;
    let txnFee = fee || 0n;
    let txnTotal = txnAmount + txnFee;

    if (enforceMinFee) {
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

    if (txnTotal > senderAccount.balance) {
      throw new Error(
        `Transaction amount plus fee was greater than the balance of sender ${
          senderAddress
        }`
      );
    }

    return senderAccount;
  }

  async verifyTransaction(transaction) {
    let senderAccount = await this.verifySimplifiedTransaction(transaction, true);
    let { senderAddress } = transaction;

    if (senderAccount.type === 'multisig') {
      verifyMultisigTransactionSchema(transaction, senderAccount.multisigRequiredSignatureCount);

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
      for (let signaturePacket of transaction.signatures) {
        let { signerAddress, signature } = signaturePacket;

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
        let signerPublicKey = memberAccount.multisigPublicKey;
        if (!this.ldposClient.verifyMultisigTransactionSignature(transaction, signerPublicKey, signature)) {
          throw new Error(
            `Multisig transaction signature of member ${
              memberAccount.address
            } was invalid`
          );
        }
      }
    } else {
      if (!this.ldposClient.verifyTransaction(transaction, senderAccount.sigPublicKey)) {
        throw new Error('Transaction signature was invalid');
      }
    }
  }

  async verifyBlock(block, lastBlock) {
    verifyBlockSchema(block, this.maxTransactionsPerBlock);

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
    let forgingPublicKey;
    if (block.forgingPublicKey === targetDelegateAccount.forgingPublicKey) {
      forgingPublicKey = targetDelegateAccount.forgingPublicKey;
      if (!forgingPublicKey) {
        throw new Error(
          `Delegate ${
            targetDelegateAccount.address
          } did not have a forgingPublicKey`
        );
      }
    } else if (block.forgingPublicKey === targetDelegateAccount.nextForgingPublicKey) {
      if (!targetDelegateAccount.nextForgingPublicKey) {
        throw new Error(
          `Failed to increment the forging key for delegate ${
            targetDelegateAccount.address
          } because it did not have a nextForgingPublicKey`
        );
      }
      forgingPublicKey = targetDelegateAccount.nextForgingPublicKey;
    } else {
      throw new Error(
        `Block forgingPublicKey did not match the forgingPublicKey or nextForgingPublicKey of delegate ${
          targetDelegateAccount.address
        }`
      );
    }
    if (!this.ldposClient.verifyBlock(block, forgingPublicKey, lastBlock.id)) {
      throw new Error(`Block ${block.id || 'without ID'} was invalid`);
    }

    try {
      for (let transaction of block.transactions) {
        await this.verifySimplifiedTransaction(transaction, false);
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
    verifyBlockSignatureSchema(blockSignature);

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
      maxMultisigMembers,
      minTransactionFees
    } = options;

    if (forgingInterval == null) {
      forgingInterval = DEFAULT_FORGING_INTERVAL;
    }
    if (delegateCount == null) {
      delegateCount = DEFAULT_DELEGATE_COUNT;
    }
    if (fetchBlockLimit == null) {
      fetchBlockLimit = DEFAULT_FETCH_BLOCK_LIMIT;
    }
    if (fetchBlockPause == null) {
      fetchBlockPause = DEFAULT_FETCH_BLOCK_PAUSE;
    }
    if (fetchBlockEndConfirmations == null) {
      fetchBlockEndConfirmations = DEFAULT_FETCH_BLOCK_END_CONFIRMATIONS;
    }
    if (forgingBlockBroadcastDelay == null) {
      forgingBlockBroadcastDelay = DEFAULT_FORGING_BLOCK_BROADCAST_DELAY;
    }
    if (forgingSignatureBroadcastDelay == null) {
      forgingSignatureBroadcastDelay = DEFAULT_FORGING_SIGNATURE_BROADCAST_DELAY;
    }
    if (propagationTimeout == null) {
      propagationTimeout = DEFAULT_PROPAGATION_TIMEOUT;
    }
    if (propagationRandomness == null) {
      propagationRandomness = DEFAULT_PROPAGATION_RANDOMNESS;
    }
    if (timePollInterval == null) {
      timePollInterval = DEFAULT_TIME_POLL_INTERVAL;
    }
    if (maxTransactionsPerBlock == null) {
      maxTransactionsPerBlock = DEFAULT_MAX_TRANSACTIONS_PER_BLOCK;
    }
    if (maxMultisigMembers == null) {
      maxMultisigMembers = DEFAULT_MAX_MULTISIG_MEMBERS;
    }

    this.delegateCount = delegateCount;
    this.forgingInterval = forgingInterval;
    this.propagationRandomness = propagationRandomness;
    this.maxTransactionsPerBlock = maxTransactionsPerBlock;
    this.maxMultisigMembers = maxMultisigMembers;
    let unsanitizedMinTransactionFees = {
      ...DEFAULT_MIN_TRANSACTION_FEES,
      ...minTransactionFees
    };
    this.minTransactionFees = {};
    let transactionTypeList = Object.keys(unsanitizedMinTransactionFees);
    for (let transactionType of transactionTypeList) {
      this.minTransactionFees[transactionType] = BigInt(unsanitizedMinTransactionFees[transactionType]);
    }

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
          let pendingTransactions = [...this.pendingTransactionMap.values()];
          // Sort by fee from highest to lowest.
          pendingTransactions.sort((a, b) => {
            if (a.fee > b.fee) {
              return -1;
            }
            if (a.fee < b.fee) {
              return 1;
            }
            return 0;
          });
          let blockTransactions = pendingTransactions.slice(0, maxTransactionsPerBlock).map((txn) => {
            let { signature, ...txnWithoutSignature } = txn;
            let signatureHash = this.sha256(signature);
            return {
              ...txnWithoutSignature,
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
        await this.verifyTransaction(transaction);
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
      this.pendingTransactionMap.set(transaction.id, transaction);

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
            `Block ${block.id} timestamp ${block.timestamp} did not correspond to the current time slot`
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
        let pendingTxn = this.pendingTransactionMap.get(txn.id);
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

  async load(channel, options) {
    this.options = options;
    this.channel = channel;
    this.isActive = true;

    this.genesis = require(options.genesisPath || DEFAULT_GENESIS_PATH);
    await this.dal.init({
      genesis: this.genesis
    });

    this.startTransactionPropagationLoop();
    this.startBlockPropagationLoop();
    this.startBlockSignaturePropagationLoop();
    this.startBlockProcessingLoop();

    channel.publish(`${this.alias}:bootstrap`);
  }

  async unload() {
    this.isActive = false;
  }

  async wait(duration) {
    return new Promise((resolve) => {
      setTimeout(resolve, duration);
    });
  }
};
