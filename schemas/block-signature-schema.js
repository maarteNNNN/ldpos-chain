const {
  validateSignature,
  validateWalletAddress,
  validateBlockId,
  validateNextForgingKeyIndex,
  validateForgingPublicKey,
  validateNextForgingPublicKey
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
  validateWalletAddress(blockSignature.signerAddress, networkSymbol);
  validateForgingPublicKey(blockSignature.forgingPublicKey);
  validateNextForgingPublicKey(blockSignature.nextForgingPublicKey);
  validateNextForgingKeyIndex(blockSignature.nextForgingKeyIndex);
  validateSignature(blockSignature.signature);

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
