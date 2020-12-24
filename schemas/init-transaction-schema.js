const {
  validateSigPublicKey,
  validateNextSigPublicKey,
  validateMultisigPublicKey,
  validateNextMultisigPublicKey,
  validateForgingPublicKey,
  validateNextForgingPublicKey,
  validateSignature,
  validateSignatureHash
} = require('./primitives');

function validateInitTransactionSchema(initTransaction) {
  if (!initTransaction) {
    throw new Error('Init transaction was not specified');
  }
  validateSigPublicKey(initTransaction.sigPublicKey);
  validateNextSigPublicKey(initTransaction.nextSigPublicKey);
  validateMultisigPublicKey(initTransaction.multisigPublicKey);
  validateNextMultisigPublicKey(initTransaction.nextMultisigPublicKey);
  validateForgingPublicKey(initTransaction.forgingPublicKey);
  validateNextForgingPublicKey(initTransaction.nextForgingPublicKey);
}

module.exports = {
  validateInitTransactionSchema
};
