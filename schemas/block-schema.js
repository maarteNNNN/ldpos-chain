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

function validateBlockSchema(block, minTransactionsPerBlock, maxTransactionsPerBlock, minSignatures, maxSignatures, networkSymbol) {
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
  if (block.signatures.length > maxSignatures) {
    throw new Error(
      `Block contained more than the maximum number of ${maxSignatures} signatures`
    );
  }

  let invalidProperty = findInvalidProperty(block, validPropertyList);

  if (invalidProperty) {
    throw new Error(
      `Block had an invalid ${invalidProperty} property`
    );
  }

  let signerSet = new Set();
  for (let blockSignature of block.signatures) {
    validateBlockSignatureSchema(blockSignature, networkSymbol);
    if (blockSignature.signerAddress === block.forgerAddress) {
      throw new Error(
        `Block contained a second signature from the block forger ${block.forgerAddress}`
      );
    }
    if (signerSet.has(blockSignature.signerAddress)) {
      throw new Error(
        `Block contained a duplicate signature`
      );
    }
    signerSet.add(blockSignature.signerAddress);
  }
  if (signerSet.size < minSignatures) {
    throw new Error(
      `Block signatures did not refer to a sufficient number of unique signers - There were ${
        signerSet.size
      } signatures but ${minSignatures} were required`
    );
  }
}

module.exports = {
  validateBlockSchema
};
