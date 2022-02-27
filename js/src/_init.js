// ToDo:
// - sync data (_node.sync)

class RemoteBase {
	// true  => allow
	// false => block
	async onImport(json){return false}
	async onModule(urls){return false}

	// To be replaced on blocked and any sync is now disabled
	onDisabled(){}

	// "onSyncOut" function need to be replaced and the data need to be send to remote client
	onSyncOut(data){}
	_onSyncOut(data){ this.onSyncOut(JSON.stringify(data)) }

	constructor(instance){
		this.instance = instance;
		this._skipEvent = false;
	}

	async _syncModuleList(urls){
		this._skipEvent = true;

		if(await this.onModule(urls) === true){
			// Import from editor
			this._skipEvent = true;

			let oldList = Object.keys(Blackprint.modulesURL);

			for (var i = oldList.length - 1; i >= 0; i--) {
				var url = oldList[i];
				let index = urls.indexOf(url);

				// Remove module
				if(index === -1){
					Blackprint.deleteModuleFromURL(url);
					continue;
				}

				urls.splice(index, 1);
			}

			if(urls.length !== 0){
				console.log(`Adding ${urls.length} new module triggered by remote sync`);
				loadModuleURL(urls, {
					loadBrowserInterface: Blackprint.Sketch != null
				});
			}

			this._skipEvent = true;
		}
		else {
			// Disable remote on blocked module sync
			console.error("Loaded module sync was denied, the remote control will be disabled");
			this.onSyncIn = ()=>{};
			this.onSyncOut = ()=>{};
			this.onDisabled?.();
			this._skipEvent = true;
		}

		this._skipEvent = false;
	}
}

class RemoteEngine extends RemoteBase {
	constructor(instance){
		super(instance);

		let { ifaceList } = instance;
		Blackprint.settings('_remoteEngine', true);

		let evCableDisconnect;
		instance.on('cable.disconnect', evCableDisconnect = ({ cable }) => {
			if(cable._evDisconnected || this._skipEvent) return;
			this._onSyncOut({
				w:'c',
				inp:{i: ifaceList.indexOf(cable.input.iface), s: cable.input.source, n: cable.input.name},
				out:{i: ifaceList.indexOf(cable.output.iface), s: cable.output.source, n: cable.output.name},
				t:'d'
			});
		});

		let evFlowEvent;
		instance.on('_flowEvent', evFlowEvent = cable => {
			if(this._skipEvent) return;
			this._onSyncOut({
				w:'c',
				inp:{i: ifaceList.indexOf(cable.input.iface), s: cable.input.source, n: cable.input.name},
				out:{i: ifaceList.indexOf(cable.output.iface), s: cable.output.source, n: cable.output.name},
				t:'f'
			});
		});

		let evNodeSync;
		instance.on('_node.sync', evNodeSync = ev => {
			if(this._skipEvent) return;
			this._onSyncOut({w:'nd', i:ifaceList.indexOf(ev.iface), d: ev.data, t:'s'})
		});

		let evError;
		instance.on('error', evError = ev => {
			if(this._skipEvent) return;
			this._onSyncOut({w:'err', d: ev.data})
		});

		// instance.on('cable.connecting', cable => {});
		// instance.on('cable.cancel', cable => {});
		// instance.on('port.output.call', cable => {});
		// instance.on('port.output.value', cable => {});

		this.destroy = () => {
			instance.off('cable.disconnect', evCableDisconnect);
			instance.off('_flowEvent', evFlowEvent);
			instance.off('_node.sync', evNodeSync);
			instance.off('error', evError);

			this.onSyncIn = ()=>{};
			this.onSyncOut = ()=>{};
		}
	}

	async onSyncIn(data){
		data = JSON.parse(data);
		let { ifaceList } = this.instance;

		if(data.w === 'c'){ // cable
			let {inp, out} = data;
			let ifaceInput = ifaceList[inp.i];
			let ifaceOutput = ifaceList[out.i];

			if(data.t === 'c'){ // connect
				let inputPort = ifaceInput[inp.s][inp.n];
				let outputPort = ifaceOutput[out.s][out.n];

				inputPort.connectPort(outputPort);
				return;
			}

			let cables = ifaceInput[inp.s][inp.n].cables;
			let cable;
			for (var i = 0; i < cables.length; i++) {
				if(cables[i].output === ifaceOutput){
					cable = cables[i];
					break;
				}
			}

			if(cable == null) return;

			if(data.t === 'd'){ // disconnect
				cable._evDisconnected = true;
				cable.disconnect();
			}
		}
		else if(data.w === 'nd'){ // node
			let iface = ifaceList[data.i];

			if(data.t === 's'){ // sync
				if(iface != null)
					throw new Error("Node list was not synced");

				iface.node.syncIn?.(data.d);
			}
			else if(data.t === 'c'){ // created
				if(iface != null) throw new Error("Node list was not synced");
				let newIface = this.instance.createNode(data.nm);

				if(ifaceList.indexOf(newIface) !== data.i)
					throw new Error("Node list was not synced");
			}
			else if(data.t === 'd'){ // deleted
				if(iface == null) throw new Error("Node list was not synced");
				this.instance.deleteNode(iface);
			}
		}
		else if(data.w === 'ins'){ // instance
			let instance = this.instance;

			if(data.t === 'c'){ // clean nodes
				this._skipEvent = true;
				instance.clearNodes();
				this._skipEvent = false;
			}
			else if(data.t === 'ci'){ // clean import
				this._skipEvent = true;
				// instance.clearNodes();

				if(await this.onImport() === true){
					this._skipEvent = true;
					await instance.importJSON(data.d);
					this._skipEvent = false;
				}

				this._skipEvent = false;
			}
			else if(data.t === 'sml') // sync module list
				this._syncModuleList(data.d);
			else if(data.t === 'nidc'){ // node id changed
				this._skipEvent = true;

				let old = instance.iface[data.from];
				if(old == null)
					throw new Error("Node list was not synced");

				// This may need to be changed if the ID was being used for reactivity
				delete instance.iface[data.from];
				instance.iface[data.to] = old;
				old.id = data.to;

				this._skipEvent = false;
			}
		}
	}
}

// Will be extended by RemoteSketch
class RemoteControl extends RemoteBase {
	constructor(instance){
		super(instance);
		this.isSketch = false;
		let { ifaceList } = instance;

		let evCableConnect;
		instance.on('cable.connect', evCableConnect = ({ cable }) => {
			if(this._skipEvent) return;
			let ci = this.isSketch ? instance.scope('cables').list.indexOf(cable) : -1;

			this._onSyncOut({
				w:'c',
				ci,
				inp:{i: ifaceList.indexOf(cable.input.iface), s: cable.input.source, n: cable.input.name},
				out:{i: ifaceList.indexOf(cable.output.iface), s: cable.output.source, n: cable.output.name},
				t:'c'
			});
		});

		let evCableDisconnect;
		instance.on('cable.disconnect', evCableDisconnect = ({ cable }) => {
			if(cable._evDisconnected || this._skipEvent) return;
			let ci = this.isSketch ? instance.scope('cables').list.indexOf(cable) : -1;

			this._onSyncOut({
				w:'c',
				ci,
				inp:{i: ifaceList.indexOf(cable.input.iface), s: cable.input.source, n: cable.input.name},
				out:{i: ifaceList.indexOf(cable.output.iface), s: cable.output.source, n: cable.output.name},
				t:'d'
			});
		});

		let evNodeCreated;
		instance.on('node.created', evNodeCreated = ev => {
			if(this._skipEvent) return;

			if(this.isSketch){
				this._onSyncOut({w:'nd', i:ifaceList.indexOf(ev.iface), t:'c',
					nm: ev.iface.namespace,
					x: ev.iface.x,
					y: ev.iface.y,
				});
			}
			else this._onSyncOut({w:'nd', i:ifaceList.indexOf(ev.iface), t:'c', nm: ev.iface.namespace});
		});

		let evNodeDelete;
		instance.on('node.delete', evNodeDelete = ev => {
			if(this._skipEvent) return;
			this._onSyncOut({w:'nd', i:ifaceList.indexOf(ev.iface), t:'d'})
		});

		let evNodeSync;
		instance.on('_node.sync', evNodeSync = ev => {
			if(this._skipEvent) return;
			this._onSyncOut({w:'nd', i:ifaceList.indexOf(ev.iface), d: ev.data, t:'s'});
		});

		let evModuleDelete;
		Blackprint.on('moduleDelete', evModuleDelete = ev => {
			if(this._skipEvent) return;
			this.syncModuleList();
		});

		this.destroy = () => {
			instance.off('cable.connect', evCableConnect);
			instance.off('cable.disconnect', evCableDisconnect);
			instance.off('node.created', evNodeCreated);
			instance.off('node.delete', evNodeDelete);
			instance.off('_node.sync', evNodeSync);
			Blackprint.off('moduleDelete', evModuleDelete);

			this.onSyncIn = ()=>{};
			this.onSyncOut = ()=>{};
		}
	}

	_sMLPending = false;
	syncModuleList(){
		if(this._sMLPending) return;
		this._sMLPending = true

		// Avoid burst sync when delete/add new module less than 2 seconds
		// And we need to wait until the module was deleted/added and get the latest list
		setTimeout(()=>{
		    this._sMLPending = false;

			this._onSyncOut({w:'ins', t:'sml', d: Object.keys(Blackprint.modulesURL)});
		}, 2000);
	}

	clearNodes(){
		this._skipEvent = true;
		this.instance.clearNodes();
		this._skipEvent = false;

		this._onSyncOut({w:'ins', t:'c'})
	}

	async importRemoteJSON(){
		this._onSyncOut({w:'ins', t:'ajs'});
	}

	async sendSketchToRemote(){
		this._onSyncOut({w:'ins', t:'ci', d: this.instance.exportJSON()});
	}

	async importJSON(data, options, noSync, force){
		this._skipEvent = true;
		if(!noSync) this._onSyncOut({w:'ins', t:'ci', d:data});

		if(!force){
			if(await this.onImport(data) === true)
				await this.instance.importJSON(data, options);
			else {
				// Disable remote on blocked instance's nodes/cable sync
				console.error("Import was denied, the remote control will be disabled");
				this.onSyncIn = ()=>{};
				this.onSyncOut = ()=>{};
				this.onDisabled?.();
				this._skipEvent = true;
			}
		}
		else await this.instance.importJSON(data, options);

		this._skipEvent = false;
	}

	async onSyncIn(data){
		data = JSON.parse(data);
		if(data.w === 'skc') return data;

		let { ifaceList } = this.instance;

		if(data.w === 'c'){ // cable
			let {inp, out} = data;

			if(this.isSketch && data.t === 'c'){ // connect
				let inputPort = ifaceList[inp.i][inp.s][inp.n];
				let outputPort = ifaceList[out.i][out.s][out.n];

				this._skipEvent = true;

				if(data.ci !== -1){
					let cable = this.instance.scope('cables').list[data.ci];

					if(cable == null)
						throw new Error("Cable list was not synced");

					if(cable.source === 'input')
						outputPort.connectCable(cable);
					else inputPort.connectCable(cable);
				}
				else inputPort.connectPort(outputPort);

				this._skipEvent = false;
				return;
			}

			let portInput = ifaceList[inp.i][inp.s][inp.n];
			let portOutput = ifaceList[out.i][out.s][out.n];
			let cables = portInput.cables;

			let cable;
			for (var i = 0; i < cables.length; i++) {
				if(cables[i].output === portOutput){
					cable = cables[i];
					break;
				}
			}

			if(cable == null) return;

			if(data.t === 'f') // data flow
				cable.visualizeFlow();

			else if(data.t === 'd'){ // disconnect
				cable._evDisconnected = true;
				cable.disconnect();
			}
		}
		else if(data.w === 'nd'){ // node
			this._skipEvent = true;
			let iface = ifaceList[data.i];

			try {
				if(data.t === 's'){ // sync
					if(iface != null)
						throw new Error("Node list was not synced");

					iface.node.syncIn?.(data.d);
				}

				else if(data.t === 'c'){ // created
					if(iface != null)
						throw new Error("Node list was not synced");

					let newIface = this.instance.createNode(data.nm, data);

					if(ifaceList.indexOf(newIface) !== data.i)
						throw new Error("Node list was not synced");
				}

				else if(data.t === 'd'){ // deleted
					if(iface == null)
						throw new Error("Node list was not synced");

					this.instance.deleteNode(iface);
				}
			} finally {
				this._skipEvent = false;
			}
		}
		else if(data.w === 'ins'){ // instance
			if(data.t === 'ci'){
				this._skipEvent = true;
				await this.instance.importJSON(data.d);
				this._skipEvent = false;
			}
			else if(data.t === 'sml') // sync module list
				this._syncModuleList(data.d);
			else if(data.t === 'ajs') // ask json
				this._onSyncOut({w:'ins', t:'ci', d: this.instance.exportJSON()});
			else if(data.t === 'nidc'){ // node id changed
				this._skipEvent = true;
				let iface = ifaceList[data.i];

				try{
					if(iface == null)
						throw new Error("Node list was not synced");

					if(iface.id !== data.from)
						throw new Error("Old node id was different");

					let instance = this.instance;

					// This may need to be changed if the ID was being used for reactivity
					delete instance.iface[iface.id];
					instance.iface[data.to] = iface;
					iface.id = data.to;
				}
				finally {
					this._skipEvent = false;
				}
			}
		}

		if(data.w === 'err') console.error("RemoteError:", data.d);
	}
}

Blackprint.RemoteEngine = RemoteEngine;
Blackprint.RemoteControl = RemoteControl;