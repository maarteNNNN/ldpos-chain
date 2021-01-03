const {
  validateSigPublicKey,
  validateNextSigPublicKey,
  validateNextSigKeyIndex,
  validateSignature,
  validateSignatureHash
} = require('./primitives');

function validateSigTransactionSchema(sigTransaction, fullCheck) {
  if (!sigTransaction) {
    throw new Error('Multisig transaction was not specified');
  }
  validateSigPublicKey(sigTransaction.sigPublicKey);
  validateNextSigPublicKey(sigTransaction.nextSigPublicKey);
  validateNextSigKeyIndex(sigTransaction.nextSigKeyIndex);
  if (fullCheck) {
    validateSignature(sigTransaction.signature);
  } else {
    validateSignatureHash(sigTransaction.signatureHash);
  }
}

module.exports = {
  validateSigTransactionSchema
};
