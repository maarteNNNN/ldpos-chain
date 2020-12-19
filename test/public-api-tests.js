const assert = require('assert');
const DAL = require('./utils/dal');
const Channel = require('./utils/channel');
const NetworkModule = require('./utils/network');
const MockLDPoSChainModule = require('./utils/chain');
const wait = require('./utils/wait');

const LDPoSChainModule = require('../index');

describe('Public API tests', async () => {
  let chainModule;
  let dal;
  let channel;
  let options;
  let bootstrapEventTriggered;

  beforeEach(async () => {
    dal = new DAL();

    chainModule = new LDPoSChainModule({
      dal
    });
    channel = new Channel({
      modules: {
        network: new NetworkModule({
          modules: {
            ldpos_chain: new MockLDPoSChainModule()
          }
        })
      }
    });
    options = {
      genesisPath: './test/utils/genesis.json',
      forgingPassphrase: 'clerk aware give dog reopen peasant duty cheese tobacco trouble gold angle'
    };

    bootstrapEventTriggered = false;
    channel.subscribe(`${chainModule.alias}:bootstrap`, async () => {
      bootstrapEventTriggered = true;
    });
    await chainModule.load(channel, options);
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
