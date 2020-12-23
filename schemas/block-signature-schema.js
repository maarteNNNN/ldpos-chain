const {
  validateSignature,
  validateWalletAddress,
  validateBlockId,
  validateForgingKeyIndex,
  validateForgingPublicKey,
  validateNextForgingPublicKey
} = require('./primitives');

function validateBlockSignatureSchema(blockSignature, networkSymbol) {
  if (!blockSignature) {
    throw new Error(
      'Block signature was not specified'
    );
  }
  validateSignature(blockSignature.signature);
  validateWalletAddress(blockSignature.signerAddress, networkSymbol);
  validateForgingKeyIndex(blockSignature.forgingKeyIndex);
  validateForgingPublicKey(blockSignature.forgingPublicKey);
  validateNextForgingPublicKey(blockSignature.nextForgingPublicKey);
  validateBlockId(blockSignature.blockId);
}

module.exports = {
  validateBlockSignatureSchema
};
