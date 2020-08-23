const lamport = require('lamport-ots');

const { publicKey, privateKey } = lamport.keys();

// console.log(2222, publicKey);
console.log(3333, privateKey[1].toString('hex'));

const signature = lamport.sign('This is a test', privateKey);
console.log(4444, signature.toString('hex'));
const result = lamport.verify('This is a test', signature, publicKey);

// console.log(5555, result);
