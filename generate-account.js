// Utility script to generate account details to put in genesis.json

const bip39 = require('bip39');
const ProperMerkle = require('proper-merkle');

let merkle = new ProperMerkle();

let mnemonic = bip39.generateMnemonic();

console.log('MNEMONIC:', mnemonic);

let network = 'lpos';
let seed = bip39.mnemonicToSeedSync(mnemonic).toString('hex');
let networkSeed = `${network}-${seed}`;

console.log('SEED:', seed);

console.log('');

let candidacyTree = merkle.generateMSSTreeSync(`${networkSeed}-candidacy`, 0);
let votingTree = merkle.generateMSSTreeSync(`${networkSeed}-voting`, 0);
let forgingTree = merkle.generateMSSTreeSync(`${networkSeed}-forging`, 0);
let multisigTree = merkle.generateMSSTreeSync(`${networkSeed}-multisig`, 0);
let sigTree = merkle.generateMSSTreeSync(`${networkSeed}-sig`, 0);

let walletAddress = `${Buffer.from(sigTree.publicRootHash, 'base64').toString('hex')}lpos`;

console.log('------CANDIDACY PUBLIC KEY------');
console.log(candidacyTree.publicRootHash);
console.log('------VOTING PUBLIC KEY------');
console.log(votingTree.publicRootHash);
console.log('------FORGING PUBLIC KEY------');
console.log(forgingTree.publicRootHash);
console.log('------MULTISIG PUBLIC KEY------');
console.log(multisigTree.publicRootHash);
console.log('------SIG PUBLIC KEY------');
console.log(sigTree.publicRootHash);

console.log('');

console.log('------WALLET ADDRESS------');
console.log(walletAddress);
