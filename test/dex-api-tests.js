const assert = require('assert');
const DAL = require('./utils/dal');
const Channel = require('./utils/channel');
const NetworkModule = require('./utils/network');
const MockLDPoSChainModule = require('./utils/chain');
const { sha256 } = require('./utils/hash');
const wait = require('./utils/wait');
const { createClient } = require('ldpos-client');

const LDPoSChainModule = require('../index');

// This test suite can be adapted to check whether or not a custom chain module is compatible with Lisk DEX.
// All the boilerplate can be modified except the 'it' blocks where the assertions are made.
// If a module passes all the test case cases in this file, then it is compatible with Lisk DEX.

describe('DEX API tests', async () => {
  let chainModule;
  let dal;
  let channel;
  let options;
  let bootstrapEventTriggered;
  let client;

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
    client = await createClient({
      passphrase: options.forgingPassphrase,
      adapter: dal
    });
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

    let memberAddessList;
    let memberAccounts = [];
    let multisigAccount;
    let transactionList = [];

    beforeEach(async () => {
      // Passphrase: panic test motion image soldier cloth script spice trigger magnet accident add
      multisigAccount = {
        address: 'f1515e20713e5eb02dcfac71a1b5f6b426ffd9c080097c9d9ac6bbcc392c4fbfldpos',
        forgingKeyIndex: 0,
        forgingPublicKey: 'yEEktni3Otjqo0CRZ190fPTQvPZ7ad7aa2H2bPI6viM=',
        multisigKeyIndex: 0,
        multisigPublicKey: 'Ciq+Jx/kCYjxKvGcqiJPuBDFQpbkuqcplszbdOUkXNk=',
        sigKeyIndex: 0,
        sigPublicKey: '8VFeIHE+XrAtz6xxobX2tCb/2cCACXydmsa7zDksT78=',
        balance: '100000000000'
      };

      memberAccounts = [
        // Passphrase: birth select quiz process bid raccoon memory village snow cable agent bean
        {
          address: '69876bf9db624560b40c40368d762ad0b35d010820e0edfe40d0380ead464d5aldpos',
          forgingKeyIndex: 0,
          forgingPublicKey: 'B8qadp7ACj2vjlkgHPxdZokgRGhQgOBiBbw3PixiDG4=',
          multisigKeyIndex: 0,
          multisigPublicKey: '8Qmoim5x5GiLDeNNjX48bId/NSgUz0WIt5cf+DeMBJ0=',
          sigKeyIndex: 0,
          sigPublicKey: 'aYdr+dtiRWC0DEA2jXYq0LNdAQgg4O3+QNA4Dq1GTVo=',
          balance: '10000000000'
        },
        // Passphrase: genius shoulder into daring armor proof cycle bench patrol paper grant picture
        {
          address: '1072f65df680b2767f55a6bcd505b68d90d227d6d8b2d340fe97aaa016ab6dd7ldpos',
          forgingKeyIndex: 0,
          forgingPublicKey: 'BD849jw/q+a4iNCx/9S/dcTFwzCd8M6bGxGqzSvydKU=',
          multisigKeyIndex: 0,
          multisigPublicKey: 'fcPqQCjP5JiErw49QKWWRXtXDKgVRUIJzQgqC3n2co4=',
          sigKeyIndex: 0,
          sigPublicKey: 'EHL2XfaAsnZ/Vaa81QW2jZDSJ9bYstNA/peqoBarbdc=',
          balance: '20000000000'
        },
        // Passphrase: emotion belt burden flash vital neglect old census dress kid ocean warfare
        {
          address: '484a487b1c12b8f46dfe9f15e7fe79ceb88d2c3f76ba39680ae5279a04e7e842ldpos',
          forgingKeyIndex: 0,
          forgingPublicKey: 'hkMI/VZcN7e5zGDRgXiJFdUEXVmaNAv9DMXUXzusc7Q=',
          multisigKeyIndex: 0,
          multisigPublicKey: 'Vfh2TLCRB0ZngEDTVgfU0/FJ5+4BiR36M+uk47IO+oE=',
          sigKeyIndex: 0,
          sigPublicKey: 'SEpIexwSuPRt/p8V5/55zriNLD92ujloCuUnmgTn6EI=',
          balance: '30000000000'
        }
      ];

      transactionList = [
        {
          type: 'transfer',
          recipientAddress: '1072f65df680b2767f55a6bcd505b68d90d227d6d8b2d340fe97aaa016ab6dd7ldpos',
          amount: '1100000000',
          fee: '100000000',
          timestamp: 1608470523757,
          data: ''
        },
        {
          type: 'transfer',
          recipientAddress: '484a487b1c12b8f46dfe9f15e7fe79ceb88d2c3f76ba39680ae5279a04e7e842ldpos',
          amount: '1200000000',
          fee: '100000000',
          timestamp: 1608470600000,
          data: ''
        }
      ].map(txn => client.prepareTransaction(txn));

      memberAddessList = memberAccounts.map(account => account.address);
      for (let account of memberAccounts) {
        await dal.upsertAccount(account);
      }
      await dal.upsertAccount(multisigAccount);
      await dal.registerMultisigWallet(multisigAccount.address, memberAddessList, 2);
      for (let transaction of transactionList) {
        let simplifiedTxn = chainModule.simplifyTransaction(transaction);
        await dal.upsertTransaction(simplifiedTxn);
      }
    });

    describe('getMultisigWalletMembers action', async () => {

      it('should return an array of member addresses', async () => {
        let walletMembers = await chainModule.actions.getMultisigWalletMembers.handler({
          walletAddress: multisigAccount.address
        });
        assert.equal(JSON.stringify(walletMembers), JSON.stringify(memberAddessList));
      });

      it('should throw a MultisigAccountDidNotExistError if the multisig wallet address does not exist', async () => {
        let caughtError = null;
        try {
          await chainModule.actions.getMultisigWalletMembers.handler({
            walletAddress: '1bbcb6922ca73d835a398fa09614054aecfaee465a31259bb6a845c9a37e2058ldpos'
          });
        } catch (error) {
          caughtError = error;
        }
        assert.notEqual(caughtError, null);
        assert.equal(caughtError.type, 'InvalidActionError');
        assert.equal(caughtError.name, 'MultisigAccountDidNotExistError');
      });

    });

    describe('getMinMultisigRequiredSignatures action', async () => {

      it('should return the number of required signatures', async () => {
        let requiredSignatureCount = await chainModule.actions.getMinMultisigRequiredSignatures.handler({
          walletAddress: multisigAccount.address
        });
        assert.equal(requiredSignatureCount, 2);
      });

      it('should throw an AccountDidNotExistError if the wallet address does not exist', async () => {
        let caughtError = null;
        try {
          await chainModule.actions.getMinMultisigRequiredSignatures.handler({
            walletAddress: '1bbcb6922ca73d835a398fa09614054aecfaee465a31259bb6a845c9a37e2058ldpos'
          });
        } catch (error) {
          caughtError = error;
        }
        assert.notEqual(caughtError, null);
        assert.equal(caughtError.type, 'InvalidActionError');
        assert.equal(caughtError.name, 'AccountDidNotExistError');
      });

      it('should throw an AccountWasNotMultisigError if the account is not a multisig account', async () => {
        let caughtError = null;
        try {
          await chainModule.actions.getMinMultisigRequiredSignatures.handler({
            walletAddress: '484a487b1c12b8f46dfe9f15e7fe79ceb88d2c3f76ba39680ae5279a04e7e842ldpos'
          });
        } catch (error) {
          caughtError = error;
        }
        assert.notEqual(caughtError, null);
        assert.equal(caughtError.type, 'InvalidActionError');
        assert.equal(caughtError.name, 'AccountWasNotMultisigError');
      });

    });

    describe('getOutboundTransactions action', async () => {

      it('should return an array of transactions sent from the specified walletAddress', async () => {
        let transactions = await chainModule.actions.getOutboundTransactions.handler({
          walletAddress: client.accountAddress,
          fromTimestamp: 0,
          limit: 100
        });
        assert.equal(transactions.length, 2);
        assert.equal(transactions[0].senderAddress, client.accountAddress);
        assert.equal(transactions[0].id, 'pBi4ac6v8RCaLL1vz2PpyjHwx8nyEhkp2YjAPBYJJLM=');
        assert.equal(transactions[1].senderAddress, client.accountAddress);
        assert.equal(transactions[1].id, '8FZkstZsspGrU+caJUIhuBVgpp9zAdU9wU/zngAZNr8=');
      });

      it('should only return transactions which are more recent than fromTimestamp', async () => {
        let transactions = await chainModule.actions.getOutboundTransactions.handler({
          walletAddress: client.accountAddress,
          fromTimestamp: 1608470523800,
          limit: 100
        });
        assert.equal(transactions.length, 1);
        assert.equal(transactions[0].senderAddress, client.accountAddress);
        assert.equal(transactions[0].id, '8FZkstZsspGrU+caJUIhuBVgpp9zAdU9wU/zngAZNr8=');
      });

      it('should limit the number of transactions based on the specified limit', async () => {
        let transactions = await chainModule.actions.getOutboundTransactions.handler({
          walletAddress: client.accountAddress,
          fromTimestamp: 0,
          limit: 1
        });
        assert.equal(transactions.length, 1);
        assert.equal(transactions[0].senderAddress, client.accountAddress);
        assert.equal(transactions[0].id, 'pBi4ac6v8RCaLL1vz2PpyjHwx8nyEhkp2YjAPBYJJLM=');
      });

      it('should return an empty array if no transactions can be matched', async () => {
        let transactions = await chainModule.actions.getOutboundTransactions.handler({
          walletAddress: '1bbcb6922ca73d835a398fa09614054aecfaee465a31259bb6a845c9a37e2058ldpos',
          fromTimestamp: 0,
          limit: 100
        });
        assert.equal(transactions.length, 0);
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
