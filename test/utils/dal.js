class DAL {
  constructor() {
    this.accounts = {};
  }

  async init(options) {
    let { genesis } = options;
    let { accounts } = genesis;

    for (let account of accounts) {
      this.accounts[account.address] = {
        ...account,
        balance: BigInt(account.balance)
      };
    }
  }

  async getAccountKeyIndexes(accountAddress) {
    let account = this.accounts[account.address];
    if (!account) {
      throw new Error(`Account ${accountAddress} does not exist`);
    }
    return {
      candidacyKeyIndex: account.candidacyKeyIndex,
      votingKeyIndex: account.votingKeyIndex,
      forgingKeyIndex: account.forgingKeyIndex,
      multisigKeyIndex: account.multisigKeyIndex,
      sigKeyIndex: account.sigKeyIndex
    };
  }

  async getAccountBalance(accountAddress) {
    let account = this.accounts[account.address];
    if (!account) {
      throw new Error(`Account ${accountAddress} does not exist`);
    }
    return account.balance;
  }
}

module.exports = DAL;
