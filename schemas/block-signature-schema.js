const {
  validateSignature,
  validateWalletAddress,
  validateBlockId
} = require('./primitives');

function verifyBlockSignatureSchema(blockSignature, networkSymbol) {
  if (!blockSignature) {
    throw new Error(
      'Block signature was not specified'
    );
  }
  validateSignature(blockSignature.signature);
  validateWalletAddress(blockSignature.signerAddress, networkSymbol);
  validateBlockId(blockSignature.blockId);
}

module.exports = {
  verifyBlockSignatureSchema
};
