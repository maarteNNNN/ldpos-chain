const {
  validateWalletAddress
} = require('./primitives');

function validateUnvoteTransactionSchema(transaction, networkSymbol) {
  if (!transaction) {
    throw new Error('Unvote transaction was not specified');
  }
  validateWalletAddress('delegateAddress', transaction, networkSymbol);

  return ['delegateAddress'];
}

module.exports = {
  validateUnvoteTransactionSchema
};
