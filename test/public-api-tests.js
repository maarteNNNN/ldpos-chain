const assert = require('assert');
const Channel = require('./utils/channel');
const NetworkModule = require('./utils/network');
const AppModule = require('./utils/app');
const MockLDPoSChainModule = require('./utils/chain');
const { sha256 } = require('./utils/hash');
const wait = require('./utils/wait');
const { createClient } = require('ldpos-client');

const LDPoSChainModule = require('../index');

describe('Public API tests', async () => {
  let chainModule;
  let dal;
  let adapter;
  let channel;
  let options;
  let bootstrapEventTriggered;
  let clientForger;
  let chainChangeEvents;

  beforeEach(async () => {
    chainModule = new LDPoSChainModule({
      config: {
        dal: {
          libPath: './test/utils/dal'
        }
      },
      logger: {
        info: () => {},
        // info: (...args) => console.info.apply(console, args),
        warn: (...args) => console.warn.apply(console, args),
        error: (...args) => console.error.apply(console, args)
      }
    });

    dal = chainModule.dal;

    adapter = {
      getNetworkSymbol: async () => {
        return chainModule.actions.getNetworkSymbol.handler();
      },
      getAccount: async (walletAddress) => {
        return chainModule.actions.getAccount.handler({ params: { walletAddress } });
      },
      postTransaction: async (transaction) => {
        return chainModule.actions.postTransaction.handler({ params: { transaction } });
      }
    };

    channel = new Channel({
      modules: {
        app: new AppModule(),
        network: new NetworkModule({
          modules: {
            ldpos_chain: new MockLDPoSChainModule()
          }
        })
      }
    });

    options = {
      genesisPath: './test/utils/genesis-public-api.json',
      forgingPassphrase: 'clerk aware give dog reopen peasant duty cheese tobacco trouble gold angle',
      minTransactionsPerBlock: 0, // Enable forging empty blocks.
      forgingInterval: 10000,
      forgingBlockBroadcastDelay: 500,
      forgingSignatureBroadcastDelay: 500,
      propagationRandomness: 100,
      propagationTimeout: 5000
    };

    bootstrapEventTriggered = false;
    channel.subscribe(`${chainModule.alias}:bootstrap`, async () => {
      bootstrapEventTriggered = true;
    });

    chainChangeEvents = [];
    channel.subscribe(`${chainModule.alias}:chainChanges`, async (event) => {
      chainChangeEvents.push(event);
    });
    await chainModule.load(channel, options);
    clientForger = await createClient({
      passphrase: options.forgingPassphrase,
      adapter
    });
  });

  afterEach(async () => {
    await chainModule.unload();
  });

  describe('module actions', async () => {

    beforeEach(async () => {

    });

    describe('getAccount action', async () => {

      it('should return an account object', async () => {

      });

    });

  });

});
