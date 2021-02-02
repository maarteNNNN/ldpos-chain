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
  let adapter;
  let store;
  let channel;
  let options;
  let bootstrapEventTriggered;
  let clientForger;
  let chainChangeEvents;
  let walletAPassphrase;
  let clientA;
  let clientB;

  beforeEach(async () => {
    chainModule = new LDPoSChainModule({
      config: {
        components: {
          dal: {
            libPath: './test/utils/dal'
          }
        }
      },
      logger: {
        info: () => {},
        // info: (...args) => console.info.apply(console, args),
        debug: () => {},
        // debug: (...args) => console.debug.apply(console, args),
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

    store = {
      saveItem: async () => {},
      loadItem: async () => {
        return '0';
      },
      deleteItem: async () => {}
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
        // Forger address: ldpos092188ca7934529fc624acf62f2b6ce96c316742
        options = {
          genesisPath: './test/utils/genesis-functional.json',
          forgingPassphrase: 'clerk aware give dog reopen peasant duty cheese tobacco trouble gold angle',
          minTransactionsPerBlock: 0, // Enable forging empty blocks.
          forgingInterval: 5000,
          forgingBlockBroadcastDelay: 200,
          forgingSignatureBroadcastDelay: 200,
          propagationRandomness: 100,
          propagationTimeout: 3000
        };

        await chainModule.load(channel, options);
        clientForger = createClient({
          adapter,
          store
        });
        await clientForger.connect({
          passphrase: options.forgingPassphrase
        });

        // Address: ldpos660c22683a6d466f66740042677ed1adc8bb723b
        walletAPassphrase = 'birth select quiz process bid raccoon memory village snow cable agent bean';

        clientA = createClient({
          adapter,
          store
        });
        await clientA.connect({
          passphrase: walletAPassphrase
        });
      });

      describe('without any transactions', async () => {

        it('should forge correct number of valid blocks based on forging interval', async () => {
          await wait(12000);
          let newBlocks = chainChangeEvents.map(event => event.data.block);
          let blockList = await chainModule.actions.getBlocksFromHeight.handler({
            params: {
              height: 1,
              limit: 100
            }
          });

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
            assert.equal(block.forgerAddress, 'ldpos092188ca7934529fc624acf62f2b6ce96c316742');
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
            let preparedTxn = await clientA.prepareTransaction({
              type: 'transfer',
              recipientAddress: 'ldpos772e25778a36dc33a7c00115471d270ead1458c1',
              amount: `${i + 1}00000000`,
              fee: `${i + 1}0000000`,
              timestamp: 100000,
              message: ''
            });
            await chainModule.actions.postTransaction.handler({
              params: {
                transaction: preparedTxn
              }
            });
          }

          await wait(8000);
        });

        it('should forge valid blocks which contain the correct number of transactions', async () => {
          let newBlocks = chainChangeEvents.map(event => event.data.block);
          let blockList = await chainModule.actions.getBlocksFromHeight.handler({
            params: {
              height: 1,
              limit: 100
            }
          });
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

    let multisigClient;

    beforeEach(async () => {
      options = {
        genesisPath: './test/utils/genesis-functional.json',
        forgingPassphrase: 'clerk aware give dog reopen peasant duty cheese tobacco trouble gold angle',
        minTransactionsPerBlock: 0, // Enable forging empty blocks.
        forgingInterval: 5000,
        forgingBlockBroadcastDelay: 500,
        forgingSignatureBroadcastDelay: 500,
        propagationRandomness: 100,
        propagationTimeout: 3000
      };

      await chainModule.load(channel, options);
      await wait(2000);
      clientForger = createClient({
        adapter,
        store
      });
      await clientForger.connect({
        passphrase: options.forgingPassphrase
      });

      // Address: ldpos660c22683a6d466f66740042677ed1adc8bb723b
      walletAPassphrase = 'birth select quiz process bid raccoon memory village snow cable agent bean';

      clientA = createClient({
        adapter,
        store
      });
      await clientA.connect({
        passphrase: walletAPassphrase
      });
    });

    describe('when processing blocks which contain valid sig transfer transactions', async () => {

      beforeEach(async () => {
        for (let i = 0; i < 10; i++) {
          await wait(600);

          // Recipient passphrase: genius shoulder into daring armor proof cycle bench patrol paper grant picture
          let preparedTxn = await clientA.prepareTransaction({
            type: 'transfer',
            recipientAddress: 'ldpos772e25778a36dc33a7c00115471d270ead1458c1',
            amount: `${i + 1}00000000`,
            fee: `${i + 1}0000000`,
            timestamp: 100000,
            message: ''
          });
          await chainModule.actions.postTransaction.handler({
            params: {
              transaction: preparedTxn
            }
          });
        }

        await wait(8000);
      });

      it('should process all valid transactions within blocks and correctly update account balances', async () => {
        let newBlocks = chainChangeEvents.map(event => event.data.block);
        let blockList = await chainModule.actions.getBlocksFromHeight.handler({
          params: {
            height: 1,
            limit: 100
          }
        });
        let totalTxnCount = 0;
        let txnList = [];

        for (let block of blockList) {
          totalTxnCount += block.numberOfTransactions;
          let blockTxns = await chainModule.actions.getTransactionsFromBlock.handler({
            params: {
              blockId: block.id,
              offset: 0
            }
          });
          for (let txn of blockTxns) {
            txnList.push(txn);
          }
        }
        assert.equal(totalTxnCount, 10);
        assert.equal(txnList.length, 10);

        let [senderAccount, recipientAccount] = await Promise.all([
          chainModule.actions.getAccount.handler({
            params: {
              walletAddress: clientA.walletAddress
            }
          }),
          chainModule.actions.getAccount.handler({
            params: {
              walletAddress: 'ldpos772e25778a36dc33a7c00115471d270ead1458c1'
            }
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

    describe('when processing a block multiple times which contains sig transactions due to database connection failure', async () => {
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
          let preparedTxn = await clientA.prepareTransaction({
            type: 'transfer',
            recipientAddress: 'ldpos772e25778a36dc33a7c00115471d270ead1458c1',
            amount: `${i + 1}00000000`,
            fee: `${i + 1}0000000`,
            timestamp: 100000,
            message: ''
          });
          await chainModule.actions.postTransaction.handler({
            params: {
              transaction: preparedTxn
            }
          });
        }

        await wait(8000);
      });

      afterEach(async () => {
        chainModule.dal.upsertBlock = realUpsertBlockMethod;
      });

      it('should update the state in an idempotent way', async () => {
        let newBlocks = chainChangeEvents.map(event => event.data.block);
        let blockList = await chainModule.actions.getBlocksFromHeight.handler({
          params: {
            height: 1,
            limit: 100
          }
        });
        let totalTxnCount = 0;
        let txnList = [];

        assert.equal(blockList.length >= 2, true);

        assert.equal(blockList[0].height, 1);
        assert.equal(blockList[1].height, 2);

        for (let block of blockList) {
          totalTxnCount += block.numberOfTransactions;
          let blockTxns = await chainModule.actions.getTransactionsFromBlock.handler({
            params: {
              blockId: block.id,
              offset: 0
            }
          });
          for (let txn of blockTxns) {
            txnList.push(txn);
          }
        }
        assert.equal(totalTxnCount, 10);
        assert.equal(txnList.length, 10);

        let [senderAccount, recipientAccount] = await Promise.all([
          chainModule.actions.getAccount.handler({
            params: {
              walletAddress: clientA.walletAddress
            }
          }),
          chainModule.actions.getAccount.handler({
            params: {
              walletAddress: 'ldpos772e25778a36dc33a7c00115471d270ead1458c1'
            }
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

    describe('when processing blocks which contain valid multisig transfer transactions', async () => {

      beforeEach(async () => {

        // Address: ldposea87e8bf7de70528b70bd9ef4d22c2169815bd2e
        multisigClient = createClient({
          adapter,
          store
        });
        await multisigClient.connect({
          passphrase: 'guitar sight absurd copper right amount habit boat trigger bundle high pudding'
        });

        // Address: ldpos859d1e3fe282683bc9e88475cb3389551f72e9b7
        clientB = createClient({
          adapter,
          store
        });
        await clientB.connect({
          passphrase: 'trip timber saddle fine shock orbit lamp nominee subject pledge random wedding'
        });

        for (let i = 0; i < 5; i++) {
          await wait(1200);

          // Recipient passphrase: genius shoulder into daring armor proof cycle bench patrol paper grant picture
          let preparedTxn = multisigClient.prepareMultisigTransaction({
            type: 'transfer',
            recipientAddress: 'ldpos772e25778a36dc33a7c00115471d270ead1458c1',
            amount: `${i + 1}00000000`,
            fee: `${i + 1}0000000`,
            timestamp: 100000,
            message: ''
          });

          let memberASignature = await clientA.signMultisigTransaction(preparedTxn);
          let memberBSignature = await clientB.signMultisigTransaction(preparedTxn);

          multisigClient.attachMultisigTransactionSignature(preparedTxn, memberASignature);
          multisigClient.attachMultisigTransactionSignature(preparedTxn, memberBSignature);

          await chainModule.actions.postTransaction.handler({
            params: {
              transaction: preparedTxn
            }
          });
        }

        await wait(8000);
      });

      it('should process all valid transactions within blocks and correctly update account balances', async () => {
        let newBlocks = chainChangeEvents.map(event => event.data.block);
        let blockList = await chainModule.actions.getBlocksFromHeight.handler({
          params: {
            height: 1,
            limit: 100
          }
        });
        let totalTxnCount = 0;
        let txnList = [];

        for (let block of blockList) {
          totalTxnCount += block.numberOfTransactions;
          let blockTxns = await chainModule.actions.getTransactionsFromBlock.handler({
            params: {
              blockId: block.id,
              offset: 0
            }
          });
          for (let txn of blockTxns) {
            txnList.push(txn);
          }
        }
        assert.equal(totalTxnCount, 5);
        assert.equal(txnList.length, 5);

        let [senderAccount, recipientAccount] = await Promise.all([
          chainModule.actions.getAccount.handler({
            params: {
              walletAddress: multisigClient.walletAddress
            }
          }),
          chainModule.actions.getAccount.handler({
            params: {
              walletAddress: 'ldpos772e25778a36dc33a7c00115471d270ead1458c1'
            }
          })
        ]);

        let initialAmount = 300;
        let expectedSentAmount = 15;
        let expectedFees = 1.5;
        let unitSize = 100000000;
        assert.equal(senderAccount.balance, String((initialAmount - expectedSentAmount - expectedFees) * unitSize));
        assert.equal(recipientAccount.balance, String(expectedSentAmount * unitSize));
      });

    });

    describe('when processing a block multiple times which contains multisig transactions due to database connection failure', async () => {
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

        multisigClient = createClient({
          adapter,
          store
        });
        await multisigClient.connect({
          passphrase: 'guitar sight absurd copper right amount habit boat trigger bundle high pudding'
        });

        clientB = createClient({
          adapter,
          store
        });
        await clientB.connect({
          passphrase: 'trip timber saddle fine shock orbit lamp nominee subject pledge random wedding'
        });

        for (let i = 0; i < 5; i++) {
          await wait(1200);

          // Recipient passphrase: genius shoulder into daring armor proof cycle bench patrol paper grant picture
          let preparedTxn = multisigClient.prepareMultisigTransaction({
            type: 'transfer',
            recipientAddress: 'ldpos772e25778a36dc33a7c00115471d270ead1458c1',
            amount: `${i + 1}00000000`,
            fee: `${i + 1}0000000`,
            timestamp: 100000,
            message: ''
          });

          let memberASignature = await clientA.signMultisigTransaction(preparedTxn);
          let memberBSignature = await clientB.signMultisigTransaction(preparedTxn);

          multisigClient.attachMultisigTransactionSignature(preparedTxn, memberASignature);
          multisigClient.attachMultisigTransactionSignature(preparedTxn, memberBSignature);

          await chainModule.actions.postTransaction.handler({
            params: {
              transaction: preparedTxn
            }
          });
        }

        await wait(8000);
      });

      afterEach(async () => {
        chainModule.dal.upsertBlock = realUpsertBlockMethod;
      });

      it('should update the state in an idempotent way', async () => {
        let newBlocks = chainChangeEvents.map(event => event.data.block);
        let blockList = await chainModule.actions.getBlocksFromHeight.handler({
          params: {
            height: 1,
            limit: 100
          }
        });
        let totalTxnCount = 0;
        let txnList = [];

        assert.equal(blockList.length >= 2, true);

        assert.equal(blockList[0].height, 1);
        assert.equal(blockList[1].height, 2);

        for (let block of blockList) {
          totalTxnCount += block.numberOfTransactions;
          let blockTxns = await chainModule.actions.getTransactionsFromBlock.handler({
            params: {
              blockId: block.id,
              offset: 0
            }
          });
          for (let txn of blockTxns) {
            txnList.push(txn);
          }
        }
        assert.equal(totalTxnCount, 5);
        assert.equal(txnList.length, 5);

        let [senderAccount, recipientAccount] = await Promise.all([
          chainModule.actions.getAccount.handler({
            params: {
              walletAddress: multisigClient.walletAddress
            }
          }),
          chainModule.actions.getAccount.handler({
            params: {
              walletAddress: 'ldpos772e25778a36dc33a7c00115471d270ead1458c1'
            }
          })
        ]);

        let initialAmount = 300;
        let expectedSentAmount = 15;
        let expectedFees = 1.5;
        let unitSize = 100000000;
        assert.equal(senderAccount.balance, String((initialAmount - expectedSentAmount - expectedFees) * unitSize));
        assert.equal(recipientAccount.balance, String(expectedSentAmount * unitSize));
      });

    });

  });

  describe('transfer transaction', async () => {

    beforeEach(async () => {
      options = {
        genesisPath: './test/utils/genesis-functional.json',
        forgingPassphrase: 'clerk aware give dog reopen peasant duty cheese tobacco trouble gold angle',
        minTransactionsPerBlock: 0, // Enable forging empty blocks.
        forgingInterval: 5000,
        forgingBlockBroadcastDelay: 500,
        forgingSignatureBroadcastDelay: 500,
        propagationRandomness: 100,
        propagationTimeout: 3000
      };

      await chainModule.load(channel, options);
      clientForger = createClient({
        adapter,
        store
      });
      await clientForger.connect({
        passphrase: options.forgingPassphrase
      });

      // Address: ldpos660c22683a6d466f66740042677ed1adc8bb723b
      walletAPassphrase = 'birth select quiz process bid raccoon memory village snow cable agent bean';

      clientA = createClient({
        adapter,
        store
      });
      await clientA.connect({
        passphrase: walletAPassphrase
      });
    });

    describe('valid transfers', async () => {

      let firstRecipientClient;

      beforeEach(async () => {
        // Recipient passphrase: genius shoulder into daring armor proof cycle bench patrol paper grant picture
        let preparedTxn = await clientA.prepareTransaction({
          type: 'transfer',
          recipientAddress: 'ldpos772e25778a36dc33a7c00115471d270ead1458c1',
          amount: '10000000000',
          fee: '10000000',
          timestamp: 100000,
          message: ''
        });
        await chainModule.actions.postTransaction.handler({
          params: {
            transaction: preparedTxn
          }
        });

        await wait(8000);

        firstRecipientClient = createClient({
          adapter,
          store
        });
        await firstRecipientClient.connect({
          passphrase: 'genius shoulder into daring armor proof cycle bench patrol paper grant picture'
        });

        // Recipient passphrase: sniff there advice door hand eyebrow story eyebrow brief window mushroom legend
        let firstRecipientPreparedTxn = await firstRecipientClient.prepareTransaction({
          type: 'transfer',
          recipientAddress: 'ldpos115c785c9132993179e6c30885b61f73df47526b',
          amount: '500000000',
          fee: '10000000',
          timestamp: 100000,
          message: ''
        });
        await chainModule.actions.postTransaction.handler({
          params: {
            transaction: firstRecipientPreparedTxn
          }
        });

        await wait(8000);
      });

      it('should update account balances', async () => {
        let [initialSenderAccount, firstRecipientAccount, secondRecipientAccount] = await Promise.all([
          chainModule.actions.getAccount.handler({
            params: {
              walletAddress: clientA.walletAddress
            }
          }),
          chainModule.actions.getAccount.handler({
            params: {
              walletAddress: firstRecipientClient.walletAddress
            }
          }),
          chainModule.actions.getAccount.handler({
            params: {
              walletAddress: 'ldpos115c785c9132993179e6c30885b61f73df47526b'
            }
          })
        ]);
        assert.notEqual(initialSenderAccount, null);
        assert.equal(initialSenderAccount.balance, '89990000000');
        assert.notEqual(firstRecipientAccount, null);
        assert.equal(firstRecipientAccount.balance, '9490000000');
        assert.notEqual(firstRecipientAccount.sigPublicKey, firstRecipientAccount.nextSigPublicKey);
        assert.notEqual(secondRecipientAccount, null);
        assert.equal(secondRecipientAccount.balance, '500000000');
      });

    });

    describe('invalid transfer', async () => {
      let caughtError;

      beforeEach(async () => {
        caughtError = null;
        // Recipient passphrase: genius shoulder into daring armor proof cycle bench patrol paper grant picture
        let preparedTxn = await clientA.prepareTransaction({
          type: 'transfer',
          recipientAddress: 'ldpos772e25778a36dc33a7c00115471d270ead1458c1',
          amount: '100000000000',
          fee: '10000000',
          timestamp: 100000,
          message: ''
        });
        try {
          await chainModule.actions.postTransaction.handler({
            params: {
              transaction: preparedTxn
            }
          });
        } catch (error) {
          caughtError = error;
        }
      });

      it('should throw an error', async () => {
        assert.notEqual(caughtError, null);
      });

    });

  });

  describe('vote transaction', async () => {

    let caughtError;

    beforeEach(async () => {
      options = {
        genesisPath: './test/utils/genesis-functional.json',
        forgingPassphrase: 'clerk aware give dog reopen peasant duty cheese tobacco trouble gold angle',
        minTransactionsPerBlock: 0, // Enable forging empty blocks.
        forgingInterval: 5000,
        forgingBlockBroadcastDelay: 500,
        forgingSignatureBroadcastDelay: 500,
        propagationRandomness: 100,
        propagationTimeout: 3000,
        maxVotesPerAccount: 2
      };

      await chainModule.load(channel, options);
      clientForger = createClient({
        adapter,
        store
      });
      await clientForger.connect({
        passphrase: options.forgingPassphrase
      });

      // Address: ldpos660c22683a6d466f66740042677ed1adc8bb723b
      walletAPassphrase = 'birth select quiz process bid raccoon memory village snow cable agent bean';

      clientA = createClient({
        adapter,
        store
      });
      await clientA.connect({
        passphrase: walletAPassphrase
      });
    });

    describe('valid vote', async () => {

      beforeEach(async () => {
        let preparedTxn = await clientA.prepareTransaction({
          type: 'vote',
          delegateAddress: 'ldpos660c22683a6d466f66740042677ed1adc8bb723b',
          fee: '20000000',
          timestamp: 100000,
          message: ''
        });
        await chainModule.actions.postTransaction.handler({
          params: {
            transaction: preparedTxn
          }
        });

        await wait(8000);
      });

      it('should update the top delegate list', async () => {
        let activeDelegatesAfterList = await chainModule.actions.getForgingDelegates.handler();
        assert.equal(Array.isArray(activeDelegatesAfterList), true);
        assert.equal(activeDelegatesAfterList.length, 2);
        assert.equal(activeDelegatesAfterList[1].address, 'ldpos660c22683a6d466f66740042677ed1adc8bb723b');
        assert.equal(activeDelegatesAfterList[1].voteWeight, '99980000000');
      });

    });

    describe('invalid vote; already voted for delegate', async () => {

      beforeEach(async () => {
        caughtError = null;

        let preparedTxn = await clientA.prepareTransaction({
          type: 'vote',
          delegateAddress: 'ldpos092188ca7934529fc624acf62f2b6ce96c316742',
          fee: '20000000',
          timestamp: 100000,
          message: ''
        });
        try {
          await chainModule.actions.postTransaction.handler({
            params: {
              transaction: preparedTxn
            }
          });
        } catch (error) {
          caughtError = error;
        }

        await wait(8000);
      });

      it('should send back an error', async () => {
        // Note that if we post multiple transactions for the same delegate in quick
        // succession, then both could end up being processed but one will be a no-op.
        // This error will only occur if the previous vote has already settled into a
        // block as is the case here.
        assert.notEqual(caughtError, null);
      });

    });

    describe('invalid vote; exceeded maximum number of votes per account', async () => {

      beforeEach(async () => {
        caughtError = null;

        let preparedTxn = await clientA.prepareTransaction({
          type: 'vote',
          delegateAddress: 'ldpos660c22683a6d466f66740042677ed1adc8bb723b',
          fee: '20000000',
          timestamp: 100000,
          message: ''
        });
        await chainModule.actions.postTransaction.handler({
          params: {
            transaction: preparedTxn
          }
        });

        let secondPreparedTxn = await clientA.prepareTransaction({
          type: 'vote',
          delegateAddress: 'ldpos859d1e3fe282683bc9e88475cb3389551f72e9b7',
          fee: '20000000',
          timestamp: 100000,
          message: ''
        });
        try {
          await chainModule.actions.postTransaction.handler({
            params: {
              transaction: secondPreparedTxn
            }
          });
        } catch (error) {
          caughtError = error;
        }

        await wait(8000);
      });

      it('should send back an error', async () => {
        let activeDelegatesAfterList = await chainModule.actions.getForgingDelegates.handler();
        // A vote transaction may be accepted even if it turns out of be a no-op.
        assert.equal(caughtError, null);
        assert.equal(Array.isArray(activeDelegatesAfterList), true);
        assert.equal(activeDelegatesAfterList.length, 2);
      });

    });

  });

  describe('unvote transaction', async () => {

    beforeEach(async () => {
      options = {
        genesisPath: './test/utils/genesis-functional.json',
        forgingPassphrase: 'clerk aware give dog reopen peasant duty cheese tobacco trouble gold angle',
        minTransactionsPerBlock: 0, // Enable forging empty blocks.
        forgingInterval: 5000,
        forgingBlockBroadcastDelay: 500,
        forgingSignatureBroadcastDelay: 500,
        propagationRandomness: 100,
        propagationTimeout: 3000
      };

      await chainModule.load(channel, options);
      clientForger = createClient({
        adapter,
        store
      });
      await clientForger.connect({
        passphrase: options.forgingPassphrase
      });

      // Address: ldpos660c22683a6d466f66740042677ed1adc8bb723b
      walletAPassphrase = 'birth select quiz process bid raccoon memory village snow cable agent bean';

      clientA = createClient({
        adapter,
        store
      });
      await clientA.connect({
        passphrase: walletAPassphrase
      });
    });

    describe('valid unvote', async () => {
      let activeDelegatesBeforeList;

      beforeEach(async () => {
        activeDelegatesBeforeList = await chainModule.actions.getForgingDelegates.handler();

        let preparedTxn = await clientA.prepareTransaction({
          type: 'unvote',
          delegateAddress: 'ldpos092188ca7934529fc624acf62f2b6ce96c316742',
          fee: '20000000',
          timestamp: 100000,
          message: ''
        });

        await chainModule.actions.postTransaction.handler({
          params: {
            transaction: preparedTxn
          }
        });

        await wait(8000);
      });

      it('should update the top delegate list', async () => {
        let account = await chainModule.actions.getAccount.handler({
          params: {
            walletAddress: clientA.walletAddress
          }
        });
        let activeDelegatesAfterList = await chainModule.actions.getForgingDelegates.handler();
        assert.equal(Array.isArray(activeDelegatesAfterList), true);
        assert.equal(activeDelegatesAfterList.length, 1);
        let expectedVoteWeight = BigInt(activeDelegatesBeforeList[0].voteWeight) - BigInt(account.balance);
        assert.equal(activeDelegatesAfterList[0].voteWeight, expectedVoteWeight.toString());
      });

    });

    describe('invalid unvote; unvoting an address which the voter is not voting for', async () => {

      let caughtError;

      beforeEach(async () => {
        activeDelegatesBeforeList = await chainModule.actions.getForgingDelegates.handler();

        let preparedTxn = await clientA.prepareTransaction({
          type: 'unvote',
          delegateAddress: 'ldpos859d1e3fe282683bc9e88475cb3389551f72e9b7',
          fee: '20000000',
          timestamp: 100000,
          message: ''
        });

        try {
          await chainModule.actions.postTransaction.handler({
            params: {
              transaction: preparedTxn
            }
          });
        } catch (error) {
          caughtError = error;
        }

        await wait(8000);
      });

      it('should send back an error', async () => {
        assert.notEqual(caughtError, null);
      });

    });

  });

  describe('registerMultisigWallet transaction', async () => {

    beforeEach(async () => {
      options = {
        genesisPath: './test/utils/genesis-functional.json',
        forgingPassphrase: 'clerk aware give dog reopen peasant duty cheese tobacco trouble gold angle',
        minTransactionsPerBlock: 0, // Enable forging empty blocks.
        forgingInterval: 5000,
        forgingBlockBroadcastDelay: 500,
        forgingSignatureBroadcastDelay: 500,
        propagationRandomness: 100,
        propagationTimeout: 3000
      };

      await chainModule.load(channel, options);
      clientForger = createClient({
        adapter,
        store
      });
      await clientForger.connect({
        passphrase: options.forgingPassphrase
      });

      // Address: ldpos660c22683a6d466f66740042677ed1adc8bb723b
      clientA = createClient({
        adapter,
        store
      });
      await clientA.connect({
        passphrase: 'birth select quiz process bid raccoon memory village snow cable agent bean'
      });

      // Address: ldpos859d1e3fe282683bc9e88475cb3389551f72e9b7
      clientB = createClient({
        adapter,
        store
      });
      await clientB.connect({
        passphrase: 'trip timber saddle fine shock orbit lamp nominee subject pledge random wedding'
      });
    });

    describe('valid registerMultisigWallet', async () => {

      let caughtError;

      beforeEach(async () => {
        let preparedTxn = await clientA.prepareTransaction({
          type: 'registerMultisigWallet',
          requiredSignatureCount: 2,
          memberAddresses: [
            'ldpos092188ca7934529fc624acf62f2b6ce96c316742',
            'ldpos859d1e3fe282683bc9e88475cb3389551f72e9b7'
          ],
          fee: '50000000',
          timestamp: 100000,
          message: ''
        });

        await chainModule.actions.postTransaction.handler({
          params: {
            transaction: preparedTxn
          }
        });

        await wait(8000);

        // Recipient passphrase: genius shoulder into daring armor proof cycle bench patrol paper grant picture
        let preparedTransferTxn = await clientA.prepareTransaction({
          type: 'transfer',
          recipientAddress: 'ldpos772e25778a36dc33a7c00115471d270ead1458c1',
          amount: '12300000000',
          fee: '10000000',
          timestamp: 100000,
          message: ''
        });
        try {
          await chainModule.actions.postTransaction.handler({
            params: {
              transaction: preparedTransferTxn
            }
          });
        } catch (error) {
          caughtError = error;
        }

        await wait(8000);
      });

      it('should convert sig account into multisig wallet', async () => {
        let account = await chainModule.actions.getAccount.handler({
          params: {
            walletAddress: clientA.walletAddress
          }
        });
        assert.equal(account.type, 'multisig');
        assert.equal(account.balance, '99950000000');
        assert.notEqual(caughtError, null);
      });

    });

    describe('multiple valid registerMultisigWallet', async () => {

      let accountBefore;
      let accountAfter;

      beforeEach(async () => {
        let preparedTxn = await clientA.prepareTransaction({
          type: 'registerMultisigWallet',
          requiredSignatureCount: 2,
          memberAddresses: [
            'ldpos092188ca7934529fc624acf62f2b6ce96c316742',
            'ldpos859d1e3fe282683bc9e88475cb3389551f72e9b7'
          ],
          fee: '50000000',
          timestamp: 100000,
          message: ''
        });

        await chainModule.actions.postTransaction.handler({
          params: {
            transaction: preparedTxn
          }
        });

        await wait(8000);

        accountBefore = await chainModule.actions.getAccount.handler({
          params: {
            walletAddress: clientA.walletAddress
          }
        });

        let preparedTxnB = await clientA.prepareMultisigTransaction({
          type: 'registerMultisigWallet',
          requiredSignatureCount: 1,
          memberAddresses: [
            'ldpos092188ca7934529fc624acf62f2b6ce96c316742'
          ],
          fee: '50000000',
          timestamp: 100000,
          message: ''
        });

        let signatureA = await clientForger.signMultisigTransaction(preparedTxnB);
        let signatureB = await clientB.signMultisigTransaction(preparedTxnB);

        clientA.attachMultisigTransactionSignature(preparedTxnB, signatureA);
        clientA.attachMultisigTransactionSignature(preparedTxnB, signatureB);

        await chainModule.actions.postTransaction.handler({
          params: {
            transaction: preparedTxnB
          }
        });

        await wait(8000);

        accountAfter = await chainModule.actions.getAccount.handler({
          params: {
            walletAddress: clientA.walletAddress
          }
        });
      });

      it('should support re-registering an existing multisig wallet with a different set of member addresses', async () => {
        assert.equal(accountBefore.requiredSignatureCount, 2);
        assert.equal(accountAfter.requiredSignatureCount, 1);
        assert.equal(accountAfter.balance, '99900000000');
      });

    });

    describe('invalid registerMultisigWallet', async () => {

      let caughtError;

      beforeEach(async () => {
        let preparedTxn = await clientA.prepareTransaction({
          type: 'registerMultisigWallet',
          requiredSignatureCount: 3,
          memberAddresses: [
            'ldpos092188ca7934529fc624acf62f2b6ce96c316742',
            'ldpos859d1e3fe282683bc9e88475cb3389551f72e9b7'
          ],
          fee: '50000000',
          timestamp: 100000,
          message: ''
        });

        try {
          await chainModule.actions.postTransaction.handler({
            params: {
              transaction: preparedTxn
            }
          });
        } catch (error) {
          caughtError = error;
        }

        await wait(8000);
      });

      it('should send back an error', async () => {
        assert.notEqual(caughtError, null);
      });

    });

  });

  describe('registerSigDetails transaction', async () => {

    let caughtError;

    beforeEach(async () => {
      caughtError = null;

      options = {
        genesisPath: './test/utils/genesis-functional.json',
        forgingPassphrase: 'clerk aware give dog reopen peasant duty cheese tobacco trouble gold angle',
        minTransactionsPerBlock: 0, // Enable forging empty blocks.
        forgingInterval: 5000,
        forgingBlockBroadcastDelay: 500,
        forgingSignatureBroadcastDelay: 500,
        propagationRandomness: 100,
        propagationTimeout: 3000
      };

      await chainModule.load(channel, options);
      clientForger = createClient({
        adapter,
        store
      });
      await clientForger.connect({
        passphrase: options.forgingPassphrase
      });

      // Address: ldpos660c22683a6d466f66740042677ed1adc8bb723b
      clientA = createClient({
        adapter,
        store
      });
      await clientA.connect({
        passphrase: 'birth select quiz process bid raccoon memory village snow cable agent bean'
      });
    });

    describe('valid registerSigDetails', async () => {

      beforeEach(async () => {
        let preparedTxn = await clientA.prepareTransaction({
          type: 'registerSigDetails',
          newSigPublicKey: clientForger.sigPublicKey,
          newNextSigPublicKey: clientForger.nextSigPublicKey,
          newNextSigKeyIndex: clientForger.sigKeyIndex + 1,
          fee: '10000000',
          timestamp: 100000,
          message: ''
        });

        await chainModule.actions.postTransaction.handler({
          params: {
            transaction: preparedTxn
          }
        });

        await wait(8000);

        // Should allow control of an account to be transferred to a different user.
        clientForger.walletAddress = 'ldpos660c22683a6d466f66740042677ed1adc8bb723b';

        // Recipient passphrase: genius shoulder into daring armor proof cycle bench patrol paper grant picture
        let preparedTxnB = await clientForger.prepareTransaction({
          type: 'transfer',
          recipientAddress: 'ldpos772e25778a36dc33a7c00115471d270ead1458c1',
          amount: '2000000000',
          fee: '10000000',
          timestamp: 100000,
          message: ''
        });

        try {
          await chainModule.actions.postTransaction.handler({
            params: {
              transaction: preparedTxnB
            }
          });
        } catch (error) {
          caughtError = error;
        }

        await wait(8000);
      });

      it('should add all the necessary keys on the account', async () => {
        let account = await chainModule.actions.getAccount.handler({
          params: {
            walletAddress: clientA.walletAddress
          }
        });
        assert.equal(caughtError, null);
        assert.equal(account.balance, '97980000000');
      });

    });

    describe('invalid registerSigDetails', async () => {

      beforeEach(async () => {
        let preparedTxn = await clientA.prepareTransaction({
          type: 'registerSigDetails',
          newSigPublicKey: clientForger.sigPublicKey,
          newNextSigPublicKey: clientForger.nextSigPublicKey,
          newNextSigKeyIndex: -1,
          fee: '10000000',
          timestamp: 100000,
          message: ''
        });

        try {
          await chainModule.actions.postTransaction.handler({
            params: {
              transaction: preparedTxn
            }
          });
        } catch (error) {
          caughtError = error;
        }

        await wait(8000);
      });

      it('should send back an error', async () => {
        assert.notEqual(caughtError, null);
      });

    });

  });

  describe('registerMultisigDetails transaction', async () => {

    let caughtError;

    beforeEach(async () => {
      caughtError = null;

      options = {
        genesisPath: './test/utils/genesis-functional.json',
        forgingPassphrase: 'clerk aware give dog reopen peasant duty cheese tobacco trouble gold angle',
        minTransactionsPerBlock: 0, // Enable forging empty blocks.
        forgingInterval: 5000,
        forgingBlockBroadcastDelay: 500,
        forgingSignatureBroadcastDelay: 500,
        propagationRandomness: 100,
        propagationTimeout: 3000
      };

      await chainModule.load(channel, options);
      clientForger = createClient({
        adapter,
        store
      });
      await clientForger.connect({
        passphrase: options.forgingPassphrase
      });

      // Address: ldpos660c22683a6d466f66740042677ed1adc8bb723b
      clientA = createClient({
        adapter,
        store
      });
      await clientA.connect({
        passphrase: 'birth select quiz process bid raccoon memory village snow cable agent bean'
      });
    });

    describe('valid registerMultisigDetails', async () => {

      beforeEach(async () => {
        let preparedTxn = await clientA.prepareTransaction({
          type: 'registerMultisigDetails',
          newMultisigPublicKey: clientForger.multisigPublicKey,
          newNextMultisigPublicKey: clientForger.nextMultisigPublicKey,
          newNextMultisigKeyIndex: clientForger.multisigKeyIndex + 1,
          fee: '10000000',
          timestamp: 100000,
          message: ''
        });

        await chainModule.actions.postTransaction.handler({
          params: {
            transaction: preparedTxn
          }
        });

        await wait(8000);
      });

      it('should add all the necessary keys on the account', async () => {
        let account = await chainModule.actions.getAccount.handler({
          params: {
            walletAddress: clientA.walletAddress
          }
        });
        assert.equal(caughtError, null);
        assert.equal(account.multisigPublicKey, clientForger.multisigPublicKey);
        assert.equal(account.nextMultisigPublicKey, clientForger.nextMultisigPublicKey);
        assert.equal(account.nextMultisigKeyIndex, clientForger.multisigKeyIndex + 1);
      });

    });

    describe('invalid registerMultisigDetails', async () => {

      beforeEach(async () => {
        let preparedTxn = await clientA.prepareTransaction({
          type: 'registerMultisigDetails',
          newMultisigPublicKey: clientForger.sigPublicKey,
          newNextMultisigPublicKey: clientForger.nextSigPublicKey,
          newNextMultisigKeyIndex: -1,
          fee: '10000000',
          timestamp: 100000,
          message: ''
        });

        try {
          await chainModule.actions.postTransaction.handler({
            params: {
              transaction: preparedTxn
            }
          });
        } catch (error) {
          caughtError = error;
        }

        await wait(8000);
      });

      it('should send back an error', async () => {
        assert.notEqual(caughtError, null);
      });

    });

  });

  describe('registerForgingDetails transaction', async () => {

    let caughtError;

    beforeEach(async () => {
      caughtError = null;

      options = {
        genesisPath: './test/utils/genesis-functional.json',
        forgingPassphrase: 'clerk aware give dog reopen peasant duty cheese tobacco trouble gold angle',
        minTransactionsPerBlock: 0, // Enable forging empty blocks.
        forgingInterval: 5000,
        forgingBlockBroadcastDelay: 500,
        forgingSignatureBroadcastDelay: 500,
        propagationRandomness: 100,
        propagationTimeout: 3000
      };

      await chainModule.load(channel, options);
      clientForger = createClient({
        adapter,
        store
      });
      await clientForger.connect({
        passphrase: options.forgingPassphrase
      });

      // Address: ldpos660c22683a6d466f66740042677ed1adc8bb723b
      clientA = createClient({
        adapter,
        store
      });
      await clientA.connect({
        passphrase: 'birth select quiz process bid raccoon memory village snow cable agent bean'
      });
    });

    describe('valid registerForgingDetails', async () => {

      beforeEach(async () => {
        let preparedTxn = await clientA.prepareTransaction({
          type: 'registerForgingDetails',
          newForgingPublicKey: clientForger.forgingPublicKey,
          newNextForgingPublicKey: clientForger.nextForgingPublicKey,
          newNextForgingKeyIndex: clientForger.forgingKeyIndex + 1,
          fee: '10000000',
          timestamp: 100000,
          message: ''
        });

        await chainModule.actions.postTransaction.handler({
          params: {
            transaction: preparedTxn
          }
        });

        await wait(8000);
      });

      it('should add all the necessary keys on the account', async () => {
        let account = await chainModule.actions.getAccount.handler({
          params: {
            walletAddress: clientA.walletAddress
          }
        });
        assert.equal(caughtError, null);
        assert.equal(account.forgingPublicKey, clientForger.forgingPublicKey);
        assert.equal(account.nextForgingPublicKey, clientForger.nextForgingPublicKey);
        assert.equal(account.nextForgingKeyIndex, clientForger.forgingKeyIndex + 1);
      });

    });

    describe('invalid registerForgingDetails', async () => {

      beforeEach(async () => {
        let preparedTxn = await clientA.prepareTransaction({
          type: 'registerForgingDetails',
          newForgingPublicKey: clientForger.sigPublicKey,
          newNextForgingPublicKey: clientForger.nextSigPublicKey,
          newNextForgingKeyIndex: -1,
          fee: '10000000',
          timestamp: 100000,
          message: ''
        });

        try {
          await chainModule.actions.postTransaction.handler({
            params: {
              transaction: preparedTxn
            }
          });
        } catch (error) {
          caughtError = error;
        }

        await wait(8000);
      });

      it('should send back an error', async () => {
        assert.notEqual(caughtError, null);
      });

    });

  });

});
