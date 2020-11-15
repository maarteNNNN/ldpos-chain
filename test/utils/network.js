class NetworkModule {
  constructor(options) {
    let { modules } = options;

    let moduleNameList = Object.keys(modules);
    for (let moduleName of moduleNameList) {
      let moduleInstance = modules[moduleName];
      moduleInstance.setNetwork(this);
    }
    this.modules = modules;
  }

  setEmitter(emitter) {
    this.emitter = emitter;
  }

  async trigger(fromModule, eventName, data) {
    this.emitter.emit(`network:event:${fromModule}:${eventName}`, data);
  }

  get actions() {
    return {
      emit: async ({ event, data }) => {
        let eventParts = event.split(':');
        let moduleName = eventParts[0];
        let eventName = eventParts[1];

        return this.modules[moduleName].events[eventName](data);
      },
      request: async ({ procedure, data }) => {
        let procedureParts = procedure.split(':');
        let moduleName = procedureParts[0];
        let actionName = procedureParts[1];

        return this.modules[moduleName].actions[actionName](data);
      }
    };
  }
}

module.exports = NetworkModule;
