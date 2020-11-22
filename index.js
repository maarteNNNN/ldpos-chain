const pkg = require('./package.json');
const crypto = require('crypto');
const genesisBlock = require('./genesis/testnet/genesis.json');
const { createLDPoSClient } = require('ldpos-client');
const WritableConsumableStream = require('writable-consumable-stream');

const { verifyBlockSchema } = require('./schemas/block-schema');
const { verifyTransactionBundleSchema } = require('./schemas/transaction-bundle-schema');

const DEFAULT_MODULE_ALIAS = 'ldpos_chain';
const DEFAULT_GENESIS_PATH = './genesis/mainnet/genesis.json';
const DEFAULT_DELEGATE_COUNT = 21;
const DEFAULT_FORGING_INTERVAL = 30000;
const DEFAULT_FETCH_BLOCK_LIMIT = 20;
const DEFAULT_FETCH_BLOCK_PAUSE = 100;
const DEFAULT_FETCH_BLOCK_END_CONFIRMATIONS = 10;
const DEFAULT_FORGING_BLOCK_BROADCAST_DELAY = 2000;
const DEFAULT_FORGING_SIGNATURE_BROADCAST_DELAY = 5000;
const DEFAULT_PROPAGATION_TIMEOUT = 5000;
const DEFAULT_TIME_POLL_INTERVAL = 200;
const DEFAULT_MAX_TRANSACTIONS_PER_BLOCK = 300;

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
    this.latestBlock = null;
    this.latestProcessedBlock = this.latestBlock;

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
      postTransactions: {
        handler: async action => {
          return this.postTransactions(action.transactions);
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
      delegateCount
    } = options;

    let finality = Math.ceil(delegateCount / 2);

    let now = Date.now();
    if (
      Math.floor(this.latestProcessedBlock.timestamp / forgingInterval) >= Math.floor(now / forgingInterval)
    ) {
      return this.latestProcessedBlock.height;
    }

    let latestGoodBlock = this.latestProcessedBlock;

    while (true) {
      if (!this.isActive) {
        break;
      }
      let newBlocks = [];
      for (let i = 0; i < fetchBlockEndConfirmations && !newBlocks.length; i++) {
        try {
          newBlocks = await this.channel.invoke('network:request', {
            procedure: `${this.alias}:getBlocksFromHeight`,
            data: {
              height: latestGoodBlock.height + 1,
              limit: fetchBlockLimit
            }
          });
        } catch (error) {
          newBlocks = [];
          this.logger.warn(error);
        }
        if (!Array.isArray(newBlocks)) {
          newBlocks = [];
          this.logger.warn('Received invalid blocks response while catching up with network - Expected an array of blocks');
        }
        for (let block of newBlocks) {
          try {
            this.verifyBlock(block, latestGoodBlock);
            latestGoodBlock = block;
          } catch (error) {
            this.logger.warn(`Received invalid block while catching up with network - ${error.message}`);
            newBlocks = [];
            latestGoodBlock = this.latestProcessedBlock;
            this.latestBlock = latestGoodBlock;
            this.pendingBlocks = [];
            break;
          }
        }
      }
      if (!newBlocks.length) {
        break;
      }
      for (let block of newBlocks) {
        this.pendingBlocks.push(block);
      }
      try {
        let blockCount = this.pendingBlocks.length - finality;
        for (let i = 0; i < blockCount; i++) {
          let block = this.pendingBlocks[i];
          await this.processBlock(block);
          this.pendingBlocks[i] = null;
          this.latestBlock = block;
          this.latestProcessedBlock = block;
        }
      } catch (error) {
        this.logger.error(`Failed to process block while catching up with network - ${error.message}`);
      }
      this.pendingBlocks = this.pendingBlocks.filter(block => block);
      await this.wait(fetchBlockPause);
    }

    this.latestBlock = latestGoodBlock;
    return latestGoodBlock.height;
  }

  async receiveLatestBlock(timeout) {
    let block = await this.verifiedBlockStream.once(timeout);
    this.latestBlock = {
      ...block,
      signatures: []
    };
    return this.latestBlock;
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

  async getCurrentBlockTimeSlot(forgingInterval) {
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
      previousBlockId: this.latestBlock ? this.latestBlock.id : null
    };
    return this.ldposClient.prepareBlock(block);
  }

  async processBlock(block) {
    let { transactions, height } = block;
    let affectedAddresses = new Set();
    for (let txn of transactions) {
      affectedAddresses.add(txn.senderAddress);
      affectedAddresses.add(txn.recipientAddress);
    }
    affectedAddresses.add(block.forgerAddress);

    let accountList = await Promise.all(
      [...affectedAddresses].map((address) => this.dal.getAccount(address))
    );
    let accounts = {};
    for (account of accountList) {
      accounts[account.address] = account;
    }
    let forgerAccount = accounts[block.forgerAddress];
    for (let txn of transactions) {
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
    }
    await Promise.all(
      accountList.map(async (account) => {
        if (account.updateHeight < height) {
          await this.dal.updateAccount(account.address, { balance: account.balance }, height);
        }
      })
    );
    let { signature, signatures, ...sanitizedBlock } = block;
    sanitizedBlock.signatureHash = this.sha256(signature);

    if (block.forgingPublicKey === forgerAccount.nextForgingPublicKey) {
      await this.dal.updateAccount(
        forgerAccount.address,
        {
          forgingPublicKey: block.forgingPublicKey,
          nextForgingPublicKey: block.nextForgingPublicKey
        },
        height
      );
    }
    await this.dal.insertBlock(sanitizedBlock);
  }

  async verifyTransactionBundle(transactionBundle) {
    verifyTransactionBundleSchema(transactionBundle);

    let areTransactionSignaturesValid = this.ldposClient.verifyTransactionBundle(transactionBundle);
    if (!areTransactionSignaturesValid) {
      throw new Error('Transactions signature was invalid');
    }

    let { transactions } = transactionBundle;
    let { senderAddress } = transactions[0];
    let totalTransactionsAmount = 0;
    for (let txn of transactions) {
      totalTransactionsAmount += txn.amount;
    }

    let senderAccount = await this.dal.getAccount(senderAddress);
    if (!senderAccount) {
      throw new Error(`Transactions sender account ${senderAddress} could not be found`);
    }
    if (totalTransactionsAmount > senderAccount.balance) {
      throw new Error('Total transactions amount was greater than the sender account balance');
    }
  }

  async verifyBlock(block, lastBlock) {
    verifyBlockSchema(block);
    let lastBlockId = lastBlock ? lastBlock.id : null;
    let lastBlockHeight = lastBlock ? lastBlock.height : 0;
    let expectedBlockHeight = lastBlockHeight + 1;
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
    let targetDelegateAccount = await this.dal.getAccount(targetDelegateAddress);
    if (block.forgerAddress !== targetDelegateAccount.address) {
      throw new Error(
        `The block forgerAddress ${
          block.forgerAddress
        } did not match the expected forger delegate address ${
          targetDelegateAccount.address
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
          } does not have a forgingPublicKey`
        );
      }
    } else if (block.forgingPublicKey === targetDelegateAccount.nextForgingPublicKey) {
      if (!targetDelegateAccount.nextForgingPublicKey) {
        throw new Error(
          `Failed to increment the forging key for delegate ${
            targetDelegateAccount.address
          } because it does not have a nextForgingPublicKey`
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
    if (!this.ldposClient.verifyBlock(block, forgingPublicKey, lastBlockId)) {
      throw new Error(`Block ${block ? block.id : 'without ID'} was invalid`);
    }
  }

  async verifyBlockSignature(latestBlock, blockSignature) {
    if (!blockSignature) {
      throw new Error('Block signature was not specified');
    }
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
    let signerAccount = await this.dal.getAccount(signerAddress);
    return this.ldposClient.verifyBlockSignature(latestBlock, signature, signerAccount.forgingPublicKey);
  }

  async broadcastBlock(block) {
    await channel.invoke('network:emit', {
      event: `${this.alias}:block`,
      data: block
    });
  }

  async broadcastBlockSignature(signature) {
    await channel.invoke('network:emit', {
      event: `${this.alias}:blockSignature`,
      data: signature
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
      timePollInterval,
      maxTransactionsPerBlock
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
    if (timePollInterval == null) {
      timePollInterval = DEFAULT_TIME_POLL_INTERVAL;
    }
    if (maxTransactionsPerBlock == null) {
      maxTransactionsPerBlock = DEFAULT_MAX_TRANSACTIONS_PER_BLOCK;
    }

    this.delegateCount = delegateCount;
    this.forgingInterval = forgingInterval;

    let delegateMajorityCount = Math.ceil(delegateCount / 2);

    let ldposClient;
    let forgingWalletAddress;

    if (options.forgingPassphrase) {
      ldposClient = await createLDPoSClient({
        passphrase: options.forgingPassphrase,
        adapter: this.dal
      });

      forgingWalletAddress = ldposClient.getAccountAddress();
    }
    this.ldposClient = ldposClient;
    this.nodeHeight = await this.dal.getLatestHeight();
    this.latestBlock = await this.dal.getBlockAtHeight(this.nodeHeight);
    if (this.latestBlock == null) {
      this.latestBlock = {
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
    this.latestProcessedBlock = this.latestBlock;

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
        delegateCount
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
          let blockTransactions = pendingTransactions.slice(0, maxTransactionsPerBlock);
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
              latestBlock[selfSignature.signerAddress] = selfSignature;
              await this.wait(forgingSignatureBroadcastDelay);
              await this.broadcastBlockSignature(selfSignature);
            } catch (error) {
              this.logger.error(error);
            }
          })();
        }

        // Will throw if the required number of valid signatures cannot be gathered in time.
        await this.receiveLatestBlockSignatures(latestBlock, delegateMajorityCount, forgingSignatureBroadcastDelay + propagationTimeout);

        if (this.pendingBlocks.length) {
          let latestPendingBlock = this.pendingBlocks[this.pendingBlocks.length - 1];
          if (latestBlock.previousBlockId !== latestPendingBlock.id) {
            throw new Error(
              `The previousBlockId of the latest received block did not match the previous pending block ID ${
                latestPendingBlock.id
              }`
            );
          }
          for (let block of this.pendingBlocks) {
            await this.processBlock(block);
          }
        }
        await this.processBlock(latestBlock);
        this.latestProcessedBlock = this.latestBlock;
        this.nodeHeight = nextHeight;
        this.networkHeight = nextHeight;
      } catch (error) {
        if (this.isActive) {
          this.logger.error(error);
        }
      }
    }
  }

  async postTransactions(transactions) {
    return this.channel.invoke('network:emit', {
      event: `${this.alias}:transactions`,
      data: transactions
    });
  }

  async startTransactionPropagationLoop() {
    this.channel.subscribe(`network:event:${this.alias}:transactions`, async (event) => {
      let transactionBundle = event.data;

      try {
        await this.verifyTransactionBundle(transactionBundle);
      } catch (error) {
        this.logger.error(
          new Error(`Received invalid Transactions - ${error.message}`)
        );
        return;
      }

      let { transactions } = transactionBundle;

      for (let txn of transactions) {
        if (this.pendingTransactionMap.has(txn.id)) {
          this.logger.error(
            new Error(`Transaction ${txn.id} has already been received before`)
          );
          return;
        }
      }

      try {
        await this.postTransactions(transactions);
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
        this.verifyBlock(block, this.latestBlock);
        let currentBlockTimeSlot = this.getCurrentBlockTimeSlot(this.forgingInterval);
        let timestampDiff = block.timestamp - currentBlockTimeSlot;
        if (timestampDiff > this.forgingInterval || timestampDiff < 0) {
          throw new Error(`Block ${block.id} timestamp did not fit within the expected time slot`);
        }
      } catch (error) {
        this.logger.error(
          new Error(
            `Received invalid block ${block && block.id} - ${error.message}`
          )
        );
        return;
      }

      if (this.latestBlock && this.latestBlock.id === block.id) {
        this.logger.error(
          new Error(`Block ${block.id} has already been received before`)
        );
        return;
      }

      this.verifiedBlockStream.write(block);

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
        await this.verifyBlockSignature(this.latestBlock, blockSignature);
      } catch (error) {
        this.logger.error(
          new Error(`Received invalid block signature - ${error.message}`)
        );
        return;
      }

      let { signatures } = this.latestBlock;

      if (signatures[blockSignature.signerAddress]) {
        this.logger.error(
          new Error(`Block signature of signer ${blockSignature.signerAddress} has already been received before`)
        );
        return;
      }

      this.verifiedBlockSignatureStream.write(blockSignature);

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
