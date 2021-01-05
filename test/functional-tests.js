const assert = require('assert');
const Channel = require('./utils/channel');
const NetworkModule = require('./utils/network');
const AppModule = require('./utils/app');
const MockLDPoSChainModule = require('./utils/chain');
const { sha256 } = require('./utils/hash');
const wait = require('./utils/wait');
const { createClient } = require('ldpos-client');

const LDPoSChainModule = require('../index');

describe('Functional tests', async () => {
  let chainModule;
  let dal;
  let channel;
  let options;
  let bootstrapEventTriggered;
  let clientForger;
  let chainChangeEvents;
  let walletAPassphrase;
  let clientA;

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

    bootstrapEventTriggered = false;
    channel.subscribe(`${chainModule.alias}:bootstrap`, async () => {
      bootstrapEventTriggered = true;
    });

    chainChangeEvents = [];
    channel.subscribe(`${chainModule.alias}:chainChanges`, async (event) => {
      chainChangeEvents.push(event);
    });
  });

  afterEach(async () => {
    await chainModule.unload();
  });

  describe('block forging', async () => {

    describe('with a single registered delegate', async () => {

      beforeEach(async () => {
        options = {
          genesisPath: './test/utils/genesis-functional.json',
          forgingPassphrase: 'clerk aware give dog reopen peasant duty cheese tobacco trouble gold angle',
          minTransactionsPerBlock: 0, // Enable forging empty blocks.
          forgingInterval: 5000,
          forgingBlockBroadcastDelay: 500,
          forgingSignatureBroadcastDelay: 500,
          propagationRandomness: 100,
          propagationTimeout: 2000
        };

        await chainModule.load(channel, options);
        clientForger = await createClient({
          passphrase: options.forgingPassphrase,
          adapter: dal
        });

        // Address: 69876bf9db624560b40c40368d762ad0b35d010820e0edfe40d0380ead464d5aldpos
        walletAPassphrase = 'birth select quiz process bid raccoon memory village snow cable agent bean';

        clientA = await createClient({
          passphrase: walletAPassphrase,
          adapter: dal
        });
      });

      describe('without any transactions', async () => {

        it('should forge correct number of valid blocks based on forging interval', async () => {
          await wait(12000);
          let newBlocks = chainChangeEvents.map(event => event.data.block);
          let blockList = await chainModule.actions.getBlocksFromHeight.handler({ height: 1, limit: 100 });

          // Can be 3 blocks if the node launches near the end of the first timeslot.
          let blockCount = newBlocks.length;
          assert.equal(blockCount === 2 || blockCount === 3, true);
          assert.equal(newBlocks[0].previousBlockId, null);
          for (let i = 1; i < blockCount; i++) {
            let previousBlock = newBlocks[i - 1];
            let block = newBlocks[i];
            assert.equal(block.previousBlockId, previousBlock.id);
          }
          for (let i = 0; i < blockCount; i++) {
            let block = newBlocks[i];
            assert.equal(block.height, i + 1);
            assert.equal(block.timestamp % 5000, 0);
            assert.equal(block.forgerAddress, '5c75e6041a05d266914cbf3837da81e29b4a7e66b9f9f8804809e914f6012293ldpos');
            assert.equal(typeof block.forgingPublicKey, 'string');
            assert.equal(typeof block.nextForgingPublicKey, 'string');
            assert.equal(typeof block.nextForgingKeyIndex, 'number');
            assert.equal(typeof block.id, 'string');
            assert.equal(block.numberOfTransactions, 0);
          }
        });

      });

      describe('with transactions', async () => {

        beforeEach(async () => {
          for (let i = 0; i < 10; i++) {
            await wait(600);

            // Recipient passphrase: genius shoulder into daring armor proof cycle bench patrol paper grant picture
            let preparedTxn = clientA.prepareTransaction({
              type: 'transfer',
              recipientAddress: '1072f65df680b2767f55a6bcd505b68d90d227d6d8b2d340fe97aaa016ab6dd7ldpos',
              amount: `${i + 1}00000000`,
              fee: `${i + 1}0000000`,
              timestamp: 100000,
              message: ''
            });
            await chainModule.actions.postTransaction.handler({
              transaction: preparedTxn
            });
          }

          await wait(7000);
        });

        it('should forge valid blocks which contain the correct number of transactions', async () => {
          let newBlocks = chainChangeEvents.map(event => event.data.block);
          let blockList = await chainModule.actions.getBlocksFromHeight.handler({ height: 1, limit: 100 });
          let totalTxnCount = 0;

          for (let block of blockList) {
            totalTxnCount += block.numberOfTransactions;
          }
          assert.equal(totalTxnCount, 10);
        });

      });

    });

  });

  describe('block processing', async () => {

    beforeEach(async () => {
      options = {
        genesisPath: './test/utils/genesis-functional.json',
        forgingPassphrase: 'clerk aware give dog reopen peasant duty cheese tobacco trouble gold angle',
        minTransactionsPerBlock: 0, // Enable forging empty blocks.
        forgingInterval: 5000,
        forgingBlockBroadcastDelay: 500,
        forgingSignatureBroadcastDelay: 500,
        propagationRandomness: 100,
        propagationTimeout: 2000
      };

      await chainModule.load(channel, options);
      clientForger = await createClient({
        passphrase: options.forgingPassphrase,
        adapter: dal
      });

      // Address: 69876bf9db624560b40c40368d762ad0b35d010820e0edfe40d0380ead464d5aldpos
      walletAPassphrase = 'birth select quiz process bid raccoon memory village snow cable agent bean';

      clientA = await createClient({
        passphrase: walletAPassphrase,
        adapter: dal
      });
    });

    describe('when processing blocks containing valid transactions', async () => {

      beforeEach(async () => {
        for (let i = 0; i < 10; i++) {
          await wait(600);

          // Recipient passphrase: genius shoulder into daring armor proof cycle bench patrol paper grant picture
          let preparedTxn = clientA.prepareTransaction({
            type: 'transfer',
            recipientAddress: '1072f65df680b2767f55a6bcd505b68d90d227d6d8b2d340fe97aaa016ab6dd7ldpos',
            amount: `${i + 1}00000000`,
            fee: `${i + 1}0000000`,
            timestamp: 100000,
            message: ''
          });
          await chainModule.actions.postTransaction.handler({
            transaction: preparedTxn
          });
        }

        await wait(7000);
      });

      it('should process all valid transactions within blocks and correctly update account balances', async () => {
        let newBlocks = chainChangeEvents.map(event => event.data.block);
        let blockList = await chainModule.actions.getBlocksFromHeight.handler({ height: 1, limit: 100 });
        let totalTxnCount = 0;
        let txnList = [];

        for (let block of blockList) {
          totalTxnCount += block.numberOfTransactions;
          let blockTxns = await chainModule.actions.getTransactionsFromBlock.handler({ blockId: block.id, offset: 0 });
          for (let txn of blockTxns) {
            txnList.push(txn);
          }
        }
        assert.equal(totalTxnCount, 10);
        assert.equal(txnList.length, 10);

        let [senderAccount, recipientAccount] = await Promise.all([
          chainModule.actions.getAccount.handler({
            walletAddress: clientA.walletAddress
          }),
          chainModule.actions.getAccount.handler({
            walletAddress: '1072f65df680b2767f55a6bcd505b68d90d227d6d8b2d340fe97aaa016ab6dd7ldpos'
          })
        ]);

        let initialAmount = 1000;
        let expectedSentAmount = 55;
        let expectedFees = 5.5;
        let unitSize = 100000000;
        assert.equal(senderAccount.balance, String((initialAmount - expectedSentAmount - expectedFees) * unitSize));
        assert.equal(recipientAccount.balance, String(expectedSentAmount * unitSize));
      });

    });

    describe('when processing a block multiple times', async () => {
      let realUpsertBlockMethod;

      beforeEach(async () => {
        let hasFailed = false;
        realUpsertBlockMethod = chainModule.dal.upsertBlock;
        chainModule.dal.upsertBlock = function (...args) {
          let block = args[0];
          // Fail the first time only. This should force the block at height 2 to be re-processed.
          if (block.height === 2 && !hasFailed) {
            hasFailed = true;
            throw new Error('Failed to upsert block because of simulated database connection issue');
          }
          return realUpsertBlockMethod.apply(this, args);
        };
        for (let i = 0; i < 10; i++) {
          await wait(600);

          // Recipient passphrase: genius shoulder into daring armor proof cycle bench patrol paper grant picture
          let preparedTxn = clientA.prepareTransaction({
            type: 'transfer',
            recipientAddress: '1072f65df680b2767f55a6bcd505b68d90d227d6d8b2d340fe97aaa016ab6dd7ldpos',
            amount: `${i + 1}00000000`,
            fee: `${i + 1}0000000`,
            timestamp: 100000,
            message: ''
          });
          await chainModule.actions.postTransaction.handler({
            transaction: preparedTxn
          });
        }

        await wait(12000);
      });

      afterEach(async () => {
        chainModule.dal.upsertBlock = realUpsertBlockMethod;
      });

      it('should update the state in an idempotent way', async () => {
        let newBlocks = chainChangeEvents.map(event => event.data.block);
        let blockList = await chainModule.actions.getBlocksFromHeight.handler({ height: 1, limit: 100 });
        let totalTxnCount = 0;
        let txnList = [];

        assert.equal(blockList.length >= 2, true);

        assert.equal(blockList[0].height, 1);
        assert.equal(blockList[1].height, 2);

        for (let block of blockList) {
          totalTxnCount += block.numberOfTransactions;
          let blockTxns = await chainModule.actions.getTransactionsFromBlock.handler({ blockId: block.id, offset: 0 });
          for (let txn of blockTxns) {
            txnList.push(txn);
          }
        }
        assert.equal(totalTxnCount, 10);
        assert.equal(txnList.length, 10);

        let [senderAccount, recipientAccount] = await Promise.all([
          chainModule.actions.getAccount.handler({
            walletAddress: clientA.walletAddress
          }),
          chainModule.actions.getAccount.handler({
            walletAddress: '1072f65df680b2767f55a6bcd505b68d90d227d6d8b2d340fe97aaa016ab6dd7ldpos'
          })
        ]);

        let initialAmount = 1000;
        let expectedSentAmount = 55;
        let expectedFees = 5.5;
        let unitSize = 100000000;
        assert.equal(senderAccount.balance, String((initialAmount - expectedSentAmount - expectedFees) * unitSize));
        assert.equal(recipientAccount.balance, String(expectedSentAmount * unitSize));
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

  describe('registerMultisigWallet transaction', async () => {

    beforeEach(async () => {

    });

    describe('valid registerMultisigWallet', async () => {

      it('should convert sig account into multisig wallet', async () => {

      });

    });

    describe('multiple valid registerMultisigWallet', async () => {

      it('should support re-registering an existing multisig wallet with a different set of member addresses', async () => {

      });

    });

    describe('invalid registerMultisigWallet', async () => {

      it('should send back an error', async () => {

      });

    });

  });

  describe('registerSigDetails transaction', async () => {

    beforeEach(async () => {

    });

    describe('valid registerSigDetails', async () => {

      it('should add all the necessary keys on the account', async () => {

      });

    });

    describe('multiple valid registerSigDetails', async () => {

      it('should support re-registering a wallet with a different set of public keys', async () => {

      });

    });

    describe('invalid registerSigDetails', async () => {

      it('should send back an error', async () => {

      });

    });

  });

  describe('registerMultisigDetails transaction', async () => {

    beforeEach(async () => {

    });

    describe('valid registerMultisigDetails', async () => {

      it('should add all the necessary keys on the account', async () => {

      });

    });

    describe('multiple valid registerMultisigDetails', async () => {

      it('should support re-registering a wallet with a different set of public keys', async () => {

      });

    });

    describe('invalid registerMultisigDetails', async () => {

      it('should send back an error', async () => {

      });

    });

  });

  describe('registerForgingDetails transaction', async () => {

    beforeEach(async () => {

    });

    describe('valid registerForgingDetails', async () => {

      it('should add all the necessary keys on the account', async () => {

      });

    });

    describe('multiple valid registerForgingDetails', async () => {

      it('should support re-registering a wallet with a different set of public keys', async () => {

      });

    });

    describe('invalid registerForgingDetails', async () => {

      it('should send back an error', async () => {

      });

    });

  });
});
