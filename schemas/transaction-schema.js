const {
  validateWalletAddress,
  validateTransactionAmount,
  validateTransactionFee,
  validateTimestamp
} = require('./primitives');

function verifyTransactionSchema(transaction) {
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
  validateWalletAddress(transaction.senderAddress);
  validateTransactionAmount(transaction.amount);
  validateTransactionFee(transaction.fee);
  validateTimestamp(transaction.timestamp);
}

module.exports = {
  verifyTransactionSchema
};
