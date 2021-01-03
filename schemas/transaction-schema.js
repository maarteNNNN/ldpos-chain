const {
  validateWalletAddress,
  validateTransactionFee,
  validateTimestamp,
  validateTransactionMessage
} = require('./primitives');

const { validateTransferTransactionSchema } = require('./transfer-transaction-schema');
const { validateVoteTransactionSchema } = require('./vote-transaction-schema');
const { validateUnvoteTransactionSchema } = require('./unvote-transaction-schema');
const { validateRegisterSigDetailsTransactionSchema } = require('./register-sig-details-transaction-schema');
const { validateRegisterMultisigDetailsTransactionSchema } = require('./register-multisig-details-transaction-schema');
const { validateRegisterForgingDetailsTransactionSchema } = require('./register-forging-details-transaction-schema');
const { validateRegisterMultisigWalletTransactionSchema } = require('./register-multisig-wallet-transaction-schema');

function validateTransactionSchema(transaction, maxSpendableDigits, networkSymbol, maxTransactionMessageLength, minMultisigMembers, maxMultisigMembers) {
  if (!transaction) {
    throw new Error('Transaction was not specified');
  }
  let { type } = transaction;

  if (
    type !== 'transfer' &&
    type !== 'vote' &&
    type !== 'unvote' &&
    type !== 'registerSigDetails' &&
    type !== 'registerMultisigDetails' &&
    type !== 'registerForgingDetails' &&
    type !== 'registerMultisigWallet'
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
  } else if (type === 'registerSigDetails') {
    validateRegisterSigDetailsTransactionSchema(transaction);
  } else if (type === 'registerMultisigDetails') {
    validateRegisterMultisigDetailsTransactionSchema(transaction);
  } else if (type === 'registerForgingDetails') {
    validateRegisterForgingDetailsTransactionSchema(transaction);
  } else if (type === 'registerMultisigWallet') {
    validateRegisterMultisigWalletTransactionSchema(
      transaction,
      minMultisigMembers,
      maxMultisigMembers,
      networkSymbol
    );
  }
}

module.exports = {
  validateTransactionSchema
};
