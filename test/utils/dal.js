class DAL {
  constructor() {
    this.accounts = {};
    this.votes = {};
  }

  async init(options) {
    let { genesis } = options;
    let { accounts } = genesis;

    for (let account of accounts) {
      this.accounts[account.address] = {
        ...account,
        balance: BigInt(account.balance)
      };
      for (let vote of account.votes) {
        if (!this.votes[vote]) {
          this.votes[vote] = [];
        }
        this.votes[vote].push(account.address);
      }
    }
  }

  async getNetworkSymbol() {
    return 'ldpos';
  }

  async getAccountKeyIndexes(accountAddress) {
    let account = this.accounts[account.address];
    if (!account) {
      throw new Error(`Account ${accountAddress} does not exist`);
    }
    return {
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
