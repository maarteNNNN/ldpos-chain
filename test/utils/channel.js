const { EventEmitter } = require('events');

class Channel {
  constructor(options) {
    this.emitter = new EventEmitter();
    this.modules = options.modules;

    let moduleNameList = Object.keys(this.modules);
    for (let moduleName of moduleNameList) {
      let moduleInstance = this.modules[moduleName];
      moduleInstance.setEmitter(this.emitter);
    }
  }

  async publish(channelName, data, info) {
    this.emitter.emit(channelName, { data, info });
  }

  async subscribe(channelName, handler) {
    this.emitter.on(channelName, handler);
  }

  async invoke(procedureName, data) {
    let procedureParts = procedureName.split(':');
    let moduleName = procedureParts[0];
    let actionName = procedureParts[1];
    let targetFunction = this.modules[moduleName].actions[actionName];
    if (!targetFunction) {
      throw new Error(`The channel ${actionName} action did not exist on the ${moduleName} module`);
    }
    return targetFunction(data);
  }
}

module.exports = Channel;
