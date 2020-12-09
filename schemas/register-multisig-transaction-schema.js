function verifyRegisterMultisigTransactionSchema(transaction, maxMultisigMembers) {
  if (!transaction) {
    throw new Error('Register multisig transaction was not specified');
  }
  // TODO 222: Verify transaction properties
}

module.exports = {
  verifyRegisterMultisigTransactionSchema
};
