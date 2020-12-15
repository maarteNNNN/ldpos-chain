const {
  validateSignature,
  validateWalletAddress,
  validateBlockId,
  validateForgingPublicKey,
  validateNextForgingPublicKey
} = require('./primitives');

function verifyBlockSignatureSchema(blockSignature, networkSymbol) {
  if (!blockSignature) {
    throw new Error(
      'Block signature was not specified'
    );
  }
  validateSignature(blockSignature.signature);
  validateWalletAddress(blockSignature.signerAddress, networkSymbol);
  validateForgingPublicKey(blockSignature.forgingPublicKey);
  validateNextForgingPublicKey(blockSignature.nextForgingPublicKey);
  validateBlockId(blockSignature.blockId);
}

module.exports = {
  verifyBlockSignatureSchema
};
