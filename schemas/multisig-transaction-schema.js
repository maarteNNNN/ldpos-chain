const { validateWalletAddress, validateSignature } = require('./primitives');

function verifyMultisigTransactionSchema(multisigTransaction, minRequiredSignatures) {
  if (!multisigTransaction) {
    throw new Error('Multisig transaction was not specified');
  }
  let { signatures } = multisigTransaction;
  if (!Array.isArray(signatures)) {
    throw new Error('Multisig transaction signatures must be an array');
  }
  let processedSignerAddressSet = new Set();
  for (let signaturePacket of signatures) {
    if (!signaturePacket) {
      throw new Error('Some multisig transaction signatures were not specified');
    }
    let { signerAddress, signature } = signaturePacket;

    validateWalletAddress(signerAddress);
    validateSignature(signature);

    if (processedSignerAddressSet.has(signerAddress)) {
      throw new Error(
        `Multiple multisig transaction signatures were associated with the same member address ${
          signerAddress
        }`
      );
    }
    processedSignerAddressSet.add(signerAddress);
  }
  if (processedSignerAddressSet.size < minRequiredSignatures) {
    throw new Error(
      `Multisig transaction did not have enough member signatures - At least ${
        minRequiredSignatures
      } distinct signatures are required`
    );
  }
}

module.exports = {
  verifyMultisigTransactionSchema
};
