const {
  validateForgingPublicKey,
  validateNextForgingPublicKey,
  validateNextForgingKeyIndex
} = require('./primitives');

const { findInvalidProperty } = require('./find-invalid-property');

const validDetailsPropertyList = [
  'forgingPublicKey',
  'nextForgingPublicKey',
  'nextForgingKeyIndex'
];

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

  let invalidProperty = findInvalidProperty(details, validDetailsPropertyList);

  if (invalidProperty) {
    throw new Error(
      `Register forging details transaction had a details object with an invalid ${invalidProperty} property`
    );
  }

  return ['details'];
}

module.exports = {
  validateRegisterForgingDetailsTransactionSchema
};
