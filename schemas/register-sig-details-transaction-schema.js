const {
  validateSigPublicKey,
  validateNextSigPublicKey,
  validateNextSigKeyIndex
} = require('./primitives');

function validateRegisterSigDetailsTransactionSchema(transaction) {
  if (!transaction) {
    throw new Error('Register sig details transaction was not specified');
  }

  validateSigPublicKey(transaction.newSigPublicKey);
  validateNextSigPublicKey(transaction.newNextSigPublicKey);
  validateNextSigKeyIndex(transaction.newNextSigKeyIndex);

  return ['newSigPublicKey', 'newNextSigPublicKey', 'newNextSigKeyIndex'];
}

module.exports = {
  validateRegisterSigDetailsTransactionSchema
};
