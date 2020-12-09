const verifyTransactionSchema = require('./transaction-schema');

function verifyBlockSchema(block, maxTransactionsPerBlock) {
  if (!block) {
    throw new Error('Block was not specified');
  }
  if (!Number.isInteger(block.height) || block.height < 1) {
    throw new Error('Block height must be an integer number greater than 0');
  }
  if (!Number.isInteger(block.timestamp) || block.timestamp < 0) {
    throw new Error('Block timestamp must be a positive integer number');
  }
  if (!Array.isArray(block.transactions)) {
    throw new Error('Block transactions must be an array');
  }
  if (block.transactions.length > maxTransactionsPerBlock) {
    throw new Error(
      `Block contained too many transactions - Maximum allowed is ${maxTransactionsPerBlock}`
    );
  }
  if (typeof block.previousBlockId !== 'string') {
    throw new Error('Block previousBlockId must be a string');
  }
  if (typeof block.forgerAddress !== 'string') {
    throw new Error('Block forgerAddress must be a string');
  }
  if (typeof block.forgingPublicKey !== 'string') {
    throw new Error('Block forgingPublicKey must be a string');
  }
  if (typeof block.nextForgingPublicKey !== 'string') {
    throw new Error('Block nextForgingPublicKey must be a string');
  }
  if (typeof block.id !== 'string') {
    throw new Error('Block id must be a string');
  }
}

module.exports = {
  verifyBlockSchema
};
