const {
  validateMultisigPublicKey,
  validateNextMultisigPublicKey,
  validateNextMultisigKeyIndex
} = require('./primitives');

function validateRegisterMultisigDetailsTransactionSchema(transaction) {
  if (!transaction) {
    throw new Error('Register multisig details transaction was not specified');
  }
  let { details } = transaction;
  if (!details) {
    throw new Error(
      'Register multisig details transaction did not have a valid details property'
    );
  }
  validateMultisigPublicKey(details.multisigPublicKey);
  validateNextMultisigPublicKey(details.nextMultisigPublicKey);
  validateNextMultisigKeyIndex(details.nextMultisigKeyIndex);
}

module.exports = {
  validateRegisterMultisigDetailsTransactionSchema
};
