class DAL {
  constructor() {
    this.accounts = {};
    this.votes = {};
    this.blocks = [null];
    this.transactions = {};
    this.multisigMembers = {};
    this.latestBlockSignatures = [];
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

  async upsertAccount(account, updateHeight) {
    this.accounts[account.address] = {
      ...account,
      updateHeight
    };
  }

  async hasAccount(accountAddress) {
    return !!this.accounts[accountAddress];
  }

  async getAccount(accountAddress) {
    let account = this.accounts[accountAddress];
    if (!account) {
      let error = new Error(`Account ${accountAddress} did not exist`);
      error.name = 'AccountDidNotExistError';
      error.type = 'InvalidActionError';
      throw error;
    }
    return account;
  }

  async updateAccount(accountAddress, changePacket, updateHeight) {
    let account = this.accounts[accountAddress];
    if (!account) {
      let error = new Error(`Account ${accountAddress} did not exist`);
      error.name = 'AccountDidNotExistError';
      error.type = 'InvalidActionError';
      throw error;
    }
    let changedKeys = Object.keys(changePacket);
    for (let key of changedKeys) {
      account[key] = changePacket[key];
    }
    account.updateHeight = updateHeight;
  }

  async getAccountVotes(voterAddress) {
    let voterAccount = this.accounts[voterAddress];
    if (!voterAccount) {
      let error = new Error(`Voter ${voterAddress} did not exist`);
      error.name = 'VoterAccountDidNotExistError';
      error.type = 'InvalidActionError';
      throw error;
    }
    let voteSet = new Set();
    let delegateAddressList = Object.keys(this.votes);
    for (let delegateAddress of delegateAddressList) {
      let delegateVoters = this.votes[delegateAddress];
      if (delegateVoters.has(voterAddress)) {
        voteSet.add(delegateAddress);
      }
    }
    return [...voteSet];
  }

  async hasVote(voterAddress, delegateAddress) {
    return this.votes[delegateAddress] && this.votes[delegateAddress].has(voterAddress);
  }

  async upsertVote(voterAddress, delegateAddress) {
    let delegateAccount = this.accounts[delegateAddress];
    if (!delegateAccount) {
      let error = new Error(`Delegate ${delegateAddress} did not exist`);
      error.name = 'DelegateAccountDidNotExistError';
      error.type = 'InvalidActionError';
      throw error;
    }
    if (!delegateAccount.forgingPublicKey) {
      let error = new Error(
        `Delegate account ${delegateAddress} was not initialized and so it cannot receive votes`
      );
      error.name = 'DelegateAccountWasNotInitializedError';
      error.type = 'InvalidActionError';
      throw error;
    }
    if (!this.accounts[voterAddress]) {
      let error = new Error(`Voter ${voterAddress} did not exist`);
      error.name = 'VoterAccountDidNotExistError';
      error.type = 'InvalidActionError';
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
      error.name = 'DelegateAccountDidNotExistError';
      error.type = 'InvalidActionError';
      throw error;
    }
    if (!this.accounts[voterAddress]) {
      let error = new Error(`Voter ${voterAddress} did not exist`);
      error.name = 'VoterAccountDidNotExistError';
      error.type = 'InvalidActionError';
      throw error;
    }
    if (!this.hasVote(voterAddress, delegateAddress)) {
      let error = new Error(
        `Account ${voterAddress} was not voting for delegate ${delegateAddress}`
      );
      error.name = 'VoteDidNotExistError';
      error.type = 'InvalidActionError';
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
      error.name = 'MultisigAccountDidNotExistError';
      error.type = 'InvalidActionError';
      throw error;
    }
    for (let memberAddress of memberAddresses) {
      let memberAccount = this.accounts[memberAddress];
      if (!memberAccount) {
        let error = new Error(
          `Account ${memberAddress} did not exist for multisig member registration`
        );
        error.name = 'MemberAccountDidNotExistError';
        error.type = 'InvalidActionError';
        throw error;
      }
      if (!memberAccount.multisigPublicKey) {
        let error = new Error(
          `Account ${memberAddress} was not initialized for multisig member registration`
        );
        error.name = 'MemberAccountWasNotInitializedError';
        error.type = 'InvalidActionError';
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
      error.name = 'MultisigAccountDidNotExistError';
      error.type = 'InvalidActionError';
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

  async setLatestBlockSignatures(signatures) {
    this.latestBlockSignatures = signatures.map((blockSignature) => {
      return {...blockSignature};
    });
  }

  async getLatestBlockSignatures() {
    return this.latestBlockSignatures;
  }

  async upsertTransaction(transaction) {
    this.transactions[transaction.id] = {
      ...transaction
    };
  }

  async hasTransaction(transactionId) {
    let transaction = this.transactions[transactionId];
    return !!transaction;
  }

  async getTransaction(transactionId) {
    let transaction = this.transactions[transactionId];
    if (!transaction) {
      let error = new Error(`Transaction ${transactionId} did not exist`);
      error.name = 'TransactionDidNotExistError';
      error.type = 'InvalidActionError';
      throw error;
    }
    return transaction;
  }

  async upsertBlock(block) {
    this.blocks[block.height] = block;
  }

  async getTopActiveDelegates(delegateCount) {
    let delegateList = [];
    let delegateAddressList = Object.keys(this.votes);
    for (let delegateAddress of delegateAddressList) {
      let voterAddressList = [...this.votes[delegateAddress]];
      let voteWeight = 0n;
      for (let voterAddress of voterAddressList) {
        let voter = this.accounts[voterAddress] || {};
        voteWeight += voter.balance || 0n;
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
