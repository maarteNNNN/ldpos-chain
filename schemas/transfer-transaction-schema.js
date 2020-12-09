function verifyTransferTransactionSchema(transaction) {
  if (!transaction) {
    throw new Error('Transfer transaction was not specified');
  }
  // TODO 222: Verify transaction properties
}

module.exports = {
  verifyTransferTransactionSchema
};
