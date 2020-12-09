function verifyUnvoteTransactionSchema(transaction) {
  if (!transaction) {
    throw new Error('Unvote transaction was not specified');
  }
  // TODO 222: Verify transaction properties
}

module.exports = {
  verifyUnvoteTransactionSchema
};
