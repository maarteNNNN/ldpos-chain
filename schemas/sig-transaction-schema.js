const {
  validateSigPublicKey,
  validateNextSigPublicKey,
  validateSignature,
  validateSignatureHash
} = require('./primitives');

function verifySigTransactionSchema(sigTransaction, fullCheck) {
  if (!sigTransaction) {
    throw new Error('Multisig transaction was not specified');
  }
  validateSigPublicKey(sigTransaction.sigPublicKey);
  validateNextSigPublicKey(sigTransaction.nextSigPublicKey);
  if (fullCheck) {
    validateSignature(sigTransaction.signature);
  } else {
    validateSignatureHash(sigTransaction.signatureHash);
  }
}

module.exports = {
  verifySigTransactionSchema
};
