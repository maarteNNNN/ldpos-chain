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
      }
    });

    dal = chainModule.dal;

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
      adapter: dal
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
