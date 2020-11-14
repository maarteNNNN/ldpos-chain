const { EventEmitter } = require('events');

class Channel {
  constructor(options) {
    this.emitter = new EventEmitter();
    this.modules = options.modules;
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
    return this.modules.actions[moduleName][actionName](data);
  }
}

module.exports = Channel;
