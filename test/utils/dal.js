class DAL {
  constructor() {
    this.accounts = {};
    this.votes = {};
    this.blocks = [];
    this.transactions = {};
    this.multisigMembers = {};
  }

  async init(options) {
    let { genesis } = options;
    let { accounts } = genesis;
    let multisigWalletList = genesis.multisigWallets || [];

    await Promise.all(
      accounts.map(async (account) => {
        let { votes, ...accountWithoutVotes } = account;
        this.accounts[account.address] = {
          ...accountWithoutVotes,
          updateHeight: 0
        };
        await Promise.all(
          votes.map((delegateAddress) => this.upsertVote(account.address, delegateAddress))
        );
      })
    );

    await Promise.all(
      multisigWalletList.map(async (multisigWallet) => {
        await this.registerMultisigWallet(
          multisigWallet.address,
          multisigWallet.members,
          multisigWallet.requiredSignatureCount
        );
      })
    );
  }

  async getNetworkSymbol() {
    return 'ldpos';
  }

  async upsertAccount(account) {
    this.accounts[account.address] = {
      ...account
    };
  }

  async hasAccount(walletAddress) {
    return !!this.accounts[walletAddress];
  }

  async getAccount(walletAddress) {
    let account = this.accounts[walletAddress];
    if (!account) {
      let error = new Error(`Account ${walletAddress} did not exist`);
      error.name = 'AccountDidNotExistError';
      error.type = 'InvalidActionError';
      throw error;
    }
    return {...account};
  }

  async updateAccount(walletAddress, changePacket) {
    let account = this.accounts[walletAddress];
    if (!account) {
      let error = new Error(`Account ${walletAddress} did not exist`);
      error.name = 'AccountDidNotExistError';
      error.type = 'InvalidActionError';
      throw error;
    }
    let changedKeys = Object.keys(changePacket);
    for (let key of changedKeys) {
      account[key] = changePacket[key];
    }
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
        `Delegate account ${delegateAddress} was not registered for forging and so it cannot receive votes`
      );
      error.name = 'DelegateAccountWasNotRegisteredError';
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
    let delegateVoterSet = this.votes[delegateAddress];
    if (delegateVoterSet.has(voterAddress)) {
      let error = new Error(
        `Voter ${voterAddress} already voted for delegate ${delegateAddress}`
      );
      error.name = 'VoterAlreadyVotedForDelegateError';
      error.type = 'InvalidActionError';
      throw error;
    }
    delegateVoterSet.add(voterAddress);
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

  async registerMultisigWallet(multisigAddress, memberAddresses, requiredSignatureCount) {
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
          `Account ${memberAddress} was not registered for multisig so it cannot be a member of a multisig wallet`
        );
        error.name = 'MemberAccountWasNotRegisteredError';
        error.type = 'InvalidActionError';
        throw error;
      }
      if (memberAccount.type === 'multisig') {
        let error = new Error(
          `Account ${
            memberAddress
          } was a multisig wallet so it could not be registered as a member of another multisig wallet`
        );
        error.name = 'MemberAccountWasMultisigAccountError';
        error.type = 'InvalidActionError';
        throw error;
      }
    }
    multisigAccount.type = 'multisig';
    multisigAccount.requiredSignatureCount = requiredSignatureCount;
    this.multisigMembers[multisigAddress] = new Set(memberAddresses);
  }

  async getMultisigWalletMembers(multisigAddress) {
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

  async getLastBlock() {
    return this.blocks[this.blocks.length - 1];
  }

  async getBlocksFromHeight(height, limit) {
    if (height < 1) {
      height = 1;
    }
    let startIndex = height - 1;
    return this.blocks.slice(startIndex, startIndex + limit);
  }

  async getLastBlockAtTimestamp(timestamp) {
    let blockList = [...this.blocks];
    blockList.sort((blockA, blockB) => {
      if (blockA.timestamp > blockB.timestamp) {
        return -1;
      }
      if (blockA.timestamp < blockB.timestamp) {
        return 1;
      }
      return 0;
    });
    let block = blockList.find(block => block.timestamp <= timestamp);
    if (!block) {
      let error = new Error(
        `No block existed with timestamp less than or equal to ${timestamp}`
      );
      error.name = 'BlockDidNotExistError';
      error.type = 'InvalidActionError';
      throw error;
    }
    return block;
  }

  async getBlocksBetweenHeights(fromHeight, toHeight, limit) {
    let selectedBlocks = [];
    for (let block of this.blocks) {
      if (block.height > fromHeight && block.height <= toHeight) {
        selectedBlocks.push(block);
        if (selectedBlocks.length >= limit) {
          break;
        }
      }
    }
    return selectedBlocks;
  }

  async getBlockAtHeight(height) {
    let block = this.blocks[height - 1];
    if (!block) {
      let error = new Error(
        `No block existed at height ${height}`
      );
      error.name = 'BlockDidNotExistError';
      error.type = 'InvalidActionError';
      throw error;
    }
    return block;
  }

  async upsertTransaction(transaction) {
    this.transactions[transaction.id] = {
      ...transaction
    };
  }

  async upsertBlock(block, synched) {
    this.blocks[block.height - 1] = block;
    let { transactions } = block;
    let len = transactions.length;
    for (let i = 0; i < len; i++) {
      let txn = transactions[i];
      this.transactions[txn.id] = {
        ...txn,
        blockId: block.id,
        indexInBlock: i
      };
    }
  }

  async getMaxBlockHeight() {
    return this.blocks.length;
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

  async getTransactionsFromBlock(blockId, offset, limit) {
    if (offset == null) {
      offset = 0;
    }
    let transactionList = Object.values(this.transactions);
    let blockTxns = transactionList.filter(
      transaction => transaction.blockId === blockId && transaction.indexInBlock >= offset
    );
    if (limit == null) {
      return blockTxns;
    }
    return blockTxns.slice(0, limit);
  }

  async getOutboundTransactions(walletAddress, fromTimestamp, limit) {
    let transactionList = Object.values(this.transactions);
    let outboundTransactions = [];
    for (let transaction of transactionList) {
      if (transaction.senderAddress === walletAddress && transaction.timestamp >= fromTimestamp) {
        outboundTransactions.push(transaction);
        if (outboundTransactions.length >= limit) {
          break;
        }
      }
    }
    return outboundTransactions;
  }

  async getInboundTransactionsFromBlock(walletAddress, blockId) {
    let transactionList = Object.values(this.transactions);
    return transactionList.filter(
      transaction => transaction.blockId === blockId && transaction.recipientAddress === walletAddress
    );
  }

  async getOutboundTransactionsFromBlock(walletAddress, blockId) {
    let transactionList = Object.values(this.transactions);
    return transactionList.filter(
      transaction => transaction.blockId === blockId && transaction.senderAddress === walletAddress
    );
  }

  async getTopActiveDelegates(delegateCount) {
    let delegateList = [];
    let delegateAddressList = Object.keys(this.votes);
    for (let delegateAddress of delegateAddressList) {
      let voterAddressList = [...this.votes[delegateAddress]];
      let voteWeight = 0n;
      for (let voterAddress of voterAddressList) {
        let voter = this.accounts[voterAddress] || {};
        voteWeight += BigInt(voter.balance || 0);
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

    return delegateList.slice(0, delegateCount).map((delegate) => {
      return {
        ...delegate,
        voteWeight: delegate.voteWeight.toString()
      };
    });
  }
}

module.exports = DAL;
