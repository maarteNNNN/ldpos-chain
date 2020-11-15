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

  async publish(channelName, data) {
    this.emitter.emit(channelName, data);
  }

  async subscribe(channelName, handler) {
    this.emitter.on(channelName, handler);
  }

  async invoke(procedureName, data) {
    let procedureParts = procedureName.split(':');
    let moduleName = procedureParts[0];
    let actionName = procedureParts[1];
    return this.modules[moduleName].actions[actionName](data);
  }
}

module.exports = Channel;
