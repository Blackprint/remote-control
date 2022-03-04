// Will be extended by RemoteSketch
class RemoteControl extends RemoteBase {
	constructor(instance){
		super(instance);
		this.isSketch = false;

		Blackprint.settings('_remoteSketch', true);
		let { ifaceList } = instance;

		let evCableConnect;
		instance.on('cable.connect', evCableConnect = ({ cable }) => {
			if(this._skipEvent) return;
			let ci = this.isSketch ? instance.scope('cables').list.indexOf(cable) : -1;

			this.saveSketchToRemote();
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

			cable._evDisconnected = true;
			this.saveSketchToRemote();
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
			this.saveSketchToRemote();

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
			this.saveSketchToRemote();
			this._onSyncOut({w:'nd', i:ifaceList.indexOf(ev.iface), t:'d'})
		});

		let evNodeSync;
		instance.on('_node.sync', evNodeSync = ev => {
			if(this._skipEvent) return;
			this.saveSketchToRemote();
			this._onSyncOut({w:'nd', i:ifaceList.indexOf(ev.iface), d: ev.data, t:'s'});
		});

		let evModuleDelete;
		Blackprint.on('moduleDelete', evModuleDelete = ev => {
			if(this._skipEvent) return;
			this.syncModuleList();
		});

		let nodeIDChanged;
		instance.on('node.id.changed', nodeIDChanged = ({ iface, from, to }) => {
			if(this._skipEvent) return;
			this.saveSketchToRemote();

			let i = ifaceList.indexOf(iface);
			this._onSyncOut({w:'ins', t:'nidc', i, f:from, to:to});
		});


		this.destroy = () => {
			instance.off('cable.connect', evCableConnect);
			instance.off('cable.disconnect', evCableDisconnect);
			instance.off('node.created', evNodeCreated);
			instance.off('node.delete', evNodeDelete);
			instance.off('_node.sync', evNodeSync);
			instance.off('node.id.changed', nodeIDChanged);
			Blackprint.off('moduleDelete', evModuleDelete);

			this.onSyncIn = ()=>{};
			this.onSyncOut = ()=>{};
		}
	}

	async sendSketchToRemote(){
		this._onSyncOut({w:'ins', t:'ci', d: this.instance.exportJSON()});
	}

	_saveSketchToRemote;
	saveWhenIdle = 60e3;
	async saveSketchToRemote(instant){
		clearTimeout(this._saveSketchToRemote);

		this.emit('remote-save.reset.time');
		this._saveSketchToRemote = setTimeout(()=> {
			this.emit('remote-save.begin');
			this._onSyncOut({w:'ins', t:'ssk', d: this.instance.exportJSON()});
		}, this.saveWhenIdle);
	}

	async importJSON(data, options, noSync, force){
		this._skipEvent = true;
		if(!noSync) this._onSyncOut({w:'ins', t:'ci', d:data});

		this.emit('sketch.import', {data});
		if(!force){
			if(await this.onImport(data) === true)
				await this.instance.importJSON(data, options);
			else {
				// Disable remote on blocked instance's nodes/cable sync
				this.emit('sketch.import.cancel', {data});
				console.error("Import was denied, the remote control will be disabled");
				this.disable();
			}
		}
		else await this.instance.importJSON(data, options);
		this.emit('sketch.imported', {data});

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

			if(data.t === 'f'){ // data flow
				this._skipEvent = true;
				cable.visualizeFlow();
				this._skipEvent = false;
			}

			else if(data.t === 'd'){ // disconnect
				this._skipEvent = true;
				cable._evDisconnected = true;
				cable.disconnect();
				this._skipEvent = false;
			}
		}
		else if(data.w === 'nd'){ // node
			this._skipEvent = true;
			let iface = ifaceList[data.i];

			try {
				if(data.t === 's'){ // sync
					if(iface == null)
						return; // Maybe when creating nodes it's trying to syncing data
						// throw new Error("Node list was not synced");

					let node = iface.node;
					let temp = data.d;

					node._syncronizing = true;
					for(let key in temp)
						node.syncIn(key, temp[key]);

					node._syncronizing = false;
				}

				else if(data.t === 'c'){ // created
					if(iface != null) // The index mustn't be occupied by other iface
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

				if(data.d != null)
					await this.instance.importJSON(data.d);
				else
					this.emit('empty.json.import');

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

Blackprint.RemoteControl = RemoteControl;