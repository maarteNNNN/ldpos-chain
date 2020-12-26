const {
  validateWalletAddress,
  validateTransactionFee,
  validateTimestamp,
  validateTransactionMessage
} = require('./primitives');

const { validateTransferTransactionSchema } = require('./transfer-transaction-schema');
const { validateVoteTransactionSchema } = require('./vote-transaction-schema');
const { validateUnvoteTransactionSchema } = require('./unvote-transaction-schema');
const { validateRegisterMultisigTransactionSchema } = require('./register-multisig-transaction-schema');
const { validateInitTransactionSchema } = require('./init-transaction-schema');

function validateTransactionSchema(transaction, maxSpendableDigits, networkSymbol, maxTransactionMessageLength, minMultisigMembers, maxMultisigMembers) {
  if (!transaction) {
    throw new Error('Transaction was not specified');
  }
  let { type } = transaction;

  if (
    type !== 'transfer' &&
    type !== 'vote' &&
    type !== 'unvote' &&
    type !== 'registerMultisig' &&
    type !== 'init'
  ) {
    throw new Error(
      'Transaction type must be a string which refers to one of the supported transaction types'
    );
  }
  validateWalletAddress(transaction.senderAddress, networkSymbol);
  validateTransactionFee(transaction.fee, maxSpendableDigits);
  validateTimestamp(transaction.timestamp);
  validateTransactionMessage(transaction.message, maxTransactionMessageLength);

  if (type === 'transfer') {
    validateTransferTransactionSchema(transaction, maxSpendableDigits, networkSymbol);
  } else if (type === 'vote') {
    validateVoteTransactionSchema(transaction, networkSymbol);
  } else if (type === 'unvote') {
    validateUnvoteTransactionSchema(transaction, networkSymbol);
  } else if (type === 'registerMultisig') {
    validateRegisterMultisigTransactionSchema(
      transaction,
      minMultisigMembers,
      maxMultisigMembers,
      networkSymbol
    );
  } else if (type === 'init') {
    validateInitTransactionSchema(transaction);
  }
}

module.exports = {
  validateTransactionSchema
};
