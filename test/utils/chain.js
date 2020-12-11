class LDPoSChainModule {
  constructor() {}

  setNetwork(network) {
    this.network = network;
  }

  get events() {
    return {
      block: async (block) => {
        this.network.trigger('ldpos_chain', 'block', block);
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
      },
      getLatestBlockSignatures: async ({ blockId }) => {
        return [];
      }
    };
  }
}

module.exports = LDPoSChainModule;
