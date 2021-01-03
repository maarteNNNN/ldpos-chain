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

function validateSigPublicKey(publicKey) {
  try {
    validatePublicKey(publicKey);
  } catch (error) {
    throw new Error(`Invalid sig public key: ${error.message}`);
  }
}

function validateNextSigKeyIndex(keyIndex) {
  if (!Number.isInteger(keyIndex) || keyIndex < 0 || keyIndex > Number.MAX_SAFE_INTEGER) {
    throw new Error(
      `Next sig key index must be an integer number between 0 and ${Number.MAX_SAFE_INTEGER} inclusive`
    );
  }
}

function validateNextSigPublicKey(publicKey) {
  try {
    validatePublicKey(publicKey);
  } catch (error) {
    throw new Error(`Invalid next sig public key: ${error.message}`);
  }
}

function validateMultisigPublicKey(publicKey) {
  try {
    validatePublicKey(publicKey);
  } catch (error) {
    throw new Error(`Invalid multisig public key: ${error.message}`);
  }
}

function validateNextMultisigKeyIndex(keyIndex) {
  if (!Number.isInteger(keyIndex) || keyIndex < 0 || keyIndex > Number.MAX_SAFE_INTEGER) {
    throw new Error(
      `Next multisig key index must be an integer number between 0 and ${Number.MAX_SAFE_INTEGER} inclusive`
    );
  }
}

function validateNextMultisigPublicKey(publicKey) {
  try {
    validatePublicKey(publicKey);
  } catch (error) {
    throw new Error(`Invalid next multisig public key: ${error.message}`);
  }
}

function validateForgingPublicKey(publicKey) {
  try {
    validatePublicKey(publicKey);
  } catch (error) {
    throw new Error(`Invalid forging public key: ${error.message}`);
  }
}

function validateNextForgingKeyIndex(keyIndex) {
  if (!Number.isInteger(keyIndex) || keyIndex < 0 || keyIndex > Number.MAX_SAFE_INTEGER) {
    throw new Error(
      `Next forging key index must be an integer number between 0 and ${Number.MAX_SAFE_INTEGER} inclusive`
    );
  }
}

function validateNextForgingPublicKey(publicKey) {
  try {
    validatePublicKey(publicKey);
  } catch (error) {
    throw new Error(`Invalid next forging public key: ${error.message}`);
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

function validateTransactionMessage(message, maxTransactionMessageLength) {
  if (typeof message !== 'string') {
    throw new Error('Transaction message must be a string');
  }
  if (message.length > maxTransactionMessageLength) {
    throw new Error(
      `Transaction message must not exceed ${maxTransactionMessageLength} characters`
    );
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
  validateNextForgingKeyIndex,
  validateForgingPublicKey,
  validateNextForgingPublicKey,
  validateNextMultisigKeyIndex,
  validateMultisigPublicKey,
  validateNextMultisigPublicKey,
  validateNextSigKeyIndex,
  validateSigPublicKey,
  validateNextSigPublicKey,
  validateSignature,
  validateSignatureHash,
  validateBlockId,
  validateBlockHeight,
  validatePreviousBlockId,
  validateTransactionId,
  validateTransactionMessage,
  validateTransactionAmount,
  validateTransactionFee,
  validateTimestamp
};
