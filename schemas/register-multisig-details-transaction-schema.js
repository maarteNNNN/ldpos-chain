const {
  validateMultisigPublicKey,
  validateNextMultisigPublicKey,
  validateNextMultisigKeyIndex
} = require('./primitives');

const { findInvalidProperty } = require('./find-invalid-property');

const validDetailsPropertyList = [
  'multisigPublicKey',
  'nextMultisigPublicKey',
  'nextMultisigKeyIndex'
];

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

  let invalidProperty = findInvalidProperty(details, validDetailsPropertyList);

  if (invalidProperty) {
    throw new Error(
      `Register multisig details transaction had a details object with an invalid ${invalidProperty} property`
    );
  }

  return ['details'];
}

module.exports = {
  validateRegisterMultisigDetailsTransactionSchema
};
