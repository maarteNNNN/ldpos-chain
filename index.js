const pkg = require('./package.json');
const crypto = require('crypto');
const genesisBlock = require('./genesis/testnet/genesis.json');
const { createLPoSClient } = require('lpos-client');

const DEFAULT_MODULE_ALIAS = 'lpos_chain';
const DEFAULT_MAX_CANDIDACY_LIST_LENGTH = 100;
const DEFAULT_GENESIS_PATH = './genesis/mainnet/genesis.json';

module.exports = class LPoSChainModule {
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

  getCandidacyListHash(candidacyMap) {
    // TODO make sure that the order is deterministic
    return 'TODO 222';
  }

  validateCandidacyList(candidacyList) {
    if (!candidacyList) {
      throw new Error('Received falsy candidacy list');
    }
    let maxCandidacyListLength = this.options.maxCandidacyListLength == null ? DEFAULT_MAX_CANDIDACY_LIST_LENGTH : this.options.maxCandidacyListLength;
    if (candidacyList.length > maxCandidacyListLength) {
      throw new Error('The received candidacy list was too long');
    }
    // TODO 222 Additional checks of candidacies (schema)
  }

  sanitizeCandidacyMap(candidacyMap) {
    // TODO 222: Sort based on balance and remove the elements at index greater than or equal to maxCandidacyListLength.
    // Keep the balance on the candidacy object?
  }

  async load(channel, options) {
    this.options = options;
    this.channel = channel;

    this.genesis = require(options.genesisPath || DEFAULT_GENESIS_PATH);
    await this.dal.init({
      genesis: this.genesis
    });

    this.lposClient = await createLPoSClient({
      network: 'lpos',
      passphrase: options.stakingPassphrase,
      adapter: this.dal
    });

    this._stakingPassphrase = options.stakingPassphrase;
    this._stakingWalletAddress = this.lposClient.getAccountAddress();
    this._candidacyMap = {};
    this._candidacyListHash = null;

    let processedCandidacyPeerSet = {};
    let processedCandidacyListHashSet = {};

    channel.subscribe(`network:event:${this.alias}:candidacyListHash`, async (event) => {
      let currentHash = event.data;
      if (currentHash !== this._candidacyListHash) {
        let peerId = event.info.peerId;
        if (processedCandidacyPeerSet.has(peerId)) {
          // Do not request candidacy list from a peer which we have already requested in the current broadcast interval.
          return;
        }
        processedCandidacyPeerSet.add(peerId);
        if (processedCandidacyListHashSet.has(currentHash)) {
          // Do not request candidacy list if we already have the hash for it.
          return;
        }
        processedCandidacyListHashSet.add(currentHash);

        let candidacyList = await channel.invoke('network:requestFromPeer', {
          procedure: `${this.alias}:getCandidacyList`,
          data: null,
          peerId
        });

        try {
          this.validateCandidacyList(candidacyList);
        } catch (error) {
          this.logger.warn(error);
          return;
        }

        await Promise.all(
          candidacyList.map(async (candidacyToken) => {
            if (!this._candidacyMap[candidacyToken.candidateAddress]) {
              let candidateBalance;
              try {
                candidateBalance = await this.dal.getAccountBalance(candidacyToken.candidateAddress);
              } catch (error) {
                this.logger.error(
                  `Failed to get wallet balance for candidate wallet address ${
                    candidacyToken.candidateAddress
                  } because of error: ${
                    error.message
                  }`
                );
                return;
              }
              this._candidacyMap[candidacyToken.candidateAddress] = {
                ...candidacyToken,
                candidateBalance
              };
            }
          })
        );

        this.sanitizeCandidacyMap(this._candidacyMap);
      }
    });

    this._candidacyListBroadcastIntervalId = setInterval(async () => {
      if (this._stakingPassphrase) {
        if (!this._candidacyMap[this._stakingWalletAddress]) {
          try {
            let candidacyToken = this.lposClient.generateCandidacyToken();
            let candidateBalance = await this.dal.getAccountBalance(candidacyToken.candidateAddress);
            this._candidacyMap[candidacyToken.candidateAddress] = {
              ...candidacyToken,
              candidateBalance
            };
          } catch (error) {
            this.logger.error(`Failed to generate candidacy token because of error: ${error.message}`);
          }
        }
      }
      let candidacyListHash = this.getCandidacyListHash(this._candidacyMap);
      this._candidacyListHash = candidacyListHash;
      channel.invoke('network:emit', {
        event: `${this.alias}:candidacyListHash`,
        data: candidacyListHash
      });
      processedCandidacyPeerSet.clear();
      processedCandidacyListHashSet.clear();
    }, this.options.candidacyListBroadcastInterval);

    channel.publish(`${this.alias}:bootstrap`);
  }

  async unload() {
    clearInterval(this._candidacyListBroadcastIntervalId);
  }
};
