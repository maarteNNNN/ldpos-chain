const {
  validateSigKeyIndex,
  validateSigPublicKey,
  validateNextSigPublicKey,
  validateSignature,
  validateSignatureHash
} = require('./primitives');

function validateSigTransactionSchema(sigTransaction, fullCheck) {
  if (!sigTransaction) {
    throw new Error('Multisig transaction was not specified');
  }
  validateSigKeyIndex(sigTransaction.sigKeyIndex);
  validateSigPublicKey(sigTransaction.sigPublicKey);
  validateNextSigPublicKey(sigTransaction.nextSigPublicKey);
  if (fullCheck) {
    validateSignature(sigTransaction.signature);
  } else {
    validateSignatureHash(sigTransaction.signatureHash);
  }
}

module.exports = {
  validateSigTransactionSchema
};
