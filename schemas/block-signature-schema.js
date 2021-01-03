const {
  validateSignature,
  validateWalletAddress,
  validateBlockId,
  validateNextForgingKeyIndex,
  validateForgingPublicKey,
  validateNextForgingPublicKey
} = require('./primitives');

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
}

module.exports = {
  validateBlockSignatureSchema
};
