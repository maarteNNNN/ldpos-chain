const {
  validatePublicKey,
  validateKeyIndex
} = require('./primitives');

function validateRegisterSigDetailsTransactionSchema(transaction) {
  if (!transaction) {
    throw new Error('Register sig details transaction was not specified');
  }

  validatePublicKey('newSigPublicKey', transaction);
  validatePublicKey('newNextSigPublicKey', transaction);
  validateKeyIndex('newNextSigKeyIndex', transaction);

  return ['newSigPublicKey', 'newNextSigPublicKey', 'newNextSigKeyIndex'];
}

module.exports = {
  validateRegisterSigDetailsTransactionSchema
};
