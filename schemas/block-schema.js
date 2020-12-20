const {
  validateWalletAddress,
  validateBlockId,
  validateForgingKeyIndex,
  validatePreviousBlockId,
  validateForgingPublicKey,
  validateNextForgingPublicKey,
  validateTimestamp,
  validateBlockHeight
} = require('./primitives');

function verifyBlockSchema(block, maxTransactionsPerBlock, networkSymbol) {
  if (!block) {
    throw new Error('Block was not specified');
  }
  validateBlockHeight(block.height);
  validateTimestamp(block.timestamp);
  if (!Array.isArray(block.transactions)) {
    throw new Error('Block transactions must be an array');
  }
  if (block.transactions.length > maxTransactionsPerBlock) {
    throw new Error(
      `Block contained too many transactions - Maximum allowed is ${maxTransactionsPerBlock}`
    );
  }
  validateWalletAddress(block.forgerAddress, networkSymbol);
  validateBlockId(block.id);
  if (block.previousBlockId != null) {
    validatePreviousBlockId(block.previousBlockId);
  }
  validateForgingKeyIndex(block.forgingKeyIndex);
  validateForgingPublicKey(block.forgingPublicKey);
  validateNextForgingPublicKey(block.nextForgingPublicKey);
}

module.exports = {
  verifyBlockSchema
};
