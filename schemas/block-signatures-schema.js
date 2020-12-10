function verifyBlockSignaturesSchema(blockSignatures, minRequiredSignatures) {
  if (!Array.isArray(blockSignatures)) {
    throw new Error('Block signatures must be an array');
  }
  // TODO 222: Validate properties and ensure that minRequiredSignatures is met.
}

module.exports = {
  verifyBlockSignaturesSchema
};
