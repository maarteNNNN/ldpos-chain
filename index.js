const pkg = require('./package.json');
const crypto = require('crypto');
const genesisBlock = require('./genesis/testnet/genesis.json');
const { createLDPoSClient } = require('ldpos-client');

const DEFAULT_MODULE_ALIAS = 'ldpos_chain';
const DEFAULT_GENESIS_PATH = './genesis/mainnet/genesis.json';
const DEFAULT_RECEIVE_BLOCK_TIMEOUT_FACTOR = 1.5;
const DEFAULT_BLOCK_FORGING_RETRY_DELAY = 1000;

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

  async getHighestNodeHeight() {
    // TODO 222
  }

  async getHighestNetworkHeight() {
    // TODO 222
  }

  async catchUpWithNetwork() {
    // TODO 222
    // this.nodeHeight = latestHeight;
    // this.networkHeight = latestHeight;
  }

  async receiveNextBlock(timeout) {
    // TODO 222
    // As part of validation, check that all the transactions in the newly
    // received block are inside our pendingTransactionMap.
  }

  async getCurrentBlockTimeSlot() {
    let { blockForgingInterval } = this.options;
    return Math.round(Date.now() / blockForgingInterval) * blockForgingInterval;
  }

  async getCurrentForgingDelegateAddress() {

  }

  forgeBlock(transactionList) {

  }

  async processBlock(block) {

  }

  verifyTransaction(transaction) {

  }

  async broadcastBlock(block) {
    await channel.invoke('network:emit', {
      event: `${this.alias}:block`,
      data: block
    });
  }

  async startBlockProcessingLoop() {
    let options = this.options;
    let channel = this.channel;

    let {
      blockForgingInterval,
      blockForgingRetryDelay,
      receiveBlockTimeoutFactor
    } = options;

    if (receiveBlockTimeoutFactor == null) {
      receiveBlockTimeoutFactor = DEFAULT_RECEIVE_BLOCK_TIMEOUT_FACTOR;
    }
    if (blockForgingRetryDelay == null) {
      blockForgingRetryDelay = DEFAULT_BLOCK_FORGING_RETRY_DELAY;
    }
    let blockReceiveTimeout = blockForgingInterval * receiveBlockTimeoutFactor;

    let ldposClient;
    let forgingWalletAddress;

    if (options.forgingPassphrase) {
      ldposClient = await createLDPoSClient({
        passphrase: options.forgingPassphrase,
        adapter: this.dal
      });

      forgingWalletAddress = ldposClient.getAccountAddress();
    }

    while (true) {
      // If the node is already on the latest network height, it will just return it.
      await this.catchUpWithNetwork();

      if (forgingWalletAddress && forgingWalletAddress === this.getCurrentForgingDelegateAddress()) {
        let forgedBlock = this.forgeBlock(); // TODO 222 pass transactionList as argument.

        try {
          await this.broadcastBlock(forgedBlock);
        } catch (error) {
          this.logger.error(error);
          await this.wait(blockForgingRetryDelay);
          continue;
        }
      }

      let latestBlock;
      try {
        // Will throw if block is not valid or has already been processed before.
        latestBlock = await this.receiveNextBlock(blockReceiveTimeout);
        await this.processBlock(latestBlock);
        // Propagate if block was valid and processed successfully.
        await this.broadcastBlock(latestBlock);
      } catch (error) {
        this.logger.error(error);
        continue;
      }
    }
  }

  async startTransactionPropagationLoop() {
    let channel = this.channel;
    channel.subscribe(`network:event:${this.alias}:transaction`, async (event) => {
      let transaction = event.data;

      if (transaction && this.pendingTransactionMap.has(transaction.id)) {
        this.logger.error(
          new Error(`Transaction ${transaction.id} has already been received before`)
        );
        return;
      }

      try {
        this.verifyTransaction(transaction);
      } catch (error) {
        this.logger.error(
          new Error(`Transaction is invalid - ${error.message}`)
        );
        return;
      }

      try {
        await channel.invoke('network:emit', {
          event: `${this.alias}:transaction`,
          data: transaction
        });
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
