const {
  validateWalletAddress
} = require('./primitives');

function validateVoteTransactionSchema(transaction, networkSymbol) {
  if (!transaction) {
    throw new Error('Vote transaction was not specified');
  }
  validateWalletAddress(transaction.delegateAddress, networkSymbol);

  return ['delegateAddress'];
}

module.exports = {
  validateVoteTransactionSchema
};
