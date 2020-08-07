const DEFAULT_MODULE_ALIAS = 'lpos_chain';
const pkg = require('./package.json');

module.exports = class LPoSChainModule {
	constructor(options) {
		this.alias = options.alias || DEFAULT_MODULE_ALIAS;
		this.logger = options.logger;
	}

	get dependencies() {
		return ['app', 'network'];
	}

	get info() {
		return {
			author: 'Jonathan Gros-Dubois',
			version: pkg.version,
			name: DEFAULT_MODULE_ALIAS,
		};
	}

	get events() {
		return [
			'bootstrap',
			'chainChanges'
		];
	}

	get actions() {
		return {
			postTransactions: {
				handler: async action => {},
			},
			getNodeStatus: {
				handler: async () => {},
			},
			getMultisigWalletMembers: {
				handler: async action => {},
			},
			getMinMultisigRequiredSignatures: {
				handler: async action => {},
			},
			getOutboundTransactions: {
				handler: async action => {},
			},
			getInboundTransactionsFromBlock: {
				handler: async action => {},
			},
			getOutboundTransactionsFromBlock: {
				handler: async action => {},
			},
			getLastBlockAtTimestamp: {
				handler: async action => {},
			},
			getMaxBlockHeight: {
				handler: async action => {},
			},
			getBlocksBetweenHeights: {
				handler: async action => {},
			},
			getBlockAtHeight: {
				handler: async action => {},
			},
			getModuleOptions: {
				handler: async action => {},
			}
		};
	}

	async load(channel, options) {
		this.options = options;

		channel.publish(`${this.alias}:bootstrap`);
	}

	async unload() {
	}
};
