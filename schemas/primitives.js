// TODO 222 implement

function validateWalletAddress(walletAddress) {

}

function validatePublicKey(publicKey) {

}

function validateSignature(signature) {

}

function validateSignatureHash(signatureHash) {

}

function validateBlockId(blockId) {
  if (typeof blockId !== 'string') {
    throw new Error('Block ID must be a string');
  }
  if (blockId.length !== 44) {
    throw new Error('Block ID length must be 44 characters');
  }
}

function validateTransactionId(transactionId) {
  if (typeof transactionId !== 'string') {
    throw new Error('Transaction ID must be a string');
  }
  if (transactionId.length !== 44) {
    throw new Error('Transaction ID length must be 44 characters');
  }
}

function validateTransactionAmount(amount) {
  if (typeof amount !== 'string') {
    throw new Error('Transaction amount must be a string'); // TODO 22222
  }
}

function validateTransactionFee(fee) {
  if (typeof fee !== 'string') {
    throw new Error('Transaction fee must be a string'); // TODO 22222
  }
}

function validateTimestamp(timestamp) {
  if (!Number.isInteger(timestamp) || timestamp < 0) {
    throw new Error('Timestamp must be a positive integer number');
  }
}

module.exports = {
  validateWalletAddress,
  validatePublicKey,
  validateSignature,
  validateSignatureHash,
  validateBlockId,
  validateTransactionId,
  validateTransactionAmount,
  validateTransactionFee,
  validateTimestamp
};
