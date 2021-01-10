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
      },
      logger: {
        info: () => {},
        // info: (...args) => console.info.apply(console, args),
        warn: (...args) => console.warn.apply(console, args),
        error: (...args) => console.error.apply(console, args)
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
      genesisPath: './test/utils/genesis-dex-api.json',
      forgingPassphrase: 'clerk aware give dog reopen peasant duty cheese tobacco trouble gold angle',
      minTransactionsPerBlock: 0, // Enable forging empty blocks.
      forgingInterval: 10000,
      forgingBlockBroadcastDelay: 200,
      forgingSignatureBroadcastDelay: 200,
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
        address: '17475c261ba8b5b7653700dfda1a2952053a4400efd8c9cbd4bbd86912c4a419ldpos',
        forgingPublicKey: 'KSxPdmjDS1LKGraH7fD9HjtjAYc6Y+H7O5ON0y90M9w=',
        nextForgingKeyIndex: 0,
        multisigPublicKey: 'KDlcXmucsuE5VS1WKUCCA2doLRS9U4rOxqzEtnnySfg=',
        nextMultisigKeyIndex: 0,
        sigPublicKey: 'F0dcJhuotbdlNwDf2hopUgU6RADv2MnL1LvYaRLEpBk=',
        nextSigKeyIndex: 0,
        balance: '100000000000'
      };

      memberAccounts = [
        // Passphrase: birth select quiz process bid raccoon memory village snow cable agent bean
        {
          address: '660c22683a6d466f66740042677ed1adc8bb723bd871c32c93f52eaa224a817fldpos',
          forgingPublicKey: 'VyMOMKKy63KLCA1YkqTjaBZnlm5wdk0TOVu2LmAfAK0=',
          nextForgingKeyIndex: 0,
          multisigPublicKey: 'xreuBmWlBA/6og9dXjIkiiH7BHISFRBXIks3AFAzrmc=',
          nextMultisigKeyIndex: 0,
          sigPublicKey: 'ZgwiaDptRm9mdABCZ37Rrci7cjvYccMsk/UuqiJKgX8=',
          nextSigKeyIndex: 0,
          balance: '10000000000'
        },
        // Passphrase: genius shoulder into daring armor proof cycle bench patrol paper grant picture
        {
          address: '772e25778a36dc33a7c00115471d270ead1458c170b222e9c63f17da588dd9edldpos',
          forgingPublicKey: 'SzXp6/L1ZztVN/LKxkkYQHR9BKoUuf1hjFf0a8vkZIE=',
          nextForgingKeyIndex: 0,
          multisigPublicKey: 'Zzqtg8AErQsUHSIiDFFX8O72WqhkzKgRFcZazfupOLM=',
          nextMultisigKeyIndex: 0,
          sigPublicKey: 'dy4ld4o23DOnwAEVRx0nDq0UWMFwsiLpxj8X2liN2e0=',
          nextSigKeyIndex: 0,
          balance: '20000000000'
        },
        // Passphrase: emotion belt burden flash vital neglect old census dress kid ocean warfare
        {
          address: '708fc8aa632c697cb4239aba8e2b6b55a3a2824b061fa4dd500207d34d450ad0ldpos',
          forgingPublicKey: 'a8b9hWja0sLqsynJ+edM0N8rNUWQaIRbhfi/P0Njfkw=',
          nextForgingKeyIndex: 0,
          multisigPublicKey: 'lik8+MS783g9rqqqki1aZm7spwIfr/Uog+sKN50tK6Y=',
          nextMultisigKeyIndex: 0,
          sigPublicKey: 'cI/IqmMsaXy0I5q6jitrVaOigksGH6TdUAIH001FCtA=',
          nextSigKeyIndex: 0,
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
              recipientAddress: '772e25778a36dc33a7c00115471d270ead1458c170b222e9c63f17da588dd9edldpos',
              amount: '1100000000',
              fee: '100000000',
              timestamp: 10000,
              message: ''
            },
            {
              type: 'transfer',
              recipientAddress: '660c22683a6d466f66740042677ed1adc8bb723bd871c32c93f52eaa224a817fldpos',
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
              recipientAddress: '660c22683a6d466f66740042677ed1adc8bb723bd871c32c93f52eaa224a817fldpos',
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
              recipientAddress: '660c22683a6d466f66740042677ed1adc8bb723bd871c32c93f52eaa224a817fldpos',
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

      it('should throw an AccountWasNotMultisigError if the account is not a multisig wallet', async () => {
        let caughtError = null;
        try {
          await chainModule.actions.getMinMultisigRequiredSignatures.handler({
            walletAddress: '660c22683a6d466f66740042677ed1adc8bb723bd871c32c93f52eaa224a817fldpos'
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
        assert.equal(transactions[0].id, 'o9vq17lJ6cbVPf6uewUSVpF1JSDR9CpvDM2SCCI2QOc=');
        assert.equal(transactions[1].senderAddress, clientForger.walletAddress);
        assert.equal(transactions[1].id, 'rXe8wVRFSOLpSQNNMnHJ2yNH683iiZMrjRJil6WcjK0=');
        assert.equal(transactions[2].senderAddress, clientForger.walletAddress);
        assert.equal(transactions[2].id, 'sb7YWN5BKuDDnnVkjRUepH4kLcdQdVd4KUIqxW7uMqY=');
        assert.equal(transactions[3].senderAddress, clientForger.walletAddress);
        assert.equal(transactions[3].id, 'z5acncVaKKI+ppwN95zT0Qhv971EZVOXdEhGZ5NbR6Y=');

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
        assert.equal(transactions[0].id, 'rXe8wVRFSOLpSQNNMnHJ2yNH683iiZMrjRJil6WcjK0=');
        assert.equal(transactions[1].senderAddress, clientForger.walletAddress);
        assert.equal(transactions[1].id, 'sb7YWN5BKuDDnnVkjRUepH4kLcdQdVd4KUIqxW7uMqY=');
        assert.equal(transactions[2].senderAddress, clientForger.walletAddress);
        assert.equal(transactions[2].id, 'z5acncVaKKI+ppwN95zT0Qhv971EZVOXdEhGZ5NbR6Y=');
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
        assert.equal(transactions[0].id, 'o9vq17lJ6cbVPf6uewUSVpF1JSDR9CpvDM2SCCI2QOc=');
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
        let recipientAddress = '660c22683a6d466f66740042677ed1adc8bb723bd871c32c93f52eaa224a817fldpos';
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
        assert.equal(transactions[0].id, 'rXe8wVRFSOLpSQNNMnHJ2yNH683iiZMrjRJil6WcjK0=');
      });

      it('should return an empty array if no transactions match the specified blockId', async () => {
        let recipientAddress = '660c22683a6d466f66740042677ed1adc8bb723bd871c32c93f52eaa224a817fldpos';
        let transactions = await chainModule.actions.getInboundTransactionsFromBlock.handler({
          walletAddress: recipientAddress,
          blockId: 'abc9f15e7de79cebc87d2c3f76ba39480ae5279a12e='
        });
        assert.equal(Array.isArray(transactions), true);
        assert.equal(transactions.length, 0);
      });

      it('should return an empty array if no transactions match the specified walletAddress', async () => {
        let recipientAddress = '660c22683a6d466f66740042677ed1adc8bb723bd871c32c93f52eaa224a817fldpos';
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
        assert.equal(transactions[0].id, 'o9vq17lJ6cbVPf6uewUSVpF1JSDR9CpvDM2SCCI2QOc=');
        assert.equal(transactions[1].senderAddress, clientForger.walletAddress);
        assert.equal(transactions[1].id, 'rXe8wVRFSOLpSQNNMnHJ2yNH683iiZMrjRJil6WcjK0=');
      });

      it('should return transactions with a valid signatures property if transaction is from a multisig wallet', async () => {
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
        // The format of the prepared (signed) transaction will be different depending on the
        // implementation of the chain module and the specified ChainCrypto adapter.
        // Since this is used for posting multisig transactions, the transaction will have
        // a 'signatures' property containing an array of signature objects created by the DEX.
        // The format of each signature object is flexible depending on the output of the ChainCrypto
        // adapter but it will have a 'signerAddress' property.
        // The chain module can handle the transaction and signature objects however it wants.
        let preparedTxn = clientForger.prepareTransaction({
          type: 'transfer',
          recipientAddress: '660c22683a6d466f66740042677ed1adc8bb723bd871c32c93f52eaa224a817fldpos',
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
      await wait(13000);
      assert.equal(chainChangeEvents.length >=1, true);
      let eventData = chainChangeEvents[0].data;
      assert.equal(eventData.type, 'addBlock');
      let { block } = eventData;
      assert.notEqual(block, null);
      assert.equal(block.height, 1);
      assert.equal(Number.isInteger(block.timestamp), true);
    });

  });

});
