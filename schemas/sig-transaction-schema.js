const {
  validateSigPublicKey,
  validateNextSigPublicKey,
  validateNextSigKeyIndex,
  validateSignature,
  validateSignatureHash
} = require('./primitives');

function validateSigTransactionSchema(sigTransaction, fullCheck) {
  if (!sigTransaction) {
    throw new Error('Sig transaction was not specified');
  }
  validateSigPublicKey(sigTransaction.sigPublicKey);
  validateNextSigPublicKey(sigTransaction.nextSigPublicKey);
  validateNextSigKeyIndex(sigTransaction.nextSigKeyIndex);
  if (fullCheck) {
    validateSignature(sigTransaction.senderSignature);
    if (sigTransaction.senderSignatureHash) {
      throw new Error(
        `Sig transaction had a senderSignatureHash property which is not allowed during a full check`
      );
    }
  } else {
    validateSignatureHash(sigTransaction.senderSignatureHash);
    if (sigTransaction.senderSignature) {
      throw new Error(
        `Sig transaction had a senderSignature property which is not allowed during a partial check`
      );
    }
  }
}

module.exports = {
  validateSigTransactionSchema
};
