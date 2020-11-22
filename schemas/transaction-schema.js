function verifyTransactionSchema(transaction) {
  if (!transaction) {
    throw new Error('Transaction was not specified');
  }
  // TODO 222: Verify transaction properties
}

module.exports = {
  verifyTransactionSchema
};
