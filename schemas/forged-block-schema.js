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
  validateSignature(block.signature);
}

module.exports = {
  validateForgedBlockSchema
};
