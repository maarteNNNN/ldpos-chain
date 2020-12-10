function verifyBlockSignatureSchema(blockSignature) {
  if (!blockSignature) {
    throw new Error('Block signature was not specified');
  }
  // TODO 222: Validate properties.
}

module.exports = {
  verifyBlockSignatureSchema
};
