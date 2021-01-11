const {
  validateWalletAddress
} = require('./primitives');

function validateVoteTransactionSchema(transaction, networkSymbol) {
  if (!transaction) {
    throw new Error('Vote transaction was not specified');
  }
  validateWalletAddress('delegateAddress', transaction, networkSymbol);

  return ['delegateAddress'];
}

module.exports = {
  validateVoteTransactionSchema
};
