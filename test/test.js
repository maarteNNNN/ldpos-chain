const assert = require('assert');
const DAL = require('./utils/dal');
const Channel = require('./utils/channel');
const NetworkModule = require('./utils/network');
const MockLDPoSChainModule = require('./utils/chain');
const wait = require('./utils/wait');

const LDPoSChainModule = require('../index');

describe('Unit tests', async () => {
  let chainModule;
  let channel;
  let options;

  beforeEach(async () => {
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
      stakingPassphrase: 'save tree rib blouse weapon broccoli finger tenant accuse taste copper cinnamon'
    };

    await chainModule.load(channel, options);
  });

  afterEach(async () => {
    await chainModule.unload();
  });

  describe('Core methods', async () => {

    it('should trigger bootstrap event after launch', async () => {
      let bootstrapEventTriggered = false;
      channel.subscribe(`${chainModule.alias}:bootstrap`, async () => {
        bootstrapEventTriggered = true;
      });
      chainModule.load(channel, options);
      await wait(200);
      assert.equal(bootstrapEventTriggered, true);
    });

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

  describe('postTransactionBundle action', async () => {

    it('should expose a postTransactionBundle action', async () => {

    });

  });

  describe('chainChanges event', async () => {

    it('should expose a chainChanges event', async () => {

    });

  });
});
