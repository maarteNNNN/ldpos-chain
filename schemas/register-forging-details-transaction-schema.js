const {
  validateForgingPublicKey,
  validateNextForgingPublicKey,
  validateNextForgingKeyIndex
} = require('./primitives');

function validateRegisterForgingDetailsTransactionSchema(transaction) {
  if (!transaction) {
    throw new Error('Register forging details transaction was not specified');
  }

  validateForgingPublicKey(transaction.newForgingPublicKey);
  validateNextForgingPublicKey(transaction.newNextForgingPublicKey);
  validateNextForgingKeyIndex(transaction.newNextForgingKeyIndex);

  return ['newForgingPublicKey', 'newNextForgingPublicKey', 'newNextForgingKeyIndex'];
}

module.exports = {
  validateRegisterForgingDetailsTransactionSchema
};
