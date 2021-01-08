const {
  validateWalletAddress,
  validateBlockId,
  validateNextForgingKeyIndex,
  validatePreviousBlockId,
  validateForgingPublicKey,
  validateNextForgingPublicKey,
  validateTimestamp,
  validateBlockHeight,
  validateSignature
} = require('./primitives');

const { findInvalidProperty } = require('./find-invalid-property');

const validPropertyList = [
  'id',
  'height',
  'timestamp',
  'previousBlockId',
  'transactions',
  'forgerAddress',
  'forgingPublicKey',
  'nextForgingPublicKey',
  'nextForgingKeyIndex',
  'forgerSignature',
  'signatures'
];

function validateForgedBlockSchema(block, minTransactionsPerBlock, maxTransactionsPerBlock, networkSymbol) {
  if (!block) {
    throw new Error('Block was not specified');
  }
  validateBlockHeight(block.height);
  validateTimestamp(block.timestamp);
  if (block.previousBlockId != null) {
    validatePreviousBlockId(block.previousBlockId);
  }
  if (!Array.isArray(block.transactions)) {
    throw new Error('Block transactions must be an array');
  }
  if (block.transactions.length < minTransactionsPerBlock) {
    throw new Error(
      `Block did not contain enough transactions - Minimum allowed is ${minTransactionsPerBlock}`
    );
  }
  if (block.transactions.length > maxTransactionsPerBlock) {
    throw new Error(
      `Block contained too many transactions - Maximum allowed is ${maxTransactionsPerBlock}`
    );
  }
  validateWalletAddress(block.forgerAddress, networkSymbol);
  validateBlockId(block.id);
  validateForgingPublicKey(block.forgingPublicKey);
  validateNextForgingPublicKey(block.nextForgingPublicKey);
  validateNextForgingKeyIndex(block.nextForgingKeyIndex);
  validateSignature(block.forgerSignature);
  if (!Array.isArray(block.signatures)) {
    throw new Error('Block signatures must be an array');
  }

  let invalidProperty = findInvalidProperty(block, validPropertyList);

  if (invalidProperty) {
    throw new Error(
      `Block had an invalid ${invalidProperty} property`
    );
  }
}

module.exports = {
  validateForgedBlockSchema
};
