function isValidWalletAddress(walletAddress, networkSymbol) {
  if (typeof walletAddress !== 'string') {
    return false;
  }
  let networkSymbolLength = networkSymbol.length;
  let walletAddressLength = 64 + networkSymbolLength;
  if (walletAddress.length !== walletAddressLength) {
    return false;
  }
  return true;
}

function validateWalletAddress(propertyName, packet, networkSymbol) {
  let walletAddress = packet[propertyName];

  if (!isValidWalletAddress(walletAddress, networkSymbol)) {
    throw new Error(
      `Wallet address in ${propertyName} must be a string with a length of ${walletAddressLength} characters`
    );
  }
}

function validatePublicKey(propertyName, packet) {
  let publicKey = packet[propertyName];
  if (typeof publicKey !== 'string') {
    throw new Error(`Public key in ${propertyName} must be a string`);
  }
  if (publicKey.length !== 44) {
    throw new Error(`Public key in ${propertyName} must have a length of 44 characters`);
  }
}

function validateKeyIndex(propertyName, packet) {
  let keyIndex = packet[propertyName];
  if (!Number.isInteger(keyIndex) || keyIndex < 0 || keyIndex > Number.MAX_SAFE_INTEGER) {
    throw new Error(
      `Next forging key index in ${
        propertyName
      } must be an integer number between 0 and ${
        Number.MAX_SAFE_INTEGER
      } inclusive`
    );
  }
}

function validateSignature(propertyName, packet) {
  let signature = packet[propertyName];
  if (typeof signature !== 'string') {
    throw new Error(`Signature in ${propertyName} must be a string`);
  }
  if (signature.length !== 32984) {
    throw new Error(`Signature in ${propertyName} must have a length of 32984 characters`);
  }
}

function validateSignatureHash(propertyName, packet) {
  let signatureHash = packet[propertyName];
  if (typeof signatureHash !== 'string') {
    throw new Error(`Signature hash in ${propertyName} must be a string`);
  }
  if (signatureHash.length !== 44) {
    throw new Error(`Signature hash in ${propertyName} must have a length of 44 characters`);
  }
}

function validateBlockId(propertyName, packet) {
  let blockId = packet[propertyName];
  if (typeof blockId !== 'string') {
    throw new Error(`Block ID must in ${propertyName} be a string`);
  }
  if (blockId.length !== 44) {
    throw new Error(`Block ID in ${propertyName} must have a length of 44 characters`);
  }
}

function validateBlockHeight(propertyName, packet) {
  let height = packet[propertyName];
  if (!Number.isInteger(height) || height < 1) {
    throw new Error(`Block height in ${propertyName} must be an integer number greater than 0`);
  }
}

function validateTransactionId(propertyName, packet) {
  let transactionId = packet[propertyName];
  if (typeof transactionId !== 'string') {
    throw new Error(`Transaction ID in ${propertyName} must be a string`);
  }
  if (transactionId.length !== 44) {
    throw new Error(`Transaction ID in ${propertyName} must have a length of 44 characters`);
  }
}

function validateTransactionMessage(propertyName, packet, maxTransactionMessageLength) {
  let message = packet[propertyName];
  if (typeof message !== 'string') {
    throw new Error(`Transaction message in ${propertyName} must be a string`);
  }
  if (message.length > maxTransactionMessageLength) {
    throw new Error(
      `Transaction message in ${propertyName} must not exceed ${maxTransactionMessageLength} characters`
    );
  }
}

function validateTransactionAmount(propertyName, packet, maxSpendableDigits) {
  let amount = packet[propertyName];
  if (typeof amount !== 'string') {
    throw new Error(`Transaction amount in ${propertyName} must be a string`);
  }
  if (amount.length > maxSpendableDigits) {
    throw new Error(`Transaction amount in ${propertyName} exceeded the maximum spendable digits`);
  }
}

function validateTransactionFee(propertyName, packet, maxSpendableDigits) {
  let fee = packet[propertyName];
  if (typeof fee !== 'string') {
    throw new Error(`Transaction fee in ${propertyName} must be a string`);
  }
  if (fee.length > maxSpendableDigits) {
    throw new Error(`Transaction fee in ${propertyName} exceeded the maximum spendable digits`);
  }
}

function validateTimestamp(propertyName, packet) {
  let timestamp = packet[propertyName];
  if (!Number.isInteger(timestamp) || timestamp < 0) {
    throw new Error(`Timestamp in ${propertyName} must be a positive integer number`);
  }
}

module.exports = {
  isValidWalletAddress,
  validateWalletAddress,
  validatePublicKey,
  validateKeyIndex,
  validateSignature,
  validateSignatureHash,
  validateBlockId,
  validateBlockHeight,
  validateTransactionId,
  validateTransactionMessage,
  validateTransactionAmount,
  validateTransactionFee,
  validateTimestamp
};
