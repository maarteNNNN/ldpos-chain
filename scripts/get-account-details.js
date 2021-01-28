// Utility script to generate account details to put in genesis.json

const bip39 = require('bip39');
const ProperMerkle = require('proper-merkle');
const mnemonic = process.argv[2];

if (!mnemonic) {
  console.error('Passphrase mnemonic was not specified');
  process.exit(1);
}

let merkle = new ProperMerkle({
  leafCount: 32
});

let network = 'ldpos';
let seed = bip39.mnemonicToSeedSync(mnemonic).toString('base64');

console.log('SEED:', seed);
console.log('');

let forgingTree = merkle.generateMSSTreeSync(seed, `${network}-forging-0`);
let multisigTree = merkle.generateMSSTreeSync(seed, `${network}-multisig-0`);
let sigTree = merkle.generateMSSTreeSync(seed, `${network}-sig-0`);

let walletAddress = `${sigTree.publicRootHash}${network}`;

console.log('------FORGING PUBLIC KEY------');
console.log(forgingTree.publicRootHash);
console.log('------MULTISIG PUBLIC KEY------');
console.log(multisigTree.publicRootHash);
console.log('------SIG PUBLIC KEY------');
console.log(sigTree.publicRootHash);

console.log('');

console.log('------WALLET ADDRESS------');
console.log(walletAddress);
