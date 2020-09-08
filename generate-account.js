// Utility script to generate account details to put in genesis.json

const bip39 = require('bip39');
const SimpleLamport = require('simple-lamport');

let lamport = new SimpleLamport();

let mnemonic = bip39.generateMnemonic();

console.log('MNEMONIC:', mnemonic);

let seed = bip39.mnemonicToSeedSync(mnemonic).toString('hex')

console.log('SEED:', seed);

console.log('');

let candidacyKeys = lamport.generateKeysFromSeed(`${seed}-candidacy`, 0);
let votingKeys = lamport.generateKeysFromSeed(`${seed}-voting`, 0);
let forgingKeys = lamport.generateKeysFromSeed(`${seed}-forging`, 0);
let multisigKeys = lamport.generateKeysFromSeed(`${seed}-multisig`, 0);
let sigKeys = lamport.generateKeysFromSeed(`${seed}-sig`, 0);

// console.log('------CANDIDACY------');
// console.log(candidacyKeys);
// console.log('------VOTING------');
// console.log(votingKeys);
// console.log('------FORGING------');
// console.log(forgingKeys);
// console.log('------MULTISIG------');
// console.log(multisigKeys);
// console.log('------SIG------');
// console.log(sigKeys);
// console.log('');

let candidacyPublicKeyHash = lamport.sha256(candidacyKeys.publicKey);
let votingPublicKeyHash = lamport.sha256(votingKeys.publicKey);
let forgingPublicKeyHash = lamport.sha256(forgingKeys.publicKey);
let multisigPublicKeyHash = lamport.sha256(multisigKeys.publicKey);
let sigPublicKeyHash = lamport.sha256(sigKeys.publicKey);

let walletAddress = lamport.sha256(sigKeys.publicKey, 'hex');

console.log('------CANDIDACY HASH------');
console.log(candidacyPublicKeyHash);
console.log('------VOTING HASH------');
console.log(votingPublicKeyHash);
console.log('------FORGING HASH------');
console.log(forgingPublicKeyHash);
console.log('------MULTISIG HASH------');
console.log(multisigPublicKeyHash);
console.log('------SIG HASH------');
console.log(sigPublicKeyHash);

console.log('');

console.log('------WALLET ADDRESS------');
console.log(walletAddress);
