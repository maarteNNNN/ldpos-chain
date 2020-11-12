class DAL {
  constructor() {
    this.accounts = {};
    this.votes = {};
    this.blocks = [null];
  }

  async init(options) {
    let { genesis } = options;
    let { accounts } = genesis;

    for (let account of accounts) {
      this.accounts[account.address] = {
        ...account,
        balance: BigInt(account.balance),
        updateHeight: 1
      };
      for (let vote of account.votes) {
        if (!this.votes[vote]) {
          this.votes[vote] = [];
        }
        this.votes[vote].push({
          ...account
        });
      }
    }
  }

  async getNetworkSymbol() {
    return 'ldpos';
  }

  async getAccount(accountAddress) {
    let account = this.accounts[account.address];
    if (!account) {
      throw new Error(`Account ${accountAddress} does not exist`);
    }
    return account;
  }

  async setAccountBalance(accountAddress, balance, updateHeight) {
    let account = this.accounts[account.address];
    if (!account) {
      throw new Error(`Account ${accountAddress} does not exist`);
    }
    account.balance = balance;
    account.updateHeight = updateHeight;
  }

  async updateAccount(accountAddress, changePacket, updateHeight) {
    let account = this.accounts[account.address];
    if (!account) {
      throw new Error(`Account ${accountAddress} does not exist`);
    }
    let changedKeys = Object.keys(changePacket);
    for (let key of changedKeys) {
      account[key] = changePacket[key];
    }
    account.updateHeight = updateHeight;
  }

  async getBlockAtHeight(height) {
    return this.blocks[height];
  }

  async getLatestBlock() {
    return this.blocks[this.blocks.length - 1];
  }

  async getLatestHeight() {
    return this.blocks.length;
  }

  async insertBlock(block) {
    this.blocks[block.height] = block;
  }

  async getTopActiveDelegates(delegateCount) {
    let delegateList = [];
    let delegateAddressList = Object.keys(this.votes);
    for (let delegateAddress of delegateAddressList) {
      let voterList = this.votes[delegateAddress];
      let voteWeight = 0;
      for (let voter of voterList) {
        voteWeight += voter.balance;
      }
      delegateList.push({
        address: delegateAddress,
        voteWeight
      });
    }

    delegateList.sort((a, b) => {
      if (a.voteWeight > b.voteWeight) {
        return -1;
      }
      if (a.voteWeight < b.voteWeight) {
        return 1;
      }
      return 0;
    });

    return delegateList.slice(0, delegateCount);
  }
}

module.exports = DAL;
