const {
  validateWalletAddress,
  validateTransactionFee,
  validateTimestamp,
  validateTransactionData
} = require('./primitives');

function verifyTransactionSchema(transaction, maxSpendableDigits, networkSymbol, maxTransactionDataLength) {
  if (!transaction) {
    throw new Error('Transaction was not specified');
  }
  if (
    transaction.type !== 'transfer' &&
    transaction.type !== 'vote' &&
    transaction.type !== 'unvote' &&
    transaction.type !== 'registerMultisig'
  ) {
    throw new Error(
      'Transaction type must be a string which refers to one of the supported transaction types'
    );
  }
  validateWalletAddress(transaction.senderAddress, networkSymbol);
  validateTransactionFee(transaction.fee, maxSpendableDigits);
  validateTimestamp(transaction.timestamp);
  validateTransactionData(transaction.data, maxTransactionDataLength);
}

module.exports = {
  verifyTransactionSchema
};
