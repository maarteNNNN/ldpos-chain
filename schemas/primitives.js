function validateWalletAddress(walletAddress, networkSymbol) {
  if (typeof walletAddress !== 'string') {
    throw new Error('Wallet address must be a string');
  }
  let networkSymbolLength = networkSymbol.length;
  let walletAddressLength = 64 + networkSymbolLength;
  if (walletAddress.length !== walletAddressLength) {
    throw new Error(`Wallet address length must be ${walletAddressLength}`);
  }
}

function validatePublicKey(publicKey) {
  if (typeof publicKey !== 'string') {
    throw new Error('Public key must be a string');
  }
  if (publicKey.length !== 44) {
    throw new Error('Public key length must be 44 characters');
  }
}

function validateForgingPublicKey(publicKey) {
  try {
    validatePublicKey(publicKey);
  } catch (error) {
    throw new Error(`Invalid forging public key: ${error.message}`);
  }
}

function validateNextForgingPublicKey() {
  try {
    validatePublicKey(publicKey);
  } catch (error) {
    throw new Error(`Invalid next forging public key: ${error.message}`);
  }
}

function validateMultisigPublicKey() {
  try {
    validatePublicKey(publicKey);
  } catch (error) {
    throw new Error(`Invalid multisig public key: ${error.message}`);
  }
}

function validateNextMultisigPublicKey() {
  try {
    validatePublicKey(publicKey);
  } catch (error) {
    throw new Error(`Invalid next multisig public key: ${error.message}`);
  }
}

function validateSigPublicKey() {
  try {
    validatePublicKey(publicKey);
  } catch (error) {
    throw new Error(`Invalid sig public key: ${error.message}`);
  }
}

function validateNextSigPublicKey() {
  try {
    validatePublicKey(publicKey);
  } catch (error) {
    throw new Error(`Invalid next sig public key: ${error.message}`);
  }
}

function validateSignature(signature) {
  if (typeof signature !== 'string') {
    throw new Error('Signature must be a string');
  }
  if (signature.length !== 32984) {
    throw new Error('Signature length must be 32984 characters');
  }
}

function validateSignatureHash(signatureHash) {
  if (typeof signatureHash !== 'string') {
    throw new Error('Signature hash must be a string');
  }
  if (signatureHash.length !== 44) {
    throw new Error('Signature hash length must be 44 characters');
  }
}

function validateBlockId(blockId) {
  if (typeof blockId !== 'string') {
    throw new Error('Block ID must be a string');
  }
  if (blockId.length !== 44) {
    throw new Error('Block ID length must be 44 characters');
  }
}

function validateBlockHeight(height) {
  if (!Number.isInteger(height) || height < 1) {
    throw new Error('Block height must be an integer number greater than 0');
  }
}

function validatePreviousBlockId(previousBlockId) {
  try {
    validateBlockId(previousBlockId);
  } catch (error) {
    throw new Error(`Invalid previous block ID: ${error.message}`);
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

function validateTransactionAmount(amount, maxSpendableDigits) {
  if (typeof amount !== 'string') {
    throw new Error('Transaction amount must be a string');
  }
  if (amount.length > maxSpendableDigits) {
    throw new Error('Transaction amount exceeded the maximum spendable digits');
  }
}

function validateTransactionFee(fee, maxSpendableDigits) {
  if (typeof fee !== 'string') {
    throw new Error('Transaction fee must be a string');
  }
  if (fee.length > maxSpendableDigits) {
    throw new Error('Transaction fee exceeded the maximum spendable digits');
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
  validateForgingPublicKey,
  validateNextForgingPublicKey,
  validateMultisigPublicKey,
  validateNextMultisigPublicKey,
  validateSigPublicKey,
  validateNextSigPublicKey
  validateSignature,
  validateSignatureHash,
  validateBlockId,
  validateBlockHeight,
  validatePreviousBlockId,
  validateTransactionId,
  validateTransactionAmount,
  validateTransactionFee,
  validateTimestamp
};
