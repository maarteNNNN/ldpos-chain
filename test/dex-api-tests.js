const assert = require('assert');
const Channel = require('./utils/channel');
const NetworkModule = require('./utils/network');
const AppModule = require('./utils/app');
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
      genesisPath: './test/utils/genesis.json',
      forgingPassphrase: 'clerk aware give dog reopen peasant duty cheese tobacco trouble gold angle',
      minTransactionsPerBlock: 0, // Enable forging empty blocks.
      forgingInterval: 5000
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
    let blockList = [];

    let clientA;
    let multisigMemberAPassphrase;
    let clientB;
    let multisigMemberBPassphrase;

    beforeEach(async () => {
      multisigMemberAPassphrase = 'birth select quiz process bid raccoon memory village snow cable agent bean';
      multisigMemberBPassphrase = 'genius shoulder into daring armor proof cycle bench patrol paper grant picture';

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

      memberAddessList = memberAccounts.map(account => account.address);
      for (let account of memberAccounts) {
        await dal.upsertAccount(account);
      }
      await dal.upsertAccount(multisigAccount);
      await dal.registerMultisigWallet(multisigAccount.address, memberAddessList, 2);

      clientA = await createClient({
        passphrase: multisigMemberAPassphrase,
        adapter: dal
      });
      clientB = await createClient({
        passphrase: multisigMemberBPassphrase,
        adapter: dal
      });

      let lastBlockId = null;

      blockList = [
        {
          height: 1,
          timestamp: 30000,
          previousBlockId: null,
          transactions: [
            {
              type: 'transfer',
              recipientAddress: '1072f65df680b2767f55a6bcd505b68d90d227d6d8b2d340fe97aaa016ab6dd7ldpos',
              amount: '1100000000',
              fee: '100000000',
              timestamp: 10000,
              message: ''
            },
            {
              type: 'transfer',
              recipientAddress: '484a487b1c12b8f46dfe9f15e7fe79ceb88d2c3f76ba39680ae5279a04e7e842ldpos',
              amount: '1200000000',
              fee: '100000000',
              timestamp: 20000,
              message: ''
            }
          ]
        },
        {
          height: 2,
          timestamp: 60000,
          previousBlockId: null,
          transactions: [
            {
              type: 'transfer',
              recipientAddress: '484a487b1c12b8f46dfe9f15e7fe79ceb88d2c3f76ba39680ae5279a04e7e842ldpos',
              amount: '1300000000',
              fee: '100000000',
              timestamp: 30000,
              message: ''
            }
          ]
        },
        {
          height: 3,
          timestamp: 90000,
          previousBlockId: null,
          transactions: [
            {
              type: 'transfer',
              recipientAddress: '484a487b1c12b8f46dfe9f15e7fe79ceb88d2c3f76ba39680ae5279a04e7e842ldpos',
              amount: '1300000000',
              fee: '100000000',
              timestamp: 80000,
              message: ''
            }
          ]
        }
      ].map(block => {
        block.previousBlockId = lastBlockId;
        let preparedBlock = clientForger.prepareBlock(block);
        let { transactions, ...preparedBlockWithoutTxns } = preparedBlock;
        lastBlockId = preparedBlockWithoutTxns.id;

        if (block.height === 3) {
          return {
            height: preparedBlockWithoutTxns.height,
            timestamp: preparedBlockWithoutTxns.timestamp,
            previousBlockId: preparedBlockWithoutTxns.previousBlockId,
            transactions: transactions.map((txn) => {
              let multisigTxn = clientForger.prepareMultisigTransaction(txn);
              let signatureA = clientA.signMultisigTransaction(multisigTxn);
              let signatureB = clientB.signMultisigTransaction(multisigTxn);
              multisigTxn.signatures = [signatureA, signatureB];
              return chainModule.simplifyTransaction(multisigTxn);
            }),
            ...preparedBlockWithoutTxns
          };
        }

        return {
          height: preparedBlockWithoutTxns.height,
          timestamp: preparedBlockWithoutTxns.timestamp,
          previousBlockId: preparedBlockWithoutTxns.previousBlockId,
          transactions: transactions.map(
            txn => chainModule.simplifyTransaction(clientForger.prepareTransaction(txn))
          ),
          ...preparedBlockWithoutTxns
        };
      });

      for (let block of blockList) {
        await dal.upsertBlock(block);
      }
    });

    describe('getMultisigWalletMembers action', async () => {

      it('should return an array of member addresses', async () => {
        let walletMembers = await chainModule.actions.getMultisigWalletMembers.handler({
          walletAddress: multisigAccount.address
        });
        // Must be an array of wallet address strings.
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
          walletAddress: clientForger.walletAddress,
          fromTimestamp: 0,
          limit: 100
        });
        assert.equal(Array.isArray(transactions), true);
        assert.equal(transactions.length, 4);
        assert.equal(transactions[0].senderAddress, clientForger.walletAddress);
        assert.equal(transactions[0].id, 'dB/wCCZ5kP461cIJPABMdSL9K2R6trqdi7TnSwm0XMg=');
        assert.equal(transactions[1].senderAddress, clientForger.walletAddress);
        assert.equal(transactions[1].id, 'toogeZxTosL9zEfnf3ZxWeM6oTt5zcgfk6An5dMrbPo=');
        assert.equal(transactions[2].senderAddress, clientForger.walletAddress);
        assert.equal(transactions[2].id, 'ex8EXOTP0dp/KAn7b2lWwtxRCSC5730Vsd4Tln1DXSo=');
        assert.equal(transactions[3].senderAddress, clientForger.walletAddress);
        assert.equal(transactions[3].id, 'bH+gZE+ruBySeUtr3MQXu7ONqKIba1PsmQcpbCx9oXE=');

        for (let txn of transactions) {
          assert.equal(typeof txn.id, 'string');
          assert.equal(typeof txn.message, 'string');
          assert.equal(typeof txn.amount, 'string');
          assert.equal(Number.isNaN(Number(txn.amount)), false);
          assert.equal(Number.isInteger(txn.timestamp), true);
        }
      });

      it('should return transactions which are more recent than fromTimestamp', async () => {
        let transactions = await chainModule.actions.getOutboundTransactions.handler({
          walletAddress: clientForger.walletAddress,
          fromTimestamp: 15000,
          limit: 100
        });
        assert.equal(Array.isArray(transactions), true);
        assert.equal(transactions.length, 3);
        assert.equal(transactions[0].senderAddress, clientForger.walletAddress);
        assert.equal(transactions[0].id, 'toogeZxTosL9zEfnf3ZxWeM6oTt5zcgfk6An5dMrbPo=');
        assert.equal(transactions[1].senderAddress, clientForger.walletAddress);
        assert.equal(transactions[1].id, 'ex8EXOTP0dp/KAn7b2lWwtxRCSC5730Vsd4Tln1DXSo=');
        assert.equal(transactions[2].senderAddress, clientForger.walletAddress);
        assert.equal(transactions[2].id, 'bH+gZE+ruBySeUtr3MQXu7ONqKIba1PsmQcpbCx9oXE=');
      });

      it('should limit the number of transactions based on the specified limit', async () => {
        let transactions = await chainModule.actions.getOutboundTransactions.handler({
          walletAddress: clientForger.walletAddress,
          fromTimestamp: 0,
          limit: 1
        });
        assert.equal(Array.isArray(transactions), true);
        assert.equal(transactions.length, 1);
        assert.equal(transactions[0].senderAddress, clientForger.walletAddress);
        assert.equal(transactions[0].id, 'dB/wCCZ5kP461cIJPABMdSL9K2R6trqdi7TnSwm0XMg=');
      });

      it('should return an empty array if no transactions can be matched', async () => {
        let transactions = await chainModule.actions.getOutboundTransactions.handler({
          walletAddress: '1bbcb6922ca73d835a398fa09614054aecfaee465a31259bb6a845c9a37e2058ldpos',
          fromTimestamp: 0,
          limit: 100
        });
        assert.equal(Array.isArray(transactions), true);
        assert.equal(transactions.length, 0);
      });

    });

    describe('getInboundTransactionsFromBlock action', async () => {

      it('should return an array of transactions sent to the specified walletAddress', async () => {
        let recipientAddress = '484a487b1c12b8f46dfe9f15e7fe79ceb88d2c3f76ba39680ae5279a04e7e842ldpos';
        let transactions = await chainModule.actions.getInboundTransactionsFromBlock.handler({
          walletAddress: recipientAddress,
          blockId: blockList[0].id
        });
        assert.equal(Array.isArray(transactions), true);
        assert.equal(transactions.length, 1);
        let txn = transactions[0];

        assert.equal(typeof txn.id, 'string');
        assert.equal(typeof txn.message, 'string');
        assert.equal(typeof txn.amount, 'string');
        assert.equal(Number.isNaN(Number(txn.amount)), false);
        assert.equal(Number.isInteger(txn.timestamp), true);
        assert.equal(typeof txn.senderAddress, 'string');
        assert.equal(typeof txn.recipientAddress, 'string');

        assert.equal(transactions[0].recipientAddress, recipientAddress);
        assert.equal(transactions[0].id, 'toogeZxTosL9zEfnf3ZxWeM6oTt5zcgfk6An5dMrbPo=');
      });

      it('should return an empty array if no transactions match the specified blockId', async () => {
        let recipientAddress = '484a487b1c12b8f46dfe9f15e7fe79ceb88d2c3f76ba39680ae5279a04e7e842ldpos';
        let transactions = await chainModule.actions.getInboundTransactionsFromBlock.handler({
          walletAddress: recipientAddress,
          blockId: 'abc9f15e7de79cebc87d2c3f76ba39480ae5279a12e='
        });
        assert.equal(Array.isArray(transactions), true);
        assert.equal(transactions.length, 0);
      });

      it('should return an empty array if no transactions match the specified walletAddress', async () => {
        let recipientAddress = '484a487b1c12b8f46dfe9f15e7fe79ceb88d2c3f76ba39680ae5279a04e7e842ldpos';
        let transactions = await chainModule.actions.getInboundTransactionsFromBlock.handler({
          walletAddress: '1bbcb6922ca73d835a398fa09614054aecfaee465a31259bb6a845c9a37e2058ldpos',
          blockId: 'dfa9f15e7fe79cebc88d2c3f76ba39680ae5279a14e='
        });
        assert.equal(Array.isArray(transactions), true);
        assert.equal(transactions.length, 0);
      });

    });

    describe('getOutboundTransactionsFromBlock action', async () => {

      it('should return an array of transactions sent to the specified walletAddress', async () => {
        let transactions = await chainModule.actions.getOutboundTransactionsFromBlock.handler({
          walletAddress: clientForger.walletAddress,
          blockId: blockList[0].id
        });
        assert.equal(Array.isArray(transactions), true);
        assert.equal(transactions.length, 2);

        for (let txn of transactions) {
          assert.equal(typeof txn.id, 'string');
          assert.equal(typeof txn.message, 'string');
          assert.equal(typeof txn.amount, 'string');
          assert.equal(Number.isNaN(Number(txn.amount)), false);
          assert.equal(Number.isInteger(txn.timestamp), true);
          assert.equal(typeof txn.senderAddress, 'string');
          assert.equal(typeof txn.recipientAddress, 'string');
        }

        assert.equal(transactions[0].senderAddress, clientForger.walletAddress);
        assert.equal(transactions[0].id, 'dB/wCCZ5kP461cIJPABMdSL9K2R6trqdi7TnSwm0XMg=');
        assert.equal(transactions[1].senderAddress, clientForger.walletAddress);
        assert.equal(transactions[1].id, 'toogeZxTosL9zEfnf3ZxWeM6oTt5zcgfk6An5dMrbPo=');
      });

      it('should return transactions with a valid signatures property if transaction is from a multisig account', async () => {
        let transactions = await chainModule.actions.getOutboundTransactionsFromBlock.handler({
          walletAddress: clientForger.walletAddress,
          blockId: blockList[2].id
        });
        assert.equal(Array.isArray(transactions), true);
        assert.equal(transactions.length, 1);
        let txn = transactions[0];

        assert.equal(typeof txn.id, 'string');
        assert.equal(typeof txn.message, 'string');
        assert.equal(typeof txn.amount, 'string');
        assert.equal(Number.isNaN(Number(txn.amount)), false);
        assert.equal(Number.isInteger(txn.timestamp), true);
        assert.equal(Array.isArray(txn.signatures), true);
        for (let signature of txn.signatures) {
          assert.notEqual(signature, null);
          assert.equal(typeof signature.signerAddress, 'string');
        }
        assert.equal(typeof txn.senderAddress, 'string');
        assert.equal(typeof txn.recipientAddress, 'string');
      });

      it('should return an empty array if no transactions match the specified blockId', async () => {
        let transactions = await chainModule.actions.getOutboundTransactionsFromBlock.handler({
          walletAddress: clientForger.walletAddress,
          blockId: 'abc9f15e7de79cebc87d2c3f76ba39480ae5279a12e='
        });
        assert.equal(Array.isArray(transactions), true);
        assert.equal(transactions.length, 0);
      });

      it('should return an empty array if no transactions match the specified walletAddress', async () => {
        let transactions = await chainModule.actions.getOutboundTransactionsFromBlock.handler({
          walletAddress: '1bbcb6922ca73d835a398fa09614054aecfaee465a31259bb6a845c9a37e2058ldpos',
          blockId: 'dfa9f15e7fe79cebc88d2c3f76ba39680ae5279a14e='
        });
        assert.equal(Array.isArray(transactions), true);
        assert.equal(transactions.length, 0);
      });

    });

    describe('getLastBlockAtTimestamp action', async () => {

      it('should return the highest block which is below the specified timestamp', async () => {
        let block = await chainModule.actions.getLastBlockAtTimestamp.handler({
          timestamp: 31000
        });
        assert.notEqual(block, null);
        assert.equal(block.height, 1);
      });

      it('should throw a BlockDidNotExistError error if no block can be found before the specified timestamp', async () => {
        let caughtError = null;
        try {
          await chainModule.actions.getLastBlockAtTimestamp.handler({
            timestamp: 29000
          });
        } catch (error) {
          caughtError = error;
        }
        assert.notEqual(caughtError, null);
        assert.equal(caughtError.type, 'InvalidActionError');
        assert.equal(caughtError.name, 'BlockDidNotExistError');
      });

    });

    describe('getMaxBlockHeight action', async () => {

      it('should return the height of the block as an integer number', async () => {
        let height = await chainModule.actions.getMaxBlockHeight.handler();
        assert.equal(height, 3);
      });

    });

    describe('getBlocksBetweenHeights action', async () => {

      it('should return blocks whose height is greater than fromHeight and less than or equal to toHeight', async () => {
        let blocks = await chainModule.actions.getBlocksBetweenHeights.handler({
          fromHeight: 1,
          toHeight: 2,
          limit: 100
        });
        assert.equal(Array.isArray(blocks), true);
        assert.equal(blocks.length, 1);
        let block = blocks[0];
        assert.equal(typeof block.id, 'string');
        assert.equal(Number.isInteger(block.timestamp), true);
        assert.equal(block.height, 2);
      });

      it('should return blocks whose height is greater than fromHeight and less than or equal to toHeight', async () => {
        let blocks = await chainModule.actions.getBlocksBetweenHeights.handler({
          fromHeight: 0,
          toHeight: 2,
          limit: 1
        });
        assert.equal(Array.isArray(blocks), true);
        assert.equal(blocks.length, 1);
        assert.equal(blocks[0].height, 1);
      });

      it('should return an empty array if no blocks are matched', async () => {
        let blocks = await chainModule.actions.getBlocksBetweenHeights.handler({
          fromHeight: 9,
          toHeight: 10,
          limit: 10
        });
        assert.equal(Array.isArray(blocks), true);
        assert.equal(blocks.length, 0);
      });

    });

    describe('getBlockAtHeight action', async () => {

      it('should expose a getBlockAtHeight action', async () => {
        let block = await chainModule.actions.getBlockAtHeight.handler({
          height: 2
        });
        assert.notEqual(block, null);
        assert.equal(block.height, 2);
        assert.equal(Number.isInteger(block.timestamp), true);
      });

      it('should throw a BlockDidNotExistError if no block could be matched', async () => {
        let caughtError = null;
        try {
          await chainModule.actions.getBlockAtHeight.handler({
            height: 9
          });
        } catch (error) {
          caughtError = error;
        }
        assert.notEqual(caughtError, null);
        assert.equal(caughtError.type, 'InvalidActionError');
        assert.equal(caughtError.name, 'BlockDidNotExistError');
      });

    });

    describe('postTransaction action', async () => {

      it('should accept a prepared (signed) transaction object as argument', async () => {
        // The format of the prepared (signed) transaction may be different depending on the
        // implementation of the chain module.
        let preparedTxn = clientForger.prepareTransaction({
          type: 'transfer',
          recipientAddress: '484a487b1c12b8f46dfe9f15e7fe79ceb88d2c3f76ba39680ae5279a04e7e842ldpos',
          amount: '3300000000',
          fee: '100000000',
          timestamp: 100000,
          message: ''
        });
        await chainModule.actions.postTransaction.handler({
          transaction: preparedTxn
        });
      });

    });

  });

  describe('module events', async () => {

    it('should trigger bootstrap event after launch', async () => {
      await wait(200);
      assert.equal(bootstrapEventTriggered, true);
    });

    it('should expose a chainChanges event', async () => {
      await wait(7000);
      assert.equal(chainChangeEvents.length >=1, true);
      let eventData = chainChangeEvents[0].data;
      assert.equal(eventData.type, 'addBlock');
      let { block } = eventData;
      assert.notEqual(block, null);
      assert.equal(block.height, 2);
      assert.equal(Number.isInteger(block.timestamp), true);
    });

  });

});
