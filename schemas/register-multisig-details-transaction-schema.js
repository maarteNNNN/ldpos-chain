const {
  validatePublicKey,
  validateKeyIndex
} = require('./primitives');

function validateRegisterMultisigDetailsTransactionSchema(transaction) {
  if (!transaction) {
    throw new Error('Register multisig details transaction was not specified');
  }

  validatePublicKey('newMultisigPublicKey', transaction);
  validatePublicKey('newNextMultisigPublicKey', transaction);
  validateKeyIndex('newNextMultisigKeyIndex', transaction);

  return ['newMultisigPublicKey', 'newNextMultisigPublicKey', 'newNextMultisigKeyIndex'];
}

module.exports = {
  validateRegisterMultisigDetailsTransactionSchema
};
