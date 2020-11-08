const pkg = require('./package.json');
const crypto = require('crypto');
const genesisBlock = require('./genesis/testnet/genesis.json');
const { createLDPoSClient } = require('ldpos-client');
const WritableConsumableStream = require('writable-consumable-stream');

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
    this.logger = options.logger;
    if (options.dal) {
      this.dal = options.dal;
    } else {
      // TODO 222: Default to postgres adapter as Data Access Layer
    }
    this.pendingTransactionMap = new Map();
    this.latestBlock = null;
    this.latestBlockSignatureMap = new Map();

    this.verifiedBlockStream = new WritableConsumableStream();
    this.verifiedBlockSignatureStream = new WritableConsumableStream();
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
      getCandidacyList: {
        handler: async action => {}
      },
      postTransactions: {
        handler: async action => {}
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
      fetchBlockPause
    } = options;

    let now = Date.now();
    if (
      this.latestBlock &&
      Math.floor(this.latestBlock.timestamp / forgingInterval) >= Math.floor(now / forgingInterval)
    ) {
      return this.latestBlock.height;
    }

    let nodeHeight = this.nodeHeight;

    while (true) {
      let newBlocks = [];
      for (let i = 0; i < fetchBlockEndConfirmations && !newBlocks.length; i++) {
        try {
          newBlocks = await channel.invoke('network:request', {
            procedure: `${this.alias}:getBlocksFromHeight`,
            data: {
              height: nodeHeight + 1,
              limit: fetchBlockLimit
            }
          });
        } catch (error) {
          newBlocks = [];
          this.logger.warn(error);
        }
        for (let block of newBlocks) {
          try {
            this.verifyBlock(block);
          } catch (error) {
            this.logger.warn(`Received invalid block while catching up with network - ${error.message}`);
            newBlocks = [];
            break;
          }
        }
      }
      if (!newBlocks.length) {
        break;
      }
      try {
        // TODO 222: Process blocks here, not just insert.
        await this.dal.insertBlocks(newBlocks);
        let latestBlock = newBlocks[newBlocks.length - 1];
        this.latestBlock = latestBlock;
        nodeHeight = latestBlock.height;
      } catch (error) {
        this.logger.error(`Failed to insert blocks while catching up with network - ${error.message}`);
      }
      await this.wait(fetchBlockPause);
    }

    return nodeHeight;
  }

  async receiveLatestBlock(timeout) {
    return this.verifiedBlockStream.once(timeout);
  }

  async receiveLatestBlockSignatures(latestBlock, requiredSignatureCount, timeout) {
    let signatureMap = new Map();
    while (true) {
      let startTime = Date.now();
      let blockSignature = await this.verifiedBlockSignatureStream.once(timeout);
      if (blockSignature.blockId === latestBlock.id) {
        signatureMap.set(blockSignature.signerAddress, blockSignature);
      }
      let timeDiff = Date.now() - startTime;
      timeout -= timeDiff;
      if (timeout <= 0 || signatureMap.size >= requiredSignatureCount) {
        break;
      }
    }
    let signatures = {};
    for (let [key, value] of signatureMap) {
      signatures[key] = value;
    }
    return signatures;
  }

  async getCurrentBlockTimeSlot(forgingInterval) {
    return Math.floor(Date.now() / forgingInterval) * forgingInterval;
  }

  async getForgingDelegateAddressAtTimestamp(timestamp) {
    let activeDelegates = await this.getTopActiveDelegates(this.delegateCount);
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
    let blockJSON = JSON.stringify(block);
    block.id = this.sha256(blockJSON);

    return this.ldposClient.prepareBlock(block);
  }

  async processBlock(block) {
    // TODO 222: Update forgingPublicKey of forging delegate account with the nextForgingPublicKey property from the block when relevant.
    // TODO 222: Error handling in case of database write failure.
    let { transactions, height } = block;
    let affectedAddresses = new Set();
    for (let txn of transactions) {
      affectedAddresses.add(txn.senderAddress);
      affectedAddresses.add(txn.recipientAddress);
    }
    let accountList = await Promise.all(
      [...affectedAddresses].map((address) => this.dal.getAccount(address))
    );
    let accounts = {};
    for (account of accountList) {
      accounts[account.address] = account;
    }
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
          await this.dal.setAccountBalance(account.address, account.balance, height)
        }
      })
    );
    let { signature, signatures, ...sanitizedBlock } = block;
    sanitizedBlock.signatureHash = this.sha256(signature);
    await this.dal.insertBlocks([sanitizedBlock]);
  }

  async verifyTransactionsPacket(transactionsPacket) {
    if (!transactionsPacket) {
      throw new Error('Transactions packet was not specified');
    }

    let areTransactionSignaturesValid = this.ldposClient.verifyTransactionsPacket(transactionsPacket);
    if (!areTransactionSignaturesValid) {
      throw new Error('Transactions signature was invalid');
    }

    let { transactions } = transactionsPacket;
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

  verifyBlock(block) {
    if (!block) {
      throw new Error('Block was not specified');
    }
    let targetDelegateAddress = this.getForgingDelegateAddressAtTimestamp(block.timestamp);
    let targetDelegateAccount = await this.dal.getAccount(targetDelegateAddress);
    let lastBlockId = this.latestBlock ? this.latestBlock.id : null;
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
        `Block forgingPublicKey did not match the forgingPublicKey of delegate ${
          targetDelegateAccount.address
        }`
      );
    }
    let isBlockValid = this.ldposClient.verifyBlock(block, forgingPublicKey, lastBlockId);
    if (!isBlockValid) {
      throw new Error(`Block ${block ? block.id : 'without ID'} was invalid`);
    }
  }

  async verifyBlockSignature(blockSignature) {
    if (!blockSignature) {
      throw new Error('Block signature was not specified');
    }
    let latestBlock = this.latestBlock;
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
    return this.ldposClient.signBlock(block);
  }

  async waitUntilNextBlockTimeSlot(options) {
    let { forgingInterval, timePollInterval } = options;
    let lastSlotIndex = Math.floor(Date.now() / forgingInterval);
    while (true) {
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

    while (true) {
      this.latestBlockSignatureMap.clear();
      // If the node is already on the latest network height, it will just return it.
      this.networkHeight = await this.catchUpWithNetwork({
        forgingInterval,
        fetchBlockLimit,
        fetchBlockPause,
        fetchBlockEndConfirmations
      });
      this.nodeHeight = this.networkHeight;
      let nextHeight = this.networkHeight + 1;

      await this.waitUntilNextBlockTimeSlot({
        forgingInterval,
        timePollInterval
      });

      let isCurrentForgingDelegate = forgingWalletAddress && forgingWalletAddress === this.getCurrentForgingDelegateAddress();

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
        // Will throw if block is not valid or has already been processed before.
        latestBlock = await this.receiveLatestBlock(forgingBlockBroadcastDelay + propagationTimeout);

        if (forgingWalletAddress && !isCurrentForgingDelegate) {
          (async () => {
            try {
              let selfSignature = await this.signBlock(latestBlock);
              this.latestBlockSignatureMap.set(selfSignature.id, selfSignature);
              await this.wait(forgingSignatureBroadcastDelay);
              await this.broadcastBlockSignature(selfSignature);
            } catch (error) {
              this.logger.error(error);
            }
          })();
        }

        // Will throw if the required number of valid signatures cannot be gathered in time.
        latestBlockSignatures = await this.receiveLatestBlockSignatures(latestBlock, delegateMajorityCount, forgingSignatureBroadcastDelay + propagationTimeout);
        this.latestBlock = {
          ...latestBlock,
          signatures: latestBlockSignatures
        };
        this.nodeHeight = nextHeight;
        this.networkHeight = nextHeight;
        await this.processBlock(latestBlock);
      } catch (error) {
        this.logger.error(error);
      }
    }
  }

  async startTransactionPropagationLoop() {
    let channel = this.channel;
    channel.subscribe(`network:event:${this.alias}:transactions`, async (event) => {
      let transactionsPacket = event.data;

      try {
        await this.verifyTransactionsPacket(transactionsPacket);
      } catch (error) {
        this.logger.error(
          new Error(`Received invalid Transactions - ${error.message}`)
        );
        return;
      }

      let { transactions } = transactionsPacket;

      for (let txn of transactions) {
        if (this.pendingTransactionMap.has(txn.id)) {
          this.logger.error(
            new Error(`Transaction ${txn.id} has already been received before`)
          );
          return;
        }
      }

      try {
        await channel.invoke('network:emit', {
          event: `${this.alias}:transactions`,
          data: transactions
        });
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
        this.verifyBlock(block); // TODO 222: Make sure that block is valid and references appropriate height
      } catch (error) {
        this.logger.error(
          new Error(`Received invalid block - ${error.message}`)
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
        await this.verifyBlockSignature(blockSignature);
      } catch (error) {
        this.logger.error(
          new Error(`Received invalid block signature - ${error.message}`)
        );
        return;
      }

      if (this.latestBlockSignatureMap.has(blockSignature.id)) {
        this.logger.error(
          new Error(`Block signature ${blockSignature.id} has already been received before`)
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

  }

  async wait(duration) {
    return new Promise((resolve) => {
      setTimeout(resolve, duration);
    });
  }
};
