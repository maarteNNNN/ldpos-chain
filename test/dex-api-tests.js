const assert = require('assert');
const DAL = require('./utils/dal');
const Channel = require('./utils/channel');
const NetworkModule = require('./utils/network');
const MockLDPoSChainModule = require('./utils/chain');
const wait = require('./utils/wait');

const LDPoSChainModule = require('../index');

// This test suite can be adapted to check whether or not a custom chain module is compatible with Lisk DEX.

describe('DEX API tests', async () => {
  let chainModule;
  let channel;
  let options;
  let bootstrapEventTriggered;

  beforeEach(async () => {
    // This boilerplate logic can be replaced with that of an alterantive chain module with different mocks.
    chainModule = new LDPoSChainModule({
      dal: new DAL()
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

  describe('module state', async () => {

    it('should expose an info property', async () => {
      let moduleInfo = chainModule.info;
      assert.equal(!!moduleInfo.author, true);
      assert.equal(!!moduleInfo.version, true);
      assert.equal(!!moduleInfo.name, true);
    });

    it('should expose an alias property', async () => {
      assert.equal(!!chainModule.alias, true);
    });

    it('should expose an events property', async () => {
      let events = chainModule.events;
      assert.equal(events.includes('bootstrap'), true);
      assert.equal(events.includes('chainChanges'), true);
    });

  });

  describe('module actions', async () => {

    describe('getMultisigWalletMembers action', async () => {

      it('should expose a getMultisigWalletMembers action', async () => {

      });

    });

    describe('getMinMultisigRequiredSignatures action', async () => {

      it('should expose a getMinMultisigRequiredSignatures action', async () => {

      });

    });

    describe('getOutboundTransactions action', async () => {

      it('should expose a getOutboundTransactions action', async () => {

      });

    });

    describe('getInboundTransactionsFromBlock action', async () => {

      it('should expose a getInboundTransactionsFromBlock action', async () => {

      });

    });

    describe('getOutboundTransactionsFromBlock action', async () => {

      it('should expose a getOutboundTransactionsFromBlock action', async () => {

      });

    });

    describe('getLastBlockAtTimestamp action', async () => {

      it('should expose a getLastBlockAtTimestamp action', async () => {

      });

    });

    describe('getMaxBlockHeight action', async () => {

      it('should expose a getMaxBlockHeight action', async () => {

      });

    });

    describe('getBlocksBetweenHeights action', async () => {

      it('should expose a getBlocksBetweenHeights action', async () => {

      });

    });

    describe('getBlockAtHeight action', async () => {

      it('should expose a getBlockAtHeight action', async () => {

      });

    });

    describe('postTransaction action', async () => {

      it('should expose a postTransaction action', async () => {

      });

    });

    describe('postSignature action', async () => {

      it('should expose a postSignature action', async () => {

      });

    });

  });

  describe('module events', async () => {

    it('should trigger bootstrap event after launch', async () => {
      await wait(200);
      assert.equal(bootstrapEventTriggered, true);
    });

    it('should expose a chainChanges event', async () => {

    });

  });

});
