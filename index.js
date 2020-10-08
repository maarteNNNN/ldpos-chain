const pkg = require('./package.json');
const crypto = require('crypto');
const genesisBlock = require('./genesis/testnet/genesis.json');
const { createLDPoSClient } = require('ldpos-client');

const DEFAULT_MODULE_ALIAS = 'ldpos_chain';
const DEFAULT_GENESIS_PATH = './genesis/mainnet/genesis.json';
const DEFAULT_RECEIVE_BLOCK_TIMEOUT_FACTOR = 1.5;
const DEFAULT_BLOCK_FORGING_RETRY_DELAY = 1000;
const DEFAULT_DELEGATE_COUNT = 21;

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

  async receiveLatestBlock(height, timeout) {
    // TODO 2222 If timeout is undefined, wait forever until block is received.

    // TODO 222
    // As part of validation, check that all the transactions in the newly
    // received block are inside our pendingTransactionMap.
  }

  async receiveLatestBlockSignatures(latestBlock, requiredSignatureCount, timeout) {

  }

  async getCurrentBlockTimeSlot() {
    let { blockForgingInterval } = this.options;
    return Math.round(Date.now() / blockForgingInterval) * blockForgingInterval;
  }

  async getCurrentForgingDelegateAddress() {

  }

  forgeBlock(height, transactionList) {

  }

  async processBlock(block) {

  }

  verifyTransaction(transaction) {

  }

  verifyBlock(block) {

  }

  verifySignature(signature) {

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

  }

  async startBlockProcessingLoop() {
    let options = this.options;
    let channel = this.channel;

    let {
      blockForgingInterval,
      receiveBlockTimeoutFactor,
      delegateCount
    } = options;

    if (receiveBlockTimeoutFactor == null) {
      receiveBlockTimeoutFactor = DEFAULT_RECEIVE_BLOCK_TIMEOUT_FACTOR;
    }
    if (delegateCount == null) {
      delegateCount = DEFAULT_DELEGATE_COUNT;
    }
    let delegateMajorityCount = Math.ceil(delegateCount / 2);
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
    this.ldposClient = ldposClient;
    this.nodeHeight = await this.dal.getLatestHeight();

    while (true) {
      this.latestBlockSignatureMap.clear();
      // If the node is already on the latest network height, it will just return it.
      this.networkHeight = await this.catchUpWithNetwork();
      this.nodeHeight = this.networkHeight;
      let nextHeight = this.networkHeight + 1;

      let isCurrentForgingDelegate = forgingWalletAddress && forgingWalletAddress === this.getCurrentForgingDelegateAddress();

      (async () => {
        if (isCurrentForgingDelegate) {
          let forgedBlock = this.forgeBlock(nextHeight); // TODO 222 pass transactionList as argument.
          try {
            await this.broadcastBlock(forgedBlock);
          } catch (error) {
            this.logger.error(error);
          }
        }
      })();

      try {
        // Will throw if block is not valid or has already been processed before.
        latestBlock = await this.receiveLatestBlock(nextHeight, blockReceiveTimeout);

        if (forgingWalletAddress && !isCurrentForgingDelegate) {
          (async () => {
            try {
              let selfSignature = await this.signBlock(latestBlock);
              this.latestBlockSignatureMap.set(selfSignature.id, selfSignature);
              await this.broadcastBlockSignature(selfSignature);
            } catch (error) {
              this.logger.error(error);
            }
          })();
        }

        // Will throw if the required number of valid signatures cannot be gathered in time.
        latestBlockSignatures = await this.receiveLatestBlockSignatures(latestBlock, delegateMajorityCount, blockReceiveTimeout);
        this.latestBlock = {
          ...latestBlock,
          signatures: latestBlockSignatures
        };
        this.nodeHeight = nextHeight;
        this.networkHeight = nextHeight;
        await this.processBlock(latestBlock);
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

      try {
        this.verifyTransaction(transaction);
      } catch (error) {
        this.logger.error(
          new Error(`Transaction is invalid - ${error.message}`)
        );
        return;
      }

      if (this.pendingTransactionMap.has(transaction.id)) {
        this.logger.error(
          new Error(`Transaction ${transaction.id} has already been received before`)
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

  async startBlockPropagationLoop() {
    let channel = this.channel;
    channel.subscribe(`network:event:${this.alias}:block`, async (event) => {
      let block = event.data;

      try {
        this.verifyBlock(block); // TODO 222: Make sure that block is valid and references appropriate height
      } catch (error) {
        this.logger.error(
          new Error(`Block is invalid - ${error.message}`)
        );
        return;
      }

      if (this.latestBlock && this.latestBlock.id === block.id) {
        this.logger.error(
          new Error(`Block ${block.id} has already been received before`)
        );
        return;
      }

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
      let signature = event.data;

      try {
        this.verifySignature(signature); // TODO 222: Make sure that signature is valid and references appropriate block ID and height
      } catch (error) {
        this.logger.error(
          new Error(`Block signature is invalid - ${error.message}`)
        );
        return;
      }

      if (this.latestBlockSignatureMap.has(signature.id)) {
        this.logger.error(
          new Error(`Block signature ${signature.id} has already been received before`)
        );
        return;
      }

      try {
        await this.broadcastBlockSignature(signature);
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
