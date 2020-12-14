const { verifyBlockSignatureSchema } = require('./block-signature-schema');

function verifyBlockSignaturesResponseSchema(blockSignatures, minRequiredSignatures, networkSymbol) {
  if (!Array.isArray(blockSignatures)) {
    throw new Error('Block signatures must be an array');
  }
  let signerSet = new Set();
  for (let blockSignature of blockSignatures) {
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
  verifyBlockSignaturesResponseSchema
};
