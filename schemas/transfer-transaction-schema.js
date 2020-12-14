const {
  validateWalletAddress,
  validateTransactionAmount
} = require('./primitives');

function verifyTransferTransactionSchema(transaction, maxSpendableDigits, networkSymbol) {
  if (!transaction) {
    throw new Error('Transfer transaction was not specified');
  }
  validateWalletAddress(transaction.receiverAddress, networkSymbol);
  validateTransactionAmount(transaction.amount, maxSpendableDigits);
}

module.exports = {
  verifyTransferTransactionSchema
};
