const { validateForgedBlockSchema } = require('./forged-block-schema');
const { validateBlockSignatureSchema } = require('./block-signature-schema');

function validateFullySignedBlockSchema(block, maxTransactionsPerBlock, minRequiredSignatures, networkSymbol) {
  validateForgedBlockSchema(block, maxTransactionsPerBlock, networkSymbol);

  let { forgerAddress, signatures } = block;

  if (!Array.isArray(signatures)) {
    throw new Error('Fully signed block signatures must be an array');
  }
  let signerSet = new Set();
  for (let blockSignature of signatures) {
    validateBlockSignatureSchema(blockSignature, networkSymbol);
    if (blockSignature.signerAddress === forgerAddress) {
      throw new Error(
        `Fully signed block contained a second signature from the block forger ${forgerAddress}`
      );
    }
    signerSet.add(blockSignature.signerAddress);
  }
  if (signerSet.size !== signatures.length) {
    throw new Error(
      `Fully signed block contained duplicate signatures`
    );
  }
  if (signerSet.size < minRequiredSignatures) {
    throw new Error(
      `Fully signed block signatures did not refer to a sufficient number of unique signers - There were ${
        signerSet.size
      } signatures but ${minRequiredSignatures} were required`
    );
  }
}

module.exports = {
  validateFullySignedBlockSchema
};
