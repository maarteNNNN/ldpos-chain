const verifyTransactionSchema = require('./transaction-schema');

function verifyTransactionBundleSchema(transactionBundle) {
  if (!transactionBundle) {
    throw new Error('Transaction bundle was not specified');
  }
  if (typeof transactionBundle.signature !== 'string') {
    throw new Error('Transaction bundle signature must be a string');
  }
  if (!Array.isArray(transactionBundle.transactions)) {
    throw new Error('Transaction bundle transactions must be an array');
  }
  for (let txn of transactionBundle.transactions) {
    verifyTransactionSchema(txn);
  }
}

module.exports = {
  verifyTransactionBundleSchema
};
