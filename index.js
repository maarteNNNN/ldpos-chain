const pkg = require('./package.json');
const crypto = require('crypto');
const genesisBlock = require('./genesis/testnet/genesis.json');
const { createLDPoSClient } = require('ldpos-client');

const DEFAULT_MODULE_ALIAS = 'ldpos_chain';
const DEFAULT_GENESIS_PATH = './genesis/mainnet/genesis.json';
const DEFAULT_RECEIVE_BLOCK_TIMEOUT_FACTOR = 1.5;

module.exports = class LDPoSChainModule {
  constructor(options) {
    this.alias = options.alias || DEFAULT_MODULE_ALIAS;
    this.logger = options.logger;
    if (options.dal) {
      this.dal = options.dal;
    } else {
      // TODO 222: Default to postgres adapter as Data Access Layer
    }
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
  }

  async receiveNextBlock(timeout) {
    // TODO 222
  }

  async startBlockProcessingLoop() {
    let options = this.options;
    let {
      blockForgingInterval,
      receiveBlockTimeoutFactor
    } = options;

    if (!receiveBlockTimeoutFactor) {
      receiveBlockTimeoutFactor = DEFAULT_RECEIVE_BLOCK_TIMEOUT_FACTOR;
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
      let latestHeight = await this.catchUpWithNetwork();

      this.nodeHeight = latestHeight;
      this.networkHeight = latestHeight;

      let latestBlock = await this.receiveNextBlock(blockReceiveTimeout);

      if (forgingWalletAddress) {
        // TODO 222
      }
    }
  }

  async load(channel, options) {
    this.options = options;
    this.channel = channel;

    this.genesis = require(options.genesisPath || DEFAULT_GENESIS_PATH);
    await this.dal.init({
      genesis: this.genesis
    });

    this.startBlockProcessingLoop();

    channel.publish(`${this.alias}:bootstrap`);
  }

  async unload() {

  }
};
