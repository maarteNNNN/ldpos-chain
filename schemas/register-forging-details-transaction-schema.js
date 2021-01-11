const {
  validatePublicKey,
  validateKeyIndex
} = require('./primitives');

function validateRegisterForgingDetailsTransactionSchema(transaction) {
  if (!transaction) {
    throw new Error('Register forging details transaction was not specified');
  }

  validatePublicKey('newForgingPublicKey', transaction);
  validatePublicKey('newNextForgingPublicKey', transaction);
  validateKeyIndex('newNextForgingKeyIndex', transaction);

  return ['newForgingPublicKey', 'newNextForgingPublicKey', 'newNextForgingKeyIndex'];
}

module.exports = {
  validateRegisterForgingDetailsTransactionSchema
};
