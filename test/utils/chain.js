class LDPoSChainModule {
  constructor() {
    this.receivedBlockIdSet = new Set();
  }

  setNetwork(network) {
    this.network = network;
  }

  get events() {
    return {
      block: async (block) => {
        if (block && block.id && !this.receivedBlockIdSet.has(block.id)) {
          this.receivedBlockIdSet.add(block.id);
          this.network.trigger('ldpos_chain', 'block', block);
        }
      },
      blockSignature: async (blockSignature) => {

      },
      transactions: async (transactions) => {

      }
    }
  }

  get actions() {
    return {
      getBlocksFromHeight: async ({ height, limit }) => {
        return [];
      }
    };
  }
}

module.exports = LDPoSChainModule;
