const { validateSignature, validateWalletAddress, validateBlockId } = require('./primitives');

function verifyBlockSignatureSchema(blockSignature) {
  if (!blockSignature) {
    throw new Error(
      'Block signature was not specified'
    );
  }
  validateSignature(blockSignature.signature);
  validateWalletAddress(blockSignature.signerAddress);
  validateBlockId(blockSignature.blockId);
}

module.exports = {
  verifyBlockSignatureSchema
};
