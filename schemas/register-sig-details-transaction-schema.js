const {
  validateSigPublicKey,
  validateNextSigPublicKey,
  validateNextSigKeyIndex
} = require('./primitives');

const { findInvalidProperty } = require('./find-invalid-property');

const validDetailsPropertyList = [
  'sigPublicKey',
  'nextSigPublicKey',
  'nextSigKeyIndex'
];

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

  let invalidProperty = findInvalidProperty(details, validDetailsPropertyList);

  if (invalidProperty) {
    throw new Error(
      `Register sig details transaction had a details object with an invalid ${invalidProperty} property`
    );
  }

  return ['details'];
}

module.exports = {
  validateRegisterSigDetailsTransactionSchema
};
