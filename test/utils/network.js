class LSPoSChainModule {
  constructor() {}

  get events() {
    return {
      block: async (block) => {

      },
      blockSignature: async (blockSignature) => {

      },
      transactions: async (transactions) => {

      },
    }
  }

  get actions() {
    return {
      getBlocksFromHeight: async ({ height, limit }) => {}
    };
  }
}

class NetworkModule {
  constructor() {
    this.modules = {
      ldpos_chain: new LSPoSChainModule()
    };
  }

  get actions() {
    return {
      emit: async ({ event, data }) => {
        let eventParts = event.split(':');
        let moduleName = eventParts[0];
        let actionName = eventParts[1];
      },
      request: async ({ procedure, data }) => {
        let procedureParts = procedure.split(':');
        let moduleName = procedureParts[0];
        let actionName = procedureParts[1];

        return this.modules.actions[moduleName][actionName](data);
      }
    };
  }
}

module.exports = NetworkModule;
