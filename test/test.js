const assert = require('assert');
const DAL = require('./utils/dal');
const Channel = require('./utils/channel');
const LDPoSChainModule = require('../index');

describe('Unit tests', async () => {
  let chainModule;
  let channel;
  let options;

  beforeEach(async () => {
    chainModule = new LDPoSChainModule({
      candidateListBroadcastInterval: 5000,
      dal: new DAL()
    });
    channel = new Channel();
    options = {
      genesisPath: './utils/genesis.json',
      stakingPassphrase: 'save tree rib blouse weapon broccoli finger tenant accuse taste copper cinnamon'
    };

    await chainModule.load(channel, options);
  });

  describe('Core methods', async () => {

    it('should trigger bootstrap event after launch', async () => {

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

  describe('postTransactions action', async () => {

    it('should expose a postTransactions action', async () => {

    });

  });

  describe('chainChanges event', async () => {

    it('should expose a chainChanges event', async () => {

    });

  });
});
