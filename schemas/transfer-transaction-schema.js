const {
  validateWalletAddress,
  validateTransactionAmount
} = require('./primitives');

function validateTransferTransactionSchema(transaction, maxSpendableDigits, networkSymbol) {
  if (!transaction) {
    throw new Error('Transfer transaction was not specified');
  }
  validateWalletAddress('recipientAddress', transaction, networkSymbol);
  validateTransactionAmount('amount', transaction, maxSpendableDigits);

  return ['recipientAddress', 'amount'];
}

module.exports = {
  validateTransferTransactionSchema
};
