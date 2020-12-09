class DAL {
  constructor() {
    this.accounts = {};
    this.votes = {};
    this.blocks = [null];
    this.multisigMembers = {};
  }

  async init(options) {
    let { genesis } = options;
    let { accounts } = genesis;

    for (let account of accounts) {
      let { votes, ...accountWithoutVotes } = account;
      this.accounts[account.address] = {
        ...accountWithoutVotes,
        balance: BigInt(account.balance),
        updateHeight: 1
      };
      for (let delegate of votes) {
        if (!this.votes[delegate]) {
          this.votes[delegate] = new Set();
        }
        this.votes[delegate].add(account.address);
      }
    }
  }

  async getNetworkSymbol() {
    return 'ldpos';
  }

  async getAccount(accountAddress) {
    let account = this.accounts[account.address];
    if (!account) {
      let error = new Error(`Account ${accountAddress} did not exist`);
      error.name = 'InvalidActionError';
      throw error;
    }
    return account;
  }

  async updateAccount(accountAddress, changePacket, updateHeight) {
    let account = this.accounts[account.address];
    if (!account) {
      let error = new Error(`Account ${accountAddress} did not exist`);
      error.name = 'InvalidActionError';
      throw error;
    }
    let changedKeys = Object.keys(changePacket);
    for (let key of changedKeys) {
      account[key] = changePacket[key];
    }
    account.updateHeight = updateHeight;
  }

  async addVote(voterAddress, delegateAddress) {
    if (!this.accounts[delegateAddress]) {
      let error = new Error(`Delegate ${delegateAddress} did not exist`);
      error.name = 'InvalidActionError';
      throw error;
    }
    if (!this.accounts[voterAddress]) {
      let error = new Error(`Voter ${voterAddress} did not exist`);
      error.name = 'InvalidActionError';
      throw error;
    }
    if (!this.votes[delegateAddress]) {
      this.votes[delegateAddress] = new Set();
    }
    this.votes[delegateAddress].add(voterAddress);
  }

  async removeVote(voterAddress, delegateAddress) {
    if (!this.accounts[delegateAddress]) {
      let error = new Error(`Delegate ${delegateAddress} did not exist`);
      error.name = 'InvalidActionError';
      throw error;
    }
    if (!this.accounts[voterAddress]) {
      let error = new Error(`Voter ${voterAddress} did not exist`);
      error.name = 'InvalidActionError';
      throw error;
    }
    if (!this.votes[delegateAddress] || !this.votes[delegateAddress].has(voterAddress)) {
      let error = new Error(
        `Account ${voterAddress} was not voting for delegate ${delegateAddress}`
      );
      error.name = 'InvalidActionError';
      throw error;
    }
    this.votes[delegateAddress].delete(voterAddress);
  }

  async registerMultisig(multisigAddress, memberAddresses, requiredSignatureCount) {
    let multisigAccount = this.accounts[multisigAddress];
    if (!multisigAccount) {
      let error = new Error(
        `Account ${multisigAddress} did not exist for multisig wallet registration`
      );
      error.name = 'InvalidActionError';
      throw error;
    }
    if (this.multisigMembers[multisigAddress]) {
      let error = new Error(
        `Multisig address ${multisigAddress} has already been registered`
      );
      error.name = 'InvalidActionError';
      throw error;
    }
    for (let memberAddress of memberAddresses) {
      if (!this.accounts[memberAddress]) {
        let error = new Error(
          `Account ${memberAddress} did not exist for multisig member registration`
        );
        error.name = 'InvalidActionError';
        throw error;
      }
    }
    multisigAccount.type = 'multisig';
    multisigAccount.multisigRequiredSignatureCount = requiredSignatureCount;
    this.multisigMembers[multisigAddress] = new Set(memberAddresses);
  }

  async getMultisigMembers(multisigAddress) {
    let memberAddresses = this.multisigMembers[multisigAddress];
    if (!memberAddresses) {
      let error = new Error(
        `Address ${multisigAddress} is not registered as a multisig wallet`
      );
      error.name = 'InvalidActionError';
      throw error;
    }
    return [...memberAddresses];
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

  async getBlocksFromHeight(height, limit) {
    return this.blocks.slice(height, height + limit);
  }

  async addBlock(block) {
    this.blocks[block.height] = block;
  }

  async getTopActiveDelegates(delegateCount) {
    let delegateList = [];
    let delegateAddressList = Object.keys(this.votes);
    for (let delegateAddress of delegateAddressList) {
      let voterAddressList = [...this.votes[delegateAddress]];
      let voteWeight = 0;
      for (let voterAddress of voterAddressList) {
        let voter = this.accounts[voterAddress] || {};
        voteWeight += voter.balance || 0;
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
