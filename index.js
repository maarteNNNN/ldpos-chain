const crypto = require('crypto');
const shuffle = require('lodash.shuffle');
const WritableConsumableStream = require('writable-consumable-stream');

const genesisBlock = require('./genesis/testnet/genesis.json');
const pkg = require('./package.json');

const { validateBlockSchema } = require('./schemas/block-schema');
const { validateTransactionSchema } = require('./schemas/transaction-schema');
const { validateBlockSignatureSchema } = require('./schemas/block-signature-schema');
const { validateMultisigTransactionSchema } = require('./schemas/multisig-transaction-schema');
const { validateSigTransactionSchema } = require('./schemas/sig-transaction-schema');

const DEFAULT_MODULE_ALIAS = 'ldpos_chain';
const DEFAULT_GENESIS_PATH = './genesis/mainnet/genesis.json';
const DEFAULT_CRYPTO_CLIENT_LIB_PATH = 'ldpos-client';
const DEFAULT_DELEGATE_COUNT = 11;
const DEFAULT_MAX_EXTRA_BLOCK_SIGNATURES_TO_STORE = 5;
const DEFAULT_FORGING_INTERVAL = 30000;
const DEFAULT_FETCH_BLOCK_LIMIT = 10;
const DEFAULT_FETCH_BLOCK_PAUSE = 100;
const DEFAULT_FETCH_BLOCK_END_CONFIRMATIONS = 10;
const DEFAULT_FORGING_BLOCK_BROADCAST_DELAY = 2000;
const DEFAULT_FORGING_SIGNATURE_BROADCAST_DELAY = 5000;
const DEFAULT_PROPAGATION_TIMEOUT = 5000;
const DEFAULT_PROPAGATION_RANDOMNESS = 10000;
const DEFAULT_TIME_POLL_INTERVAL = 200;
const DEFAULT_MIN_TRANSACTIONS_PER_BLOCK = 1;
const DEFAULT_MAX_TRANSACTIONS_PER_BLOCK = 300;
const DEFAULT_MIN_MULTISIG_MEMBERS = 1;
const DEFAULT_MAX_MULTISIG_MEMBERS = 20;
const DEFAULT_PENDING_TRANSACTION_EXPIRY = 604800000; // 1 week
const DEFAULT_PENDING_TRANSACTION_EXPIRY_CHECK_INTERVAL = 3600000; // 1 hour
const DEFAULT_MAX_SPENDABLE_DIGITS = 25;
const DEFAULT_MAX_TRANSACTION_MESSAGE_LENGTH = 256;
const DEFAULT_MAX_VOTES_PER_ACCOUNT = 21;
const DEFAULT_MAX_PENDING_TRANSACTIONS_PER_ACCOUNT = 30;
const DEFAULT_MAX_CONSECUTIVE_BLOCK_FETCH_FAILURES = 5;

const DEFAULT_MIN_TRANSACTION_FEES = {
  transfer: '10000000',
  vote: '20000000',
  unvote: '20000000',
  registerSigDetails: '10000000',
  registerMultisigDetails: '10000000',
  registerForgingDetails: '10000000',
  registerMultisigWallet: '50000000'
};

const NO_PEER_LIMIT = -1;
const ACCOUNT_TYPE_MULTISIG = 'multisig';

module.exports = class LDPoSChainModule {
  constructor(options) {
    this.alias = options.alias || DEFAULT_MODULE_ALIAS;
    this.logger = options.logger || console;
    let { config } = options;
    let dalConfig = config.dal || {};

    if (!dalConfig.libPath) {
      throw new Error(
        'The LDPoSChainModule config needs to have a dal.libPath property'
      );
    }
    const DAL = require(dalConfig.libPath);
    this.dal = new DAL(dalConfig);

    this.pendingTransactionStreams = {};
    this.pendingBlocks = [];
    this.topActiveDelegates = [];
    this.topActiveDelegateAddressSet = new Set();
    this.lastFullySignedBlock = null;
    this.lastProcessedBlock = null;
    this.lastReceivedBlock = this.lastProcessedBlock;

    this.verifiedBlockInfoStream = new WritableConsumableStream();
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
      'chainChanges',
      'transaction'
    ];
  }

  get actions() {
    return {
      getNetworkSymbol: {
        handler: async action => {
          return this.networkSymbol;
        },
        isPublic: true
      },
      postTransaction: {
        handler: async action => {
          return this.postTransaction(action.params.transaction);
        },
        isPublic: true
      },
      getNodeStatus: {
        handler: async () => {}
      },
      getAccount: {
        handler: async action => {
          let { walletAddress } = action.params;
          return this.dal.getAccount(walletAddress);
        },
        isPublic: true
      },
      getTransactionsFromBlock: {
        handler: async action => {
          let { blockId, offset, limit } = action.params;
          return this.dal.getTransactionsFromBlock(blockId, offset, limit);
        }
      },
      getMultisigWalletMembers: {
        handler: async action => {
          let { walletAddress } = action.params;
          return this.dal.getMultisigWalletMembers(walletAddress);
        }
      },
      getMinMultisigRequiredSignatures: {
        handler: async action => {
          let { walletAddress } = action.params;
          let account = await this.getSanitizedAccount(walletAddress);
          if (account.type !== 'multisig') {
            let error = new Error(
              `Account ${walletAddress} was not a multisig wallet`
            );
            error.name = 'AccountWasNotMultisigError';
            error.type = 'InvalidActionError';
            throw error;
          }
          return account.requiredSignatureCount;
        }
      },
      getOutboundTransactions: {
        handler: async action => {
          let { walletAddress, fromTimestamp, limit } = action.params;
          return this.dal.getOutboundTransactions(walletAddress, fromTimestamp, limit);
        }
      },
      getInboundTransactionsFromBlock: {
        handler: async action => {
          let { walletAddress, blockId } = action.params;
          return this.dal.getInboundTransactionsFromBlock(walletAddress, blockId);
        }
      },
      getOutboundTransactionsFromBlock: {
        handler: async action => {
          let { walletAddress, blockId } = action.params;
          return this.dal.getOutboundTransactionsFromBlock(walletAddress, blockId);
        }
      },
      getLastBlockAtTimestamp: {
        handler: async action => {
          let { timestamp } = action.params;
          let block = await this.dal.getLastBlockAtTimestamp(timestamp);
          return this.simplifyBlock(block);
        }
      },
      getMaxBlockHeight: {
        handler: async action => {
          return this.dal.getMaxBlockHeight();
        }
      },
      getBlocksFromHeight: {
        handler: async action => {
          let { height, limit } = action.params;
          let blocks = await this.dal.getBlocksFromHeight(height, limit);
          return blocks.map((block) => {
            return this.simplifyBlock(block);
          });
        }
      },
      getSignedBlocksFromHeight: {
        handler: async action => {
          let { height, limit } = action.params;
          return this.dal.getBlocksFromHeight(height, limit);
        },
        isPublic: true
      },
      getBlocksBetweenHeights: {
        handler: async action => {
          let { fromHeight, toHeight, limit } = action.params;
          let blocks = await this.dal.getBlocksBetweenHeights(fromHeight, toHeight, limit);
          return blocks.map((block) => {
            return this.simplifyBlock(block);
          });
        }
      },
      getBlockAtHeight: {
        handler: async action => {
          let { height } = action.params;
          let block = await this.dal.getBlockAtHeight(height);
          return this.simplifyBlock(block);
        }
      },
      getModuleOptions: {
        handler: async action => this.options
      },
      getForgingDelegates: {
        handler: async action => {
          return this.getForgingDelegates();
        },
        isPublic: true
      }
    };
  }

  simplifyBlock(signedBlock) {
    let { transactions, forgerSignature, signatures, ...simpleBlock } = signedBlock;
    simpleBlock.numberOfTransactions = transactions.length;
    return simpleBlock;
  }

  async catchUpWithNetwork(options) {
    let {
      forgingInterval,
      fetchBlockEndConfirmations,
      fetchBlockLimit,
      fetchBlockPause,
      blockSignerMajorityCount,
      maxConsecutiveBlockFetchFailures
    } = options;

    let now = Date.now();
    if (
      Math.floor(this.lastProcessedBlock.timestamp / forgingInterval) >= Math.floor(now / forgingInterval)
    ) {
      return this.lastProcessedBlock.height;
    }

    this.logger.info('Attempting to catch up with the network');

    let consecutiveFailureCounter = 0;

    while (true) {
      if (!this.isActive) {
        break;
      }

      let nextBlockHeight = this.lastProcessedBlock.height + 1;
      this.logger.info(
        `Fetching new blocks from network starting at height ${nextBlockHeight}`
      );

      let newBlocks;
      try {
        newBlocks = await this.channel.invoke('network:request', {
          procedure: `${this.alias}:getSignedBlocksFromHeight`,
          data: {
            height: nextBlockHeight,
            limit: fetchBlockLimit
          }
        });
        if (!Array.isArray(newBlocks)) {
          throw new Error('Response to getBlocksFromHeight action must be an array');
        }
        if (newBlocks.length > fetchBlockLimit) {
          throw new Error(
            `Peer getBlocksFromHeight action must not return more than ${
              fetchBlockLimit
            } blocks`
          );
        }
        consecutiveFailureCounter = 0;
      } catch (error) {
        this.logger.warn(
          new Error(
            `Failed to invoke getSignedBlocksFromHeight action on network because of error: ${
              error.message
            }`
          )
        );
        if (++consecutiveFailureCounter > maxConsecutiveBlockFetchFailures) {
          break;
        }
        await this.wait(fetchBlockPause);
        continue;
      }

      if (!newBlocks.length) {
        // If there are no new blocks, assume that we've finished synching.
        break;
      }

      try {
        for (let block of newBlocks) {
          validateBlockSchema(
            block,
            this.minTransactionsPerBlock,
            this.maxTransactionsPerBlock,
            blockSignerMajorityCount,
            this.delegateCount,
            this.networkSymbol
          );
          let senderAccountDetails = await this.verifyFullySignedBlock(block, this.lastProcessedBlock);
          await this.processBlock(block, senderAccountDetails, true);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to process block while catching up with the network - ${error.message}`
        );
      }

      await this.wait(fetchBlockPause);
    }

    this.logger.info('Stopped catching up with the network');
    return this.lastProcessedBlock.height;
  }

  async receiveLastBlockInfo(timeout) {
    return this.verifiedBlockInfoStream.once(timeout);
  }

  async receiveLastBlockSignatures(lastBlock, requiredSignatureCount, timeout) {
    if (!requiredSignatureCount) {
      return;
    }
    let signerSet = new Set();
    while (true) {
      let startTime = Date.now();
      let blockSignature;
      try {
        blockSignature = await this.verifiedBlockSignatureStream.once(timeout);
      } catch (error) {
        throw new Error(
          `Failed to receive enough block signatures before timeout - Only received ${
            signerSet.size
          } out of ${
            requiredSignatureCount
          } required signatures`
        );
      }
      let { blockId } = blockSignature;
      if (blockId === lastBlock.id) {
        lastBlock.signatures[blockSignature.signerAddress] = blockSignature;
        signerSet.add(blockSignature.signerAddress);
      }
      if (signerSet.size >= requiredSignatureCount) {
        break;
      }
      let timeDiff = Date.now() - startTime;
      timeout -= timeDiff;
      if (timeout < 0) {
        timeout = 0;
      }
    }
    return lastBlock.signatures;
  }

  getCurrentBlockTimeSlot(forgingInterval) {
    return Math.floor(Date.now() / forgingInterval) * forgingInterval;
  }

  getForgingDelegateAddressAtTimestamp(timestamp) {
    let activeDelegates = this.topActiveDelegates;
    let slotIndex = Math.floor(timestamp / this.forgingInterval);
    let targetIndex = slotIndex % activeDelegates.length;
    return activeDelegates[targetIndex].address;
  }

  getCurrentForgingDelegateAddress() {
    return this.getForgingDelegateAddressAtTimestamp(Date.now());
  }

  sha256(message, encoding) {
    return crypto.createHash('sha256').update(message, 'utf8').digest(encoding || 'base64');
  }

  forgeBlock(height, timestamp, transactions) {
    let block = {
      height,
      timestamp,
      previousBlockId: this.lastProcessedBlock ? this.lastProcessedBlock.id : null,
      transactions
    };
    return this.ldposClient.prepareBlock(block);
  }

  async getSanitizedAccount(walletAddress) {
    let account = await this.dal.getAccount(walletAddress);
    return {
      ...account,
      balance: BigInt(account.balance)
    };
  }

  async getSanitizedTransaction(transactionId) {
    let transaction = await this.dal.getTransaction(transactionId);
    return {
      ...transaction,
      amount: BigInt(transaction.amount),
      fee: BigInt(transaction.fee)
    };
  }

  simplifyTransaction(transaction) {
    let { senderSignature, signatures, ...txnWithoutSignatures} = transaction;
    if (signatures) {
      // If multisig transaction
      return {
        ...txnWithoutSignatures,
        signatures: signatures.map(signaturePacket => {
          let { signature, ...signaturePacketWithoutSignature } = signaturePacket;
          return {
            ...signaturePacketWithoutSignature,
            signatureHash: this.sha256(signature)
          };
        })
      };
    }
    // If regular sig transaction
    return {
      ...txnWithoutSignatures,
      senderSignatureHash: this.sha256(senderSignature)
    };
  }

  async getForgingDelegates() {
    return this.topActiveDelegates;
  }

  async fetchTopActiveDelegates() {
    this.topActiveDelegates = await this.dal.getTopActiveDelegates(this.delegateCount);
    this.topActiveDelegateAddressSet = new Set(this.topActiveDelegates.map(delegate => delegate.address));
  }

  async processBlock(block, senderAccountDetails, synched) {
    this.logger.info(`Started processing block ${block.id}`);
    let { transactions, height, signatures: blockSignatureList } = block;
    let senderAddressSet = new Set();
    let recipientAddressSet = new Set();
    let multisigMemberAddressSet = new Set();

    for (let txn of transactions) {
      senderAddressSet.add(txn.senderAddress);
      if (txn.recipientAddress) {
        recipientAddressSet.add(txn.recipientAddress);
      }
      // For multisig transaction, add all signer accounts.
      if (txn.signatures) {
        for (let signaturePacket of txn.signatures) {
          multisigMemberAddressSet.add(signaturePacket.signerAddress);
        }
      }
    }
    let blockSignerAddressSet = new Set(blockSignatureList.map(blockSignature => blockSignature.signerAddress));

    let affectedAddressSet = new Set([
      ...senderAddressSet,
      ...recipientAddressSet,
      ...multisigMemberAddressSet,
      ...blockSignerAddressSet,
      block.forgerAddress
    ]);

    let affectedAccountList = await Promise.all(
      [...affectedAddressSet].map(async (address) => {
        if (senderAccountDetails[address]) {
          return senderAccountDetails[address].senderAccount;
        }
        let account;
        try {
          account = await this.getSanitizedAccount(address);
        } catch (error) {
          if (error.name === 'AccountDidNotExistError') {
            return {
              address,
              type: 'sig',
              balance: 0n
            };
          } else {
            throw new Error(
              `Failed to fetch account during block processing because of error: ${
                error.message
              }`
            );
          }
        }
        return account;
      })
    );

    let affectedAccountDetails = {};
    for (let account of affectedAccountList) {
      affectedAccountDetails[account.address] = {
        account,
        changes: {
          balance: account.balance
        }
      };
    }

    let forgerAccountChanges = affectedAccountDetails[block.forgerAddress].changes;
    forgerAccountChanges.forgingPublicKey = block.forgingPublicKey;
    forgerAccountChanges.nextForgingPublicKey = block.nextForgingPublicKey;
    forgerAccountChanges.nextForgingKeyIndex = block.nextForgingKeyIndex;

    for (let blockSignature of blockSignatureList) {
      let blockSignerAccountChanges = affectedAccountDetails[blockSignature.signerAddress].changes;
      blockSignerAccountChanges.forgingPublicKey = blockSignature.forgingPublicKey;
      blockSignerAccountChanges.nextForgingPublicKey = blockSignature.nextForgingPublicKey;
      blockSignerAccountChanges.nextForgingKeyIndex = blockSignature.nextForgingKeyIndex;
    }

    let voteChangeList = [];
    let multisigRegistrationList = [];
    let totalBlockFees = 0n;

    for (let txn of transactions) {
      let {
        type,
        senderAddress,
        fee,
        timestamp,
        signatures,
        sigPublicKey,
        nextSigPublicKey,
        nextSigKeyIndex
      } = txn;
      let senderAccountChanges = affectedAccountDetails[senderAddress].changes;

      let txnFee = BigInt(fee);
      totalBlockFees += txnFee;

      if (signatures) {
        for (let signaturePacket of signatures) {
          let memberAccountChanges = affectedAccountDetails[signaturePacket.signerAddress].changes;
          memberAccountChanges.multisigPublicKey = signaturePacket.multisigPublicKey;
          memberAccountChanges.nextMultisigPublicKey = signaturePacket.nextMultisigPublicKey;
          memberAccountChanges.nextMultisigKeyIndex = signaturePacket.nextMultisigKeyIndex;
        }
      } else {
        // If regular transaction (not multisig), update the account sig public keys.
        senderAccountChanges.sigPublicKey = sigPublicKey;
        senderAccountChanges.nextSigPublicKey = nextSigPublicKey;
        senderAccountChanges.nextSigKeyIndex = nextSigKeyIndex;
      }

      if (type === 'transfer') {
        let { recipientAddress, amount } = txn;
        let txnAmount = BigInt(amount);

        let recipientAccountChanges = affectedAccountDetails[recipientAddress].changes;
        senderAccountChanges.balance -= txnAmount + txnFee;
        senderAccountChanges.lastTransactionTimestamp = timestamp;
        recipientAccountChanges.balance += txnAmount;
      } else {
        senderAccountChanges.balance -= txnFee;
        senderAccountChanges.lastTransactionTimestamp = timestamp;
        if (type === 'vote' || type === 'unvote') {
          voteChangeList.push({
            type,
            voterAddress: senderAddress,
            delegateAddress: txn.delegateAddress
          });
        } else if (type === 'registerSigDetails') {
          let {
            newSigPublicKey,
            newNextSigPublicKey,
            newNextSigKeyIndex
          } = txn;
          senderAccountChanges.sigPublicKey = newSigPublicKey;
          senderAccountChanges.nextSigPublicKey = newNextSigPublicKey;
          senderAccountChanges.nextSigKeyIndex = newNextSigKeyIndex;
        } else if (type === 'registerMultisigDetails') {
          let {
            newMultisigPublicKey,
            newNextMultisigPublicKey,
            newNextMultisigKeyIndex
          } = txn;
          senderAccountChanges.multisigPublicKey = newMultisigPublicKey;
          senderAccountChanges.nextMultisigPublicKey = newNextMultisigPublicKey;
          senderAccountChanges.nextMultisigKeyIndex = newNextMultisigKeyIndex;
        } else if (type === 'registerForgingDetails') {
          let {
            newForgingPublicKey,
            newNextForgingPublicKey,
            newNextForgingKeyIndex
          } = txn;
          senderAccountChanges.forgingPublicKey = newForgingPublicKey;
          senderAccountChanges.nextForgingPublicKey = newNextForgingPublicKey;
          senderAccountChanges.nextForgingKeyIndex = newNextForgingKeyIndex;
        } else if (type === 'registerMultisigWallet') {
          multisigRegistrationList.push({
            multisigAddress: senderAddress,
            memberAddresses: txn.memberAddresses,
            requiredSignatureCount: txn.requiredSignatureCount
          });
        }
      }
      this.logger.info(`Processed transaction ${txn.id}`);
    }

    forgerAccountChanges.balance += totalBlockFees;

    await Promise.all(
      [...affectedAddressSet].map(async (affectedAddress) => {
        let accountInfo = affectedAccountDetails[affectedAddress];
        let { account } = accountInfo;
        let accountChanges = accountInfo.changes;
        let accountUpdatePacket = {
          ...accountChanges,
          balance: accountChanges.balance.toString(),
          updateHeight: height
        };
        try {
          if (account.updateHeight == null) {
            await this.dal.upsertAccount({
              ...account,
              ...accountUpdatePacket
            });
          } else if (account.updateHeight < height) {
            await this.dal.updateAccount(
              account.address,
              accountUpdatePacket
            );
          }
        } catch (error) {
          if (error.type === 'InvalidActionError') {
            this.logger.warn(error);
          } else {
            throw error;
          }
        }
      })
    );

    for (let voteChange of voteChangeList) {
      try {
        if (voteChange.type === 'vote') {
          let accountVotes;
          try {
            accountVotes = await this.dal.getAccountVotes(voteChange.voterAddress);
          } catch (error) {
            if (error.name !== 'VoterAccountDidNotExistError') {
              throw error;
            }
            accountVotes = [];
          }
          if (accountVotes.length >= this.maxVotesPerAccount) {
            let error = new Error(
              `Voter ${
                voteChange.voterAddress
              } exceeded the maximum amount of ${
                this.maxVotesPerAccount
              } votes`
            );
            error.name = 'VoterAccountExceededMaxVotesError';
            error.type = 'InvalidActionError';
            throw error;
          }
          await this.dal.upsertVote(voteChange.voterAddress, voteChange.delegateAddress);
        } else if (voteChange.type === 'unvote') {
          await this.dal.removeVote(voteChange.voterAddress, voteChange.delegateAddress);
        }
      } catch (error) {
        if (error.type === 'InvalidActionError') {
          this.logger.warn(error);
        } else {
          throw error;
        }
      }
    }

    for (let multisigRegistration of multisigRegistrationList) {
      let { multisigAddress, memberAddresses, requiredSignatureCount } = multisigRegistration;
      try {
        await this.dal.registerMultisigWallet(multisigAddress, memberAddresses, requiredSignatureCount);
        let senderAccountChanges = affectedAccountDetails[multisigAddress].changes;
        senderAccountChanges.type = ACCOUNT_TYPE_MULTISIG;
        senderAccountChanges.requiredSignatureCount = requiredSignatureCount;
      } catch (error) {
        if (error.type === 'InvalidActionError') {
          this.logger.warn(error);
        } else {
          throw error;
        }
      }
    }

    let blockSignaturesToStore;
    if (blockSignatureList.length > this.maxExtraBlockSignaturesToStore) {
      blockSignaturesToStore = shuffle(blockSignatureList)
        .slice(0, this.maxExtraBlockSignaturesToStore);
    } else {
      blockSignaturesToStore = blockSignatureList;
    }

    await this.dal.upsertBlock({
      ...block,
      signatures: blockSignaturesToStore
    }, synched);
    this.logger.info(`Upserted block ${block.id} into data store`);

    // Remove transactions which have been processed as part of the current block from pending transaction maps.
    for (let txn of transactions) {
      let senderTxnStream = this.pendingTransactionStreams[txn.senderAddress];
      if (!senderTxnStream) {
        continue;
      }
      senderTxnStream.transactionInfoMap.delete(txn.id);
    }

    // Remove transactions which are relying on outdated keys from pending transaction maps.
    for (let senderAddress of senderAddressSet) {
      let senderAccountInfo = affectedAccountDetails[senderAddress];
      let senderAccount = senderAccountInfo.account;
      let senderAccountChanges = senderAccountInfo.changes;
      let senderType = senderAccountChanges.type || senderAccount.type;

      if (senderType === ACCOUNT_TYPE_MULTISIG) {
        // For multisig, expire based on multisigPublicKey and nextMultisigPublicKey properties of member accounts.
        let senderTxnStream = this.pendingTransactionStreams[senderAddress];
        if (!senderTxnStream) {
          continue;
        }
        let senderMultisigRequiredSignatureCount;
        if (senderAccountChanges.requiredSignatureCount == null) {
          senderMultisigRequiredSignatureCount = senderAccount.requiredSignatureCount;
        } else {
          senderMultisigRequiredSignatureCount = senderAccountChanges.requiredSignatureCount;
        }
        let transactionInfoList = [...senderTxnStream.transactionInfoMap.values()];
        for (let { transaction: remainingTxn } of transactionInfoList) {
          let validMemberKeyCount = 0;
          let remainingSignatures = remainingTxn.signatures || [];
          for (let { signerAddress, multisigPublicKey } of remainingSignatures) {
            let memberAccountInfo = affectedAccountDetails[signerAddress];
            let memberAccount = memberAccountInfo.account;
            let memberAccountChanges = memberAccountInfo.changes;
            let memberMultisigPublicKey = memberAccountChanges.multisigPublicKey || memberAccount.multisigPublicKey;
            let memberNextMultisigPublicKey = memberAccountChanges.nextMultisigPublicKey || memberAccount.nextMultisigPublicKey;
            if (
              multisigPublicKey === memberMultisigPublicKey ||
              multisigPublicKey === memberNextMultisigPublicKey
            ) {
              validMemberKeyCount++;
            }
          }
          // Multisig transaction should only be removed if there are not enough members with valid keys
          // remaining based on the requiredSignatureCount property of the wallet.
          if (validMemberKeyCount < senderMultisigRequiredSignatureCount) {
            senderTxnStream.transactionInfoMap.delete(remainingTxn.id);
          }
        }
      } else {
        // For sig, expire based on the sigPublicKey and nextSigPublicKey properties of the sender account.
        let senderTxnStream = this.pendingTransactionStreams[senderAddress];
        if (!senderTxnStream) {
          continue;
        }
        let senderSigPublicKey = senderAccountChanges.sigPublicKey || senderAccount.sigPublicKey;
        let senderNextSigPublicKey = senderAccountChanges.nextSigPublicKey || senderAccount.nextSigPublicKey;
        let transactionInfoList = [...senderTxnStream.transactionInfoMap.values()];
        for (let { transaction: remainingTxn } of transactionInfoList) {
          if (
            remainingTxn.sigPublicKey !== senderSigPublicKey &&
            remainingTxn.sigPublicKey !== senderNextSigPublicKey
          ) {
            senderTxnStream.transactionInfoMap.delete(remainingTxn.id);
          }
        }
      }
    }

    // Compute the latest timestamp for each sender account.
    let latestSenderTxnTimestamps = {};
    for (let txn of transactions) {
      if (latestSenderTxnTimestamps[txn.senderAddress] == null) {
        latestSenderTxnTimestamps[txn.senderAddress] = txn.timestamp;
        continue;
      }
      if (txn.timestamp > latestSenderTxnTimestamps[txn.senderAddress]) {
        latestSenderTxnTimestamps[txn.senderAddress] = txn.timestamp;
      }
    }

    // Remove expired transactions from pending transaction maps.
    for (let senderAddress of senderAddressSet) {
      let senderTxnStream = this.pendingTransactionStreams[senderAddress];
      if (!senderTxnStream) {
        continue;
      }
      let latestTxnTimestamp = latestSenderTxnTimestamps[senderAddress];
      for (let { transaction: remainingTxn } of senderTxnStream.transactionInfoMap.values()) {
        if (remainingTxn.timestamp < latestTxnTimestamp) {
          senderTxnStream.transactionInfoMap.delete(remainingTxn.id);
        }
      }
      if (!this.isAccountStreamBusy(senderTxnStream)) {
        senderTxnStream.close();
        delete this.pendingTransactionStreams[senderAddress];
      }
    }

    await this.fetchTopActiveDelegates();

    this.channel.publish(`${this.alias}:chainChanges`, {
      type: 'addBlock',
      block: this.simplifyBlock(block)
    });

    this.lastProcessedBlock = block;
    this.logger.info(`Finished processing block ${block.id} at height ${block.height}`);
  }

  async verifyTransactionDoesNotAlreadyExist(transaction) {
    let { id } = transaction;
    let wasTransactionAlreadyProcessed;
    try {
      wasTransactionAlreadyProcessed = await this.dal.hasTransaction(id);
    } catch (error) {
      throw new Error(
        `Failed to check if transaction has already been processed because of error: ${
          error.message
        }`
      );
    }
    if (wasTransactionAlreadyProcessed) {
      throw new Error(
        `Transaction ${id} has already been processed`
      );
    }
  }

  verifyTransactionOffersMinFee(transaction) {
    let { type, fee } = transaction;
    let txnFee = BigInt(fee);
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

  verifySigTransactionAuthentication(senderAccount, transaction, fullCheck) {
    validateSigTransactionSchema(transaction, fullCheck);

    let senderSigPublicKey;
    if (senderAccount.sigPublicKey) {
      senderSigPublicKey = senderAccount.sigPublicKey;
    } else {
      // If the account does not yet have a sigPublicKey, derive it from the address.
      senderSigPublicKey = Buffer.from(
        senderAccount.address.slice(0, 64),
        'hex'
      ).toString('base64');
    }

    if (
      transaction.sigPublicKey !== senderSigPublicKey &&
      transaction.sigPublicKey !== senderAccount.nextSigPublicKey
    ) {
      throw new Error(
        `Transaction sigPublicKey did not match the sigPublicKey or nextSigPublicKey of account ${
          senderAccount.address
        }`
      );
    }
    if (fullCheck) {
      if (!this.ldposClient.verifyTransaction(transaction)) {
        throw new Error('Transaction senderSignature was invalid');
      }
    } else {
      if (!this.ldposClient.verifyTransactionId(transaction)) {
        throw new Error(
          `Transaction id ${transaction.id} was invalid`
        );
      }
    }
  }

  verifyMultisigTransactionAuthentication(senderAccount, multisigMemberAccounts, transaction, fullCheck) {
    let { senderAddress } = transaction;
    validateMultisigTransactionSchema(
      transaction,
      senderAccount.requiredSignatureCount,
      this.maxMultisigMembers,
      this.networkSymbol,
      fullCheck
    );

    if (fullCheck) {
      for (let signaturePacket of transaction.signatures) {
        let {
          signerAddress,
          multisigPublicKey
        } = signaturePacket;

        if (!multisigMemberAccounts[signerAddress]) {
          throw new Error(
            `Signer with address ${
              signerAddress
            } was not a member of multisig wallet ${
              senderAccount.address
            }`
          );
        }
        let memberAccount = multisigMemberAccounts[signerAddress];
        if (!memberAccount.multisigPublicKey) {
          throw new Error(
            `Multisig member account ${
              memberAccount.address
            } was not registered for multisig so they cannot sign multisig transactions`
          );
        }
        if (
          multisigPublicKey !== memberAccount.multisigPublicKey &&
          multisigPublicKey !== memberAccount.nextMultisigPublicKey
        ) {
          throw new Error(
            `Transaction multisigPublicKey did not match the multisigPublicKey or nextMultisigPublicKey of member ${
              memberAccount.address
            }`
          );
        }
        if (!this.ldposClient.verifyMultisigTransactionSignature(transaction, signaturePacket)) {
          throw new Error(
            `Multisig transaction signature of member ${
              memberAccount.address
            } was invalid`
          );
        }
      }
    } else {
      if (!this.ldposClient.verifyTransactionId(transaction)) {
        throw new Error(
          `Multisig transaction id ${transaction.id} was invalid`
        );
      }
    }
  }

  async verifyVoteTransaction(transaction) {
    let { senderAddress, delegateAddress } = transaction;
    let delegateAccount;
    try {
      delegateAccount = await this.getSanitizedAccount(delegateAddress);
    } catch (error) {
      if (error.name === 'AccountDidNotExistError') {
        throw new Error(
          `Delegate account ${delegateAddress} did not exist to vote for`
        );
      } else {
        throw new Error(
          `Failed to fetch delegate account ${delegateAddress} for voting because of error: ${error.message}`
        );
      }
    }
    if (!delegateAccount.forgingPublicKey) {
      throw new Error(
        `Delegate account was not registered for forging so it could not be voted for`
      );
    }

    let votes = await this.dal.getAccountVotes(senderAddress);
    let voteSet = new Set(votes);

    if (voteSet.size >= this.maxVotesPerAccount) {
      throw new Error(
        `Voter account ${
          senderAddress
        } has already voted for ${
          voteSet.size
        } delegates so it cannot vote for any more`
      );
    }
    if (voteSet.has(delegateAddress)) {
      throw new Error(
        `Voter account ${
          senderAddress
        } has already voted for the delegate ${
          delegateAddress
        }`
      );
    }
  }

  async verifyUnvoteTransaction(transaction) {
    let { senderAddress, delegateAddress } = transaction;
    let delegateAccount;
    try {
      delegateAccount = await this.getSanitizedAccount(delegateAddress);
    } catch (error) {
      if (error.name === 'AccountDidNotExistError') {
        throw new Error(
          `Delegate account ${delegateAddress} did not exist to unvote`
        );
      } else {
        throw new Error(
          `Failed to fetch delegate account ${delegateAddress} for unvoting because of error: ${error.message}`
        );
      }
    }
    let voteExists;
    try {
      voteExists = await this.dal.hasVote(senderAddress, delegateAddress);
    } catch (error) {
      throw new Error(
        `Failed to fetch vote from ${senderAddress} for unvoting because of error: ${error.message}`
      );
    }
    if (!voteExists) {
      throw new Error(
        `Unvote transaction cannot remove vote which does not exist from voter ${
          senderAddress
        } to delegate ${
          delegateAddress
        }`
      );
    }
  }

  async verifyRegisterMultisigWalletTransaction(transaction) {
    let { memberAddresses } = transaction;
    await Promise.all(
      memberAddresses.map(
        async (memberAddress) => {
          let memberAccount;
          try {
            memberAccount = await this.getSanitizedAccount(memberAddress);
          } catch (error) {
            if (error.name === 'AccountDidNotExistError') {
              throw new Error(
                `Account ${
                  memberAddress
                } did not exist so it could not be a member of a multisig wallet`
              );
            } else {
              throw new Error(
                `Failed to fetch account ${
                  memberAddress
                } to verify that it qualified to be a member of a multisig wallet`
              );
            }
          }
          if (!memberAccount.multisigPublicKey) {
            throw new Error(
              `Account ${
                memberAddress
              } has not been registered for multisig so it could not be a member of a multisig wallet`
            );
          }
          if (memberAccount.type === 'multisig') {
            throw new Error(
              `Account ${
                memberAddress
              } was a multisig wallet so it could not be a member of another multisig wallet`
            );
          }
        }
      )
    );
  }

  verifyAccountMeetsRequirements(senderAccount, transaction) {
    let { senderAddress, amount, fee, timestamp } = transaction;

    if (timestamp < senderAccount.lastTransactionTimestamp) {
      throw new Error(
        `Transaction was older than the last transaction processed from the sender ${
          senderAddress
        }`
      );
    }

    let txnTotal = BigInt(amount || 0) + BigInt(fee || 0);
    if (txnTotal > senderAccount.balance) {
      throw new Error(
        `Transaction amount plus fee was greater than the balance of sender ${
          senderAddress
        }`
      );
    }

    return txnTotal;
  }

  async verifySigTransactionAuthorization(senderAccount, transaction, fullCheck) {
    let txnTotal = this.verifyAccountMeetsRequirements(senderAccount, transaction);

    if (fullCheck) {
      this.verifyTransactionOffersMinFee(transaction);
      await this.verifyTransactionDoesNotAlreadyExist(transaction);
    }

    let { type } = transaction;

    if (type === 'vote') {
      await this.verifyVoteTransaction(transaction);
    } else if (type === 'unvote') {
      await this.verifyUnvoteTransaction(transaction);
    } else if (type === 'registerMultisigWallet') {
      await this.verifyRegisterMultisigWalletTransaction(transaction);
    }

    return txnTotal;
  }

  async verifySigTransactionAuth(senderAccount, transaction, fullCheck) {
    this.verifySigTransactionAuthentication(senderAccount, transaction, fullCheck);
    return this.verifySigTransactionAuthorization(senderAccount, transaction, fullCheck);
  }

  async verifyMultisigTransactionAuthorization(senderAccount, multisigMemberAccounts, transaction, fullCheck) {
    let txnTotal = this.verifyAccountMeetsRequirements(senderAccount, transaction);

    if (fullCheck) {
      this.verifyTransactionOffersMinFee(transaction);
      await this.verifyTransactionDoesNotAlreadyExist(transaction);
    }

    let { type } = transaction;

    if (type === 'vote') {
      await this.verifyVoteTransaction(transaction);
    } else if (type === 'unvote') {
      await this.verifyUnvoteTransaction(transaction);
    } else if (type === 'registerMultisigWallet') {
      await this.verifyRegisterMultisigWalletTransaction(transaction);
    }

    return txnTotal;
  }

  async verifyMultisigTransactionAuth(senderAccount, multisigMemberAccounts, transaction, fullCheck) {
    this.verifyMultisigTransactionAuthentication(senderAccount, multisigMemberAccounts, transaction, fullCheck);
    return this.verifyMultisigTransactionAuthorization(senderAccount, multisigMemberAccounts, transaction, fullCheck);
  }

  async verifyFullySignedBlock(block, lastBlock) {
    let senderAccountDetails = await this.verifyForgedBlock(block, lastBlock);

    await Promise.all(
      block.signatures.map(blockSignature => this.verifyBlockSignature(block, blockSignature))
    );

    return senderAccountDetails;
  }

  async verifyForgedBlock(block, lastBlock) {
    let expectedBlockHeight = lastBlock.height + 1;
    if (block.height !== expectedBlockHeight) {
      throw new Error(
        `Block height was invalid - Was ${block.height} but expected ${expectedBlockHeight}`
      );
    }
    if (
      block.timestamp % this.forgingInterval !== 0 ||
      block.timestamp - lastBlock.timestamp < this.forgingInterval
    ) {
      throw new Error(
        `Block timestamp ${block.timestamp} was invalid`
      );
    }
    let targetDelegateAddress = this.getForgingDelegateAddressAtTimestamp(block.timestamp);
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
      targetDelegateAccount = await this.getSanitizedAccount(targetDelegateAddress);
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
    if (block.previousBlockId !== lastBlock.id) {
      throw new Error(
        `Block previousBlockId ${
          block.previousBlockId
        } did not match the id of the previous block ${
          lastBlock.id
        }`
      );
    }
    if (!this.ldposClient.verifyBlock(block)) {
      throw new Error('Block was invalid');
    }
    return this.verifyBlockTransactions(block);
  }

  async verifyBlockTransactions(block) {
    for (let transaction of block.transactions) {
      validateTransactionSchema(
        transaction,
        this.maxSpendableDigits,
        this.networkSymbol,
        this.maxTransactionMessageLength,
        this.minMultisigMembers,
        this.maxMultisigMembers
      );
    }

    await Promise.all(
      block.transactions.map(async (transaction) => {
        let existingTransaction;
        try {
          existingTransaction = await this.getSanitizedTransaction(transaction.id);
        } catch (error) {
          if (error.type !== 'InvalidActionError') {
            throw new Error(
              `Failed to check if transaction ${
                transaction.id
              } already existed during block processing`
            );
          }
        }
        if (existingTransaction && existingTransaction.blockId !== block.id) {
          throw new Error(
            `Block contained transaction ${
              existingTransaction.id
            } which was already processed as part of an earlier block`
          );
        }
      })
    );

    let senderTxns = {};
    for (let transaction of block.transactions) {
      let { senderAddress } = transaction;
      if (!senderTxns[senderAddress]) {
        senderTxns[senderAddress] = [];
      }
      senderTxns[senderAddress].push(transaction);
    }

    let senderAddressList = Object.keys(senderTxns);

    let senderAccountDetailsList = await Promise.all(
      senderAddressList.map(async (senderAddress) => {
        let senderAccountInfo;
        let senderAccount;
        let multisigMemberAccounts;
        try {
          let result = await this.getTransactionSenderAccountDetails(senderAddress);
          senderAccount = result.senderAccount;
          multisigMemberAccounts = result.multisigMemberAccounts;
          senderAccountInfo = {
            senderAccount: {
              ...senderAccount
            },
            multisigMemberAccounts: {
              ...multisigMemberAccounts
            }
          };
        } catch (error) {
          throw new Error(
            `Failed to fetch sender account ${
              senderAddress
            } for transaction verification as part of block verification because of error: ${
              error.message
            }`
          );
        }
        let senderTxnList = senderTxns[senderAddress];
        for (let senderTxn of senderTxnList) {
          try {
            let txnTotal;
            if (multisigMemberAccounts) {
              txnTotal = await this.verifyMultisigTransactionAuth(senderAccount, multisigMemberAccounts, senderTxn, false);
            } else {
              txnTotal = await this.verifySigTransactionAuth(senderAccount, senderTxn, false);
            }

            // Subtract valid transaction total from the in-memory senderAccount balance since it
            // may affect the verification of the next transaction in the stream.
            senderAccount.balance -= txnTotal;
          } catch (error) {
            throw new Error(
              `Failed to validate transactions during block verification because of error: ${
                error.message
              }`
            );
          }
        }
        return senderAccountInfo;
      })
    );

    let senderAccountDetails = {};
    for (let { senderAccount, multisigMemberAccounts } of senderAccountDetailsList) {
      senderAccountDetails[senderAccount.address] = {
        senderAccount,
        multisigMemberAccounts
      };
    }
    return senderAccountDetails;
  }

  async verifyBlockSignature(block, blockSignature) {
    if (!block) {
      throw new Error('Cannot verify block signature because there is no block pending');
    }
    let { signerAddress } = blockSignature;

    let signerAccount;
    try {
      signerAccount = await this.getSanitizedAccount(signerAddress);
    } catch (error) {
      throw new Error(
        `Failed to fetch signer account ${signerAddress} because of error: ${error.message}`
      );
    }

    if (
      blockSignature.forgingPublicKey !== signerAccount.forgingPublicKey &&
      blockSignature.forgingPublicKey !== signerAccount.nextForgingPublicKey
    ) {
      throw new Error(
        `Block signature forgingPublicKey did not match the forgingPublicKey or nextForgingPublicKey of the signer account ${
          signerAddress
        }`
      );
    }

    if (!this.topActiveDelegateAddressSet.has(signerAddress)) {
      throw new Error(
        `Account ${signerAddress} is not a top active delegate and therefore cannot be a block signer`
      );
    }

    return this.ldposClient.verifyBlockSignature(block, blockSignature);
  }

  async broadcastBlock(block) {
    try {
      await this.channel.invoke('network:emit', {
        event: `${this.alias}:block`,
        data: block,
        peerLimit: NO_PEER_LIMIT
      });
    } catch (error) {
      throw new Error(
        `Failed to emit block to network because of error: ${error.message}`
      );
    }
  }

  async broadcastBlockSignature(signature) {
    try {
      await this.channel.invoke('network:emit', {
        event: `${this.alias}:blockSignature`,
        data: signature,
        peerLimit: NO_PEER_LIMIT
      });
    } catch (error) {
      throw new Error(
        `Failed to emit blockSignature to network because of error: ${error.message}`
      );
    }
  }

  async signBlock(block) {
    return this.ldposClient.signBlock(block);
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
      minTransactionFees,
      maxConsecutiveBlockFetchFailures
    } = options;

    this.delegateCount = delegateCount;
    this.forgingInterval = forgingInterval;
    this.propagationRandomness = propagationRandomness;
    this.minMultisigMembers = minMultisigMembers;
    this.maxMultisigMembers = maxMultisigMembers;

    let ldposClient;
    let forgingWalletAddress;

    this.cryptoClientLibPath = options.cryptoClientLibPath || DEFAULT_CRYPTO_CLIENT_LIB_PATH;
    let { createClient } = require(this.cryptoClientLibPath);

    if (options.forgingPassphrase) {
      ldposClient = await createClient({
        passphrase: options.forgingPassphrase,
        adapter: this.dal,
        connect: true
      });

      forgingWalletAddress = ldposClient.getWalletAddress();
    } else {
      ldposClient = await createClient({
        adapter: this.dal,
        connect: false
      });
    }

    this.ldposClient = ldposClient;
    this.nodeHeight = await this.dal.getMaxBlockHeight();
    try {
      this.lastProcessedBlock = await this.dal.getBlockAtHeight(this.nodeHeight);
    } catch (error) {
      if (error.name !== 'BlockDidNotExistError') {
        throw new Error(
          `Failed to load last processed block because of error: ${error.message}`
        );
      }
    }
    if (!this.lastProcessedBlock) {
      this.lastProcessedBlock = {
        height: 0,
        timestamp: 0,
        transactions: [],
        previousBlockId: null,
        forgerAddress: null,
        forgingPublicKey: null,
        nextForgingPublicKey: null,
        id: null,
        forgerSignature: null,
        signatures: []
      };
    }
    this.lastReceivedBlock = this.lastProcessedBlock;
    this.lastFullySignedBlock = this.lastProcessedBlock;

    try {
      await this.fetchTopActiveDelegates();
    } catch (error) {
      throw new Error(
        `Failed to load top active delegates because of error: ${error.message}`
      );
    }

    while (true) {
      let activeDelegateCount = Math.min(this.topActiveDelegates.length, delegateCount);
      let blockSignerMajorityCount = Math.floor(activeDelegateCount / 2);

      // If the node is already on the latest network height, it will just return it.
      this.networkHeight = await this.catchUpWithNetwork({
        forgingInterval,
        fetchBlockLimit,
        fetchBlockPause,
        fetchBlockEndConfirmations,
        blockSignerMajorityCount,
        maxConsecutiveBlockFetchFailures
      });
      this.nodeHeight = this.networkHeight;
      let nextHeight = this.networkHeight + 1;

      await this.waitUntilNextBlockTimeSlot({
        forgingInterval,
        timePollInterval
      });

      if (!this.isActive) {
        break;
      }

      let currentForgingDelegateAddress = this.getCurrentForgingDelegateAddress();
      let isCurrentForgingDelegate = forgingWalletAddress && forgingWalletAddress === currentForgingDelegateAddress;

      if (isCurrentForgingDelegate) {
        (async () => {
          let validTransactions = [];

          let senderAddressList = Object.keys(this.pendingTransactionStreams);

          await Promise.all(
            senderAddressList.map(async (senderAddress) => {
              let senderAccount;
              let multisigMemberAccounts;
              try {
                let result = await this.getTransactionSenderAccountDetails(senderAddress);
                senderAccount = result.senderAccount;
                multisigMemberAccounts = result.multisigMemberAccounts;
              } catch (err) {
                let error = new Error(
                  `Failed to fetch sender account ${
                    senderAddress
                  } for transaction verification as part of block forging because of error: ${
                    err.message
                  }`
                );
                this.logger.error(error);
                return;
              }

              let senderTxnStream = this.pendingTransactionStreams[senderAddress];
              if (!senderTxnStream) {
                return;
              }
              let pendingTxnInfoMap = senderTxnStream.transactionInfoMap;
              let pendingTxnList = [...pendingTxnInfoMap.values()].map(txnPacket => txnPacket.transaction);

              for (let pendingTxn of pendingTxnList) {
                try {
                  let txnTotal;
                  if (multisigMemberAccounts) {
                    txnTotal = await this.verifyMultisigTransactionAuth(senderAccount, multisigMemberAccounts, pendingTxn, true);
                  } else {
                    txnTotal = await this.verifySigTransactionAuth(senderAccount, pendingTxn, true);
                  }

                  // Subtract valid transaction total from the in-memory senderAccount balance since it
                  // may affect the verification of the next transaction in the stream.
                  senderAccount.balance -= txnTotal;
                  validTransactions.push(pendingTxn);
                } catch (error) {
                  this.logger.debug(
                    `Excluded transaction ${
                      pendingTxn.id
                    } from block because of error: ${
                      error.message
                    }`
                  );
                  pendingTxnInfoMap.delete(pendingTxn.id);
                  if (!pendingTxnInfoMap.size) {
                    senderTxnStream.close();
                    delete this.pendingTransactionStreams[senderAddress];
                  }
                }
              }
            })
          );
          if (validTransactions.length < this.minTransactionsPerBlock) {
            this.logger.debug(
              `Skipped forging block which contained less than the minimum amount of ${
                this.minTransactionsPerBlock
              } transactions`
            );
            return;
          }

          let pendingTransactions = this.sortPendingTransactions(validTransactions);
          let blockTransactions = pendingTransactions.slice(0, maxTransactionsPerBlock).map(txn => this.simplifyTransaction(txn));
          let blockTimestamp = this.getCurrentBlockTimeSlot(forgingInterval);
          let forgedBlock = this.forgeBlock(nextHeight, blockTimestamp, blockTransactions);
          this.logger.info(`Forged block ${forgedBlock.id} at height ${forgedBlock.height}`);
          await this.wait(forgingBlockBroadcastDelay);
          try {
            await this.broadcastBlock(forgedBlock);
            this.logger.info(`Broadcasted block ${forgedBlock.id}`);
          } catch (error) {
            this.logger.error(error);
          }
        })();
      }

      try {
        // Will throw if block is not received in time.
        let { block, senderAccountDetails } = await this.receiveLastBlockInfo(forgingBlockBroadcastDelay + propagationTimeout);
        this.logger.info(`Received block ${block.id} at height ${block.height}`);

        if (forgingWalletAddress && !isCurrentForgingDelegate) {
          (async () => {
            try {
              let selfSignature = await this.signBlock(block);
              block.signatures[selfSignature.signerAddress] = selfSignature;
              await this.wait(forgingSignatureBroadcastDelay);
              if (this.lastDoubleForgedBlockTimestamp === block.timestamp) {
                throw new Error(
                  `Refused to send signature for block ${
                    block.id
                  } because delegate ${
                    block.forgerAddress
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
        await this.receiveLastBlockSignatures(block, blockSignerMajorityCount, forgingSignatureBroadcastDelay + propagationTimeout);
        this.logger.info(`Received a sufficient number of valid delegate signatures for block ${block.id}`);
        await this.processBlock(block, senderAccountDetails, false);
        this.lastFullySignedBlock = block;

        this.nodeHeight = nextHeight;
        this.networkHeight = nextHeight;
      } catch (error) {
        if (this.isActive) {
          this.logger.error(error);
        }
      }
    }
  }

  async postTransaction(transaction) {
    try {
      validateTransactionSchema(
        transaction,
        this.maxSpendableDigits,
        this.networkSymbol,
        this.maxTransactionMessageLength,
        this.minMultisigMembers,
        this.maxMultisigMembers
      );
      let { senderAccount, multisigMemberAccounts } = await this.getTransactionSenderAccountDetails(transaction.senderAddress);
      if (multisigMemberAccounts) {
        await this.verifyMultisigTransactionAuth(senderAccount, multisigMemberAccounts, transaction, true);
      } else {
        await this.verifySigTransactionAuth(senderAccount, transaction, true);
      }
    } catch (error) {
      throw new Error(
        `Failed to post transaction because of error: ${error.message}`
      );
    }
    await this.broadcastTransaction(transaction);
  }

  async broadcastTransaction(transaction) {
    try {
      await this.channel.invoke('network:emit', {
        event: `${this.alias}:transaction`,
        data: transaction,
        peerLimit: NO_PEER_LIMIT
      });
    } catch (error) {
      throw new Error(
        `Failed to emit transaction to network because of error: ${error.message}`
      );
    }
  }

  async propagateTransaction(transaction) {
    // This is a performance optimization to ensure that peers
    // will not receive multiple instances of the same transaction at the same time.
    let randomPropagationDelay = Math.round(Math.random() * this.propagationRandomness);
    await this.wait(randomPropagationDelay);

    try {
      await this.broadcastTransaction(transaction);
    } catch (error) {
      this.logger.error(error);
    }
  }

  async getTransactionMultisigMemberAccounts(senderAddress) {
    let multisigMemberAddresses;
    try {
      multisigMemberAddresses = await this.dal.getMultisigWalletMembers(senderAddress);
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
        multisigMemberAddresses.map(memberAddress => this.getSanitizedAccount(memberAddress))
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
    return multisigMemberAccounts;
  }

  async getTransactionSenderAccountDetails(senderAddress) {
    let senderAccount;
    try {
      senderAccount = await this.getSanitizedAccount(senderAddress);
    } catch (error) {
      if (error.name === 'AccountDidNotExistError') {
        throw new Error(
          `Sender account ${senderAddress} did not exist`
        );
      }
      throw new Error(
        `Failed to fetch sender account ${senderAddress} because of error: ${error.message}`
      );
    }
    let multisigMemberAccounts;
    if (senderAccount.type === ACCOUNT_TYPE_MULTISIG) {
      multisigMemberAccounts = await this.getTransactionMultisigMemberAccounts(senderAddress);
    } else {
      multisigMemberAccounts = null;
    }
    return {
      senderAccount,
      multisigMemberAccounts
    };
  }

  isAccountStreamBusy(accountStream) {
    return !!(accountStream.pendingTransactionVerificationCount || accountStream.transactionInfoMap.size);
  }

  async startTransactionPropagationLoop() {
    this.channel.subscribe(`network:event:${this.alias}:transaction`, async (event) => {
      let transaction = event.data;

      try {
        validateTransactionSchema(
          transaction,
          this.maxSpendableDigits,
          this.networkSymbol,
          this.maxTransactionMessageLength,
          this.minMultisigMembers,
          this.maxMultisigMembers
        );
      } catch (error) {
        this.logger.warn(
          new Error(`Received invalid transaction ${transaction.id} from network - ${error.message}`)
        );
        return;
      }

      let { senderAddress } = transaction;

      // This ensures that transactions sent from the same account are processed serially but
      // transactions sent from different accounts can be verified in parallel.

      if (this.pendingTransactionStreams[senderAddress]) {
        let accountStream = this.pendingTransactionStreams[senderAddress];

        let backpressure = accountStream.getBackpressure();

        if (backpressure >= this.maxPendingTransactionsPerAccount) {
          this.logger.warn(
            new Error(
              `Transaction ${
                transaction.id
              } was rejected because account ${
                senderAddress
              } has exceeded the maximum allowed pending transaction backpressure of ${
                this.maxPendingTransactionsPerAccount
              }`
            )
          );
          return;
        }

        accountStream.pendingTransactionVerificationCount++;

        let { senderAccount, multisigMemberAccounts } = await accountStream.senderAccountPromise;
        try {
          if (multisigMemberAccounts) {
            this.verifyMultisigTransactionAuthentication(senderAccount, multisigMemberAccounts, transaction, true);
          } else {
            this.verifySigTransactionAuthentication(senderAccount, transaction, true);
          }
          accountStream.write(transaction);
        } catch (error) {
          this.logger.warn(
            new Error(
              `Received unauthorized transaction ${transaction.id} from network - ${error.message}`
            )
          );
          accountStream.pendingTransactionVerificationCount--;
          if (!this.isAccountStreamBusy(accountStream)) {
            accountStream.close();
            delete this.pendingTransactionStreams[senderAddress];
          }
        }

        return;
      }

      let accountStream = new WritableConsumableStream();
      accountStream.transactionInfoMap = new Map();
      accountStream.pendingTransactionVerificationCount = 1;
      this.pendingTransactionStreams[senderAddress] = accountStream;

      let accountStreamConsumer = accountStream.createConsumer();

      accountStream.senderAccountPromise = this.getTransactionSenderAccountDetails(senderAddress);

      let { senderAccount, multisigMemberAccounts } = await accountStream.senderAccountPromise;
      try {
        if (multisigMemberAccounts) {
          this.verifyMultisigTransactionAuthentication(senderAccount, multisigMemberAccounts, transaction, true);
        } else {
          this.verifySigTransactionAuthentication(senderAccount, transaction, true);
        }
        accountStream.write(transaction);
      } catch (error) {
        this.logger.warn(
          new Error(
            `Received invalid transaction from network - ${error.message}`
          )
        );

        accountStream.pendingTransactionVerificationCount--;
        if (!this.isAccountStreamBusy(accountStream)) {
          accountStream.close();
          delete this.pendingTransactionStreams[senderAddress];
          return;
        }
      }

      for await (let accountTxn of accountStreamConsumer) {
        try {
          let txnTotal;
          if (multisigMemberAccounts) {
            txnTotal = await this.verifyMultisigTransactionAuthorization(senderAccount, multisigMemberAccounts, accountTxn, true);
          } else {
            txnTotal = await this.verifySigTransactionAuthorization(senderAccount, accountTxn, true);
          }

          if (accountStream.transactionInfoMap.has(accountTxn.id)) {
            throw new Error(`Transaction ${accountTxn.id} has already been received before`);
          }

          // Subtract valid transaction total from the in-memory senderAccount balance since it
          // may affect the verification of the next transaction in the stream.
          senderAccount.balance -= txnTotal;

          accountStream.transactionInfoMap.set(accountTxn.id, {
            transaction: accountTxn,
            receivedTimestamp: Date.now()
          });

          this.propagateTransaction(accountTxn);

        } catch (error) {
          this.logger.warn(
            new Error(
              `Received invalid transaction from network - ${error.message}`
            )
          );
        }
        accountStream.pendingTransactionVerificationCount--;
        if (!this.isAccountStreamBusy(accountStream)) {
          delete this.pendingTransactionStreams[senderAddress];
          return;
        }
      }
    });
  }

  async startBlockPropagationLoop() {
    let channel = this.channel;
    channel.subscribe(`network:event:${this.alias}:block`, async (event) => {
      let block = event.data;

      let senderAccountDetails;
      try {
        validateBlockSchema(block, this.minTransactionsPerBlock, this.maxTransactionsPerBlock, 0, 0, this.networkSymbol);
        senderAccountDetails = await this.verifyForgedBlock(block, this.lastProcessedBlock);
        let currentBlockTimeSlot = this.getCurrentBlockTimeSlot(this.forgingInterval);
        if (block.timestamp !== currentBlockTimeSlot) {
          throw new Error(
            `Block timestamp ${block.timestamp} did not correspond to the current time slot ${currentBlockTimeSlot}`
          );
        }
      } catch (error) {
        this.logger.warn(
          new Error(
            `Received invalid block ${block && block.id} - ${error.message}`
          )
        );
        return;
      }
      if (block.id === this.lastReceivedBlock.id) {
        this.logger.debug(
          new Error(`Block ${block.id} has already been received before`)
        );
        return;
      }

      // If double-forged block was received.
      if (block.timestamp === this.lastReceivedBlock.timestamp) {
        this.lastDoubleForgedBlockTimestamp = this.lastReceivedBlock.timestamp;
        this.logger.warn(
          new Error(`Block ${block.id} was forged with the same timestamp as the last block ${this.lastReceivedBlock.id}`)
        );
        return;
      }

      let { transactions } = block;
      for (let txn of transactions) {
        let pendingTxnStream = this.pendingTransactionStreams[txn.senderAddress];
        if (!pendingTxnStream || !pendingTxnStream.transactionInfoMap.has(txn.id)) {
          this.logger.warn(
            new Error(`Block ${block.id} contained an unrecognized transaction ${txn.id}`)
          );
          return;
        }

        let pendingTxn = pendingTxnStream.transactionInfoMap.get(txn.id).transaction;
        if (txn.signatures) {
          // For multisig transaction.
          let pendingTxnSignatures = {};
          for (let pendingSignaturePacket of pendingTxn.signatures) {
            pendingTxnSignatures[pendingSignaturePacket.signerAddress] = pendingSignaturePacket;
          }
          let allSignaturesMatchPending = txn.signatures.every((signaturePacket) => {
            let expectedSignaturePacket = pendingTxnSignatures[signaturePacket.signerAddress];
            if (!expectedSignaturePacket) {
              return false;
            }
            let expectedSignatureHash = this.sha256(expectedSignaturePacket.signature);
            return signaturePacket.signatureHash === expectedSignatureHash;
          });

          if (!allSignaturesMatchPending) {
            this.logger.warn(
              new Error(
                `Block ${block.id} contained a multisig transaction ${txn.id} with missing or invalid signature hashes`
              )
            );
            return;
          }
        } else {
          // For sig transaction.
          let expectedSenderSignatureHash = this.sha256(pendingTxn.senderSignature);
          if (txn.senderSignatureHash !== expectedSenderSignatureHash) {
            this.logger.warn(
              new Error(`Block ${block.id} contained a sig transaction ${txn.id} with an invalid sender signature hash`)
            );
            return;
          }
        }
      }

      this.lastReceivedBlock = block;
      this.verifiedBlockInfoStream.write({
        block: this.lastReceivedBlock,
        senderAccountDetails
      });

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

      validateBlockSignatureSchema(blockSignature, this.networkSymbol);

      let lastReceivedBlock = this.lastReceivedBlock;
      let { forgerAddress, signatures } = lastReceivedBlock;

      if (signatures[blockSignature.signerAddress]) {
        this.logger.warn(
          new Error(`Block signature of delegate ${blockSignature.signerAddress} has already been received before`)
        );
        return;
      }

      if (blockSignature.signerAddress === forgerAddress) {
        this.logger.warn(
          new Error(`Block forger ${forgerAddress} cannot re-sign their own block`)
        );
        return;
      }

      try {
        await this.verifyBlockSignature(lastReceivedBlock, blockSignature);
      } catch (error) {
        this.logger.warn(
          new Error(`Received invalid delegate block signature - ${error.message}`)
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

  cleanupPendingTransactionStreams(expiry) {
    let now = Date.now();

    let pendingSenderList = Object.keys(this.pendingTransactionStreams);
    for (let senderAddress of pendingSenderList) {
      let senderTxnStream = this.pendingTransactionStreams[senderAddress];
      let pendingTxnInfoMap = senderTxnStream.transactionInfoMap;
      for (let { transaction, receivedTimestamp } of pendingTxnInfoMap.values()) {
        if (now - receivedTimestamp >= expiry) {
          pendingTxnInfoMap.delete(transaction.id);
          if (!pendingTxnInfoMap.size) {
            senderTxnStream.close();
            delete this.pendingTransactionStreams[senderAddress];
          }
        }
      }
    }
  }

  async startPendingTransactionExpiryLoop() {
    if (this.isActive) {
      this._pendingTransactionExpiryCheckIntervalId = setInterval(() => {
        this.cleanupPendingTransactionStreams(this.pendingTransactionExpiry);
      }, this.pendingTransactionExpiryCheckInterval);
    }
  }

  async load(channel, options) {
    this.channel = channel;
    this.isActive = true;

    let defaultOptions = {
      forgingInterval: DEFAULT_FORGING_INTERVAL,
      delegateCount: DEFAULT_DELEGATE_COUNT,
      maxExtraBlockSignaturesToStore: DEFAULT_MAX_EXTRA_BLOCK_SIGNATURES_TO_STORE,
      fetchBlockLimit: DEFAULT_FETCH_BLOCK_LIMIT,
      fetchBlockPause: DEFAULT_FETCH_BLOCK_PAUSE,
      fetchBlockEndConfirmations: DEFAULT_FETCH_BLOCK_END_CONFIRMATIONS,
      forgingBlockBroadcastDelay: DEFAULT_FORGING_BLOCK_BROADCAST_DELAY,
      forgingSignatureBroadcastDelay: DEFAULT_FORGING_SIGNATURE_BROADCAST_DELAY,
      propagationTimeout: DEFAULT_PROPAGATION_TIMEOUT,
      propagationRandomness: DEFAULT_PROPAGATION_RANDOMNESS,
      timePollInterval: DEFAULT_TIME_POLL_INTERVAL,
      minTransactionsPerBlock: DEFAULT_MIN_TRANSACTIONS_PER_BLOCK,
      maxTransactionsPerBlock: DEFAULT_MAX_TRANSACTIONS_PER_BLOCK,
      minMultisigMembers: DEFAULT_MIN_MULTISIG_MEMBERS,
      maxMultisigMembers: DEFAULT_MAX_MULTISIG_MEMBERS,
      pendingTransactionExpiry: DEFAULT_PENDING_TRANSACTION_EXPIRY,
      pendingTransactionExpiryCheckInterval: DEFAULT_PENDING_TRANSACTION_EXPIRY_CHECK_INTERVAL,
      maxSpendableDigits: DEFAULT_MAX_SPENDABLE_DIGITS,
      maxTransactionMessageLength: DEFAULT_MAX_TRANSACTION_MESSAGE_LENGTH,
      maxVotesPerAccount: DEFAULT_MAX_VOTES_PER_ACCOUNT,
      maxPendingTransactionsPerAccount: DEFAULT_MAX_PENDING_TRANSACTIONS_PER_ACCOUNT,
      maxConsecutiveBlockFetchFailures: DEFAULT_MAX_CONSECUTIVE_BLOCK_FETCH_FAILURES
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

    this.minTransactionsPerBlock = this.options.minTransactionsPerBlock;
    this.maxTransactionsPerBlock = this.options.maxTransactionsPerBlock;
    this.pendingTransactionExpiry = this.options.pendingTransactionExpiry;
    this.pendingTransactionExpiryCheckInterval = this.options.pendingTransactionExpiryCheckInterval;
    this.maxSpendableDigits = this.options.maxSpendableDigits;
    this.maxTransactionMessageLength = this.options.maxTransactionMessageLength;
    this.maxVotesPerAccount = this.options.maxVotesPerAccount;
    this.maxPendingTransactionsPerAccount = this.options.maxPendingTransactionsPerAccount;
    this.maxExtraBlockSignaturesToStore = this.options.maxExtraBlockSignaturesToStore;

    let delegateSignerMajorityCount = Math.floor(this.delegateCount / 2);

    if (this.maxExtraBlockSignaturesToStore < delegateSignerMajorityCount) {
      throw new Error(
        `The maxExtraBlockSignaturesToStore option cannot be less than ${
          delegateSignerMajorityCount
        }`
      );
    }

    this.genesis = require(options.genesisPath || DEFAULT_GENESIS_PATH);
    try {
      await this.dal.init({
        genesis: this.genesis
      });
    } catch (error) {
      throw new Error(
        `Failed to initialize from genesis because of error: ${error.message}`
      );
    }

    let moduleState = {};
    if (this.maxExtraBlockSignaturesToStore >= this.delegateCount - 1) {
      moduleState.keepsAllBlockSignatures = true;
    }

    await this.channel.invoke('app:updateModuleState', {
      [this.alias]: moduleState
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
