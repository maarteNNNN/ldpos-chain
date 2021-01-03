const {
  validateForgingPublicKey,
  validateNextForgingPublicKey,
  validateNextForgingKeyIndex
} = require('./primitives');

function validateRegisterForgingDetailsTransactionSchema(transaction) {
  if (!transaction) {
    throw new Error('Register forging details transaction was not specified');
  }
  let { details } = transaction;
  if (!details) {
    throw new Error(
      'Register forging details transaction did not have a valid details property'
    );
  }
  validateForgingPublicKey(details.forgingPublicKey);
  validateNextForgingPublicKey(details.nextForgingPublicKey);
  validateNextForgingKeyIndex(details.nextForgingKeyIndex);
}

module.exports = {
  validateRegisterForgingDetailsTransactionSchema
};
