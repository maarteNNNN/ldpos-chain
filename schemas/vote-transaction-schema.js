const {
  validateWalletAddress
} = require('./primitives');

function validateVoteTransactionSchema(transaction, networkSymbol) {
  if (!transaction) {
    throw new Error('Vote transaction was not specified');
  }
  validateWalletAddress(transaction.delegateAddress, networkSymbol);
}

module.exports = {
  validateVoteTransactionSchema
};
