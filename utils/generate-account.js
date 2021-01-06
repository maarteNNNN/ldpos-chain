// Utility script to generate account details to put in genesis.json

const bip39 = require('bip39');
const childProcess = require('child_process');
const { fork } = childProcess;
const path = require('path');
const ProperMerkle = require('proper-merkle');

let merkle = new ProperMerkle({
  leafCount: 32
});

let mnemonic = bip39.generateMnemonic();

console.log('MNEMONIC:', mnemonic);

fork(path.resolve(__dirname, './get-account-details.js'), [mnemonic]);
