const { validateWalletAddress } = require('./primitives');

function validateRegisterMultisigWalletTransactionSchema(transaction, minMultisigMembers, maxMultisigMembers, networkSymbol) {
  if (!transaction) {
    throw new Error('Register multisig transaction was not specified');
  }
  if (
    typeof transaction.requiredSignatureCount !== 'number' ||
    transaction.requiredSignatureCount < 1 ||
    transaction.requiredSignatureCount > maxMultisigMembers
  ) {
    throw new Error(
      `Register multisig transaction requiredSignatureCount must be a number between 1 and ${
        maxMultisigMembers
      }`
    );
  }
  if (
    !Array.isArray(transaction.memberAddresses) ||
    transaction.memberAddresses.length < minMultisigMembers ||
    transaction.memberAddresses.length > maxMultisigMembers
  ) {
    throw new Error(
      `Register multisig transaction memberAddresses must be an array of length between ${
        minMultisigMembers
      } and ${
        maxMultisigMembers
      }`
    );
  }
  for (let memberAddress of transaction.memberAddresses) {
    validateWalletAddress(memberAddress, networkSymbol);
  }

  return ['requiredSignatureCount', 'memberAddresses'];
}

module.exports = {
  validateRegisterMultisigWalletTransactionSchema
};
