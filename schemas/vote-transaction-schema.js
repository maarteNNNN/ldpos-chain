function verifyVoteTransactionSchema(transaction) {
  if (!transaction) {
    throw new Error('Vote transaction was not specified');
  }
  // TODO 222: Verify transaction properties
}

module.exports = {
  verifyVoteTransactionSchema
};
