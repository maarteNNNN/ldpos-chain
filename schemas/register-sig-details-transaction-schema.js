const {
  validateSigPublicKey,
  validateNextSigPublicKey,
  validateNextSigKeyIndex
} = require('./primitives');

function validateRegisterSigDetailsTransactionSchema(transaction) {
  if (!transaction) {
    throw new Error('Register sig details transaction was not specified');
  }
  let { details } = transaction;
  if (!details) {
    throw new Error(
      'Register sig details transaction did not have a valid details property'
    );
  }
  validateSigPublicKey(details.sigPublicKey);
  validateNextSigPublicKey(details.nextSigPublicKey);
  validateNextSigKeyIndex(details.nextSigKeyIndex);
}

module.exports = {
  validateRegisterSigDetailsTransactionSchema
};
