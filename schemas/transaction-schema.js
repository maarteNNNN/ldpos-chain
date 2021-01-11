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
const { findInvalidProperty } = require('./find-invalid-property');

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

  validateWalletAddress('senderAddress', transaction, networkSymbol);
  validateTransactionFee('fee', transaction, maxSpendableDigits);
  validateTimestamp('timestamp', transaction);
  validateTransactionMessage('message', transaction, maxTransactionMessageLength);

  let extraValidProperties;
  if (type === 'transfer') {
    extraValidProperties = validateTransferTransactionSchema(transaction, maxSpendableDigits, networkSymbol);
  } else if (type === 'vote') {
    extraValidProperties = validateVoteTransactionSchema(transaction, networkSymbol);
  } else if (type === 'unvote') {
    extraValidProperties = validateUnvoteTransactionSchema(transaction, networkSymbol);
  } else if (type === 'registerSigDetails') {
    extraValidProperties = validateRegisterSigDetailsTransactionSchema(transaction);
  } else if (type === 'registerMultisigDetails') {
    extraValidProperties = validateRegisterMultisigDetailsTransactionSchema(transaction);
  } else if (type === 'registerForgingDetails') {
    extraValidProperties = validateRegisterForgingDetailsTransactionSchema(transaction);
  } else if (type === 'registerMultisigWallet') {
    extraValidProperties = validateRegisterMultisigWalletTransactionSchema(
      transaction,
      minMultisigMembers,
      maxMultisigMembers,
      networkSymbol
    );
  } else {
    extraValidProperties = [];
  }

  let validPropertyList = [
    'id',
    'type',
    'senderAddress',
    'fee',
    'timestamp',
    'message',
    'senderSignature',
    'senderSignatureHash',
    'signatures',
    'sigPublicKey',
    'nextSigPublicKey',
    'nextSigKeyIndex',
    ...extraValidProperties
  ];

  let invalidProperty = findInvalidProperty(transaction, validPropertyList);

  if (invalidProperty) {
    throw new Error(
      `Transaction had an invalid ${invalidProperty} property`
    );
  }
}

module.exports = {
  validateTransactionSchema
};
