const { verifyBlockSignatureSchema } = require('./block-signature-schema');
const {
  validateBlockId,
  validateBlockHeight
} = require('./primitives');

function verifyBlockInfoSchema(blockInfo, minRequiredSignatures, networkSymbol) {
  if (!blockInfo) {
    throw new Error('Block info was not specified');
  }
  let { blockId, blockHeight, signatures } = blockInfo;

  validateBlockId(blockId);
  validateBlockHeight(blockHeight);

  if (!Array.isArray(signatures)) {
    throw new Error('Block signatures must be an array');
  }
  let signerSet = new Set();
  for (let blockSignature of signatures) {
    verifyBlockSignatureSchema(blockSignature, networkSymbol);
    signerSet.add(blockSignature.signerAddress);
  }
  if (signerSet.size < minRequiredSignatures) {
    throw new Error(
      `Block signatures did not refer to a sufficient number of unique signers - There were ${
        signerSet.size
      } signatures but ${minRequiredSignatures} were required`
    );
  }
}

module.exports = {
  verifyBlockInfoSchema
};
