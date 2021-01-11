const {
  validateSignature,
  validateWalletAddress,
  validateBlockId,
  validateKeyIndex,
  validatePublicKey
} = require('./primitives');

const { findInvalidProperty } = require('./find-invalid-property');

const validPropertyList = [
  'signerAddress',
  'forgingPublicKey',
  'nextForgingPublicKey',
  'nextForgingKeyIndex',
  'signature'
];

function validateBlockSignatureSchema(blockSignature, networkSymbol) {
  if (!blockSignature) {
    throw new Error(
      'Block signature was not specified'
    );
  }
  validateWalletAddress('signerAddress', blockSignature, networkSymbol);
  validatePublicKey('forgingPublicKey', blockSignature);
  validatePublicKey('nextForgingPublicKey', blockSignature);
  validateKeyIndex('nextForgingKeyIndex', blockSignature);
  validateSignature('signature', blockSignature);

  let invalidProperty = findInvalidProperty(blockSignature, validPropertyList);
  if (invalidProperty) {
    throw new Error(
      `Block contained a signature which had an invalid ${invalidProperty} property`
    );
  }
}

module.exports = {
  validateBlockSignatureSchema
};
