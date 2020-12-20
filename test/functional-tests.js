const assert = require('assert');
const DAL = require('./utils/dal');
const Channel = require('./utils/channel');
const NetworkModule = require('./utils/network');
const MockLDPoSChainModule = require('./utils/chain');
const wait = require('./utils/wait');

const LDPoSChainModule = require('../index');

describe('Functional tests', async () => {
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

  describe('block forging', async () => {

    beforeEach(async () => {

    });

    describe('blocks are forged correctly', async () => {

      it('should forge blocks', async () => {

      });

    });

  });

  describe('block processing', async () => {

    beforeEach(async () => {

    });

    describe('when processing a block multiple times', async () => {

      it('should only apply changes to the affected accounts once', async () => {

      });

    });

  });

  describe('transfer transaction', async () => {

    beforeEach(async () => {

    });

    describe('valid transfer', async () => {

      it('should transfer balance from one account to another', async () => {

      });

    });

    describe('invalid transfer', async () => {

      it('should send back an error', async () => {

      });

    });

  });

  describe('vote transaction', async () => {

    beforeEach(async () => {

    });

    describe('valid vote', async () => {

      it('should update the top delegate list', async () => {

      });

    });

    describe('invalid vote', async () => {

      it('should send back an error', async () => {

      });

    });

  });

  describe('unvote transaction', async () => {

    beforeEach(async () => {

    });

    describe('valid unvote', async () => {

      it('should update the top delegate list', async () => {

      });

    });

    describe('invalid unvote', async () => {

      it('should send back an error', async () => {

      });

    });

  });

  describe('registerMultisig transaction', async () => {

    beforeEach(async () => {

    });

    describe('valid registerMultisig', async () => {

      it('should convert sig account into multisig account', async () => {

      });

    });

    describe('multiple valid registerMultisig', async () => {

      it('should support re-registering an existing multisig wallet with a different set of member addresses', async () => {

      });

    });

    describe('invalid registerMultisig', async () => {

      it('should send back an error', async () => {

      });

    });

  });

  describe('init transaction', async () => {

    beforeEach(async () => {

    });

    describe('valid init', async () => {

      it('should add all the necessary keys on the account', async () => {

      });

    });

    describe('multiple valid init', async () => {

      it('should support re-initializing a wallet with a different set of public keys', async () => {

      });

    });

    describe('invalid init', async () => {

      it('should send back an error', async () => {

      });

    });

  });

});
