const {
  validateMultisigPublicKey,
  validateNextMultisigPublicKey,
  validateNextMultisigKeyIndex
} = require('./primitives');

function validateRegisterMultisigDetailsTransactionSchema(transaction) {
  if (!transaction) {
    throw new Error('Register multisig details transaction was not specified');
  }

  validateMultisigPublicKey(transaction.newMultisigPublicKey);
  validateNextMultisigPublicKey(transaction.newNextMultisigPublicKey);
  validateNextMultisigKeyIndex(transaction.newNextMultisigKeyIndex);

  return ['newMultisigPublicKey', 'newNextMultisigPublicKey', 'newNextMultisigKeyIndex'];
}

module.exports = {
  validateRegisterMultisigDetailsTransactionSchema
};
