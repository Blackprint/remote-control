// ToDo: port to PHP, Golang, and other programming languages
class RemoteEngine extends RemoteBase {
	constructor(instance){
		super(instance);

		let { ifaceList } = instance;
		Blackprint.settings('_remoteEngine', true);
		Blackprint.settings('visualizeFlow', true);

		let evCableDisconnect;
		instance.on('cable.disconnect', evCableDisconnect = ({ cable }) => {
			if(cable._evDisconnected || this._skipEvent) return;

			cable._evDisconnected = true;
			this._onSyncOut({
				w:'c',
				inp:{i: ifaceList.indexOf(cable.input.iface), s: cable.input.source, n: cable.input.name},
				out:{i: ifaceList.indexOf(cable.output.iface), s: cable.output.source, n: cable.output.name},
				t:'d'
			});
		});

		let evFlowEvent;
		instance.on('_flowEvent', evFlowEvent = cable => {
			if(this._skipEvent && !this._isImporting) return;
			this._onSyncOut({
				w:'c',
				inp:{i: ifaceList.indexOf(cable.input.iface), s: cable.input.source, n: cable.input.name},
				out:{i: ifaceList.indexOf(cable.output.iface), s: cable.output.source, n: cable.output.name},
				t:'f'
			});
		});

		let evNodeSync;
		instance.on('_node.sync', evNodeSync = ev => {
			if(this._skipEvent && !this._isImporting) return;
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
				this._skipEvent = true;
				cable._evDisconnected = true;
				cable.disconnect();
				this._skipEvent = false;
			}
		}
		else if(data.w === 'nd'){ // node
			let iface = ifaceList[data.i];

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

				let namespace = data.nm;
				let clazz = Blackprint._utils.deepProperty(Blackprint.nodes, namespace.split('/'));
				if(clazz == null)
					await this._askRemoteModule(namespace);

				this._skipEvent = true;
				let newIface = this.instance.createNode(namespace);
				this._skipEvent = false;

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
				this.jsonTemp = null;
				this.jsonSyncTime = 0;
				instance.clearNodes();
				this._skipEvent = false;
			}
			else if(data.t === 'ci'){ // clean import
				this._skipEvent = true;
				// instance.clearNodes();

				this.jsonTemp = data.d;
				this.jsonSyncTime = Date.now();

				if(await this.onImport() === true){
					this._isImporting = true;
					this._skipEvent = true;
					this.emit('sketch.import', {data: data.d});
					await instance.importJSON(data.d);
					this.emit('sketch.imported', {data: data.d});
					this._skipEvent = false;
					this._isImporting = false;
				}

				this._skipEvent = false;
			}
			else if(data.t === 'ssk'){ // save sketch json
				this.jsonTemp = data.d;
				this.jsonSyncTime = Date.now();
			}
			else if(data.t === 'sml') // sync module list
				this._syncModuleList(data.d);
			else if(data.t === 'ajs') // ask json
				this._onSyncOut({w:'ins', t:'ci', d: this.jsonTemp});
			else if(data.t === 'askrm'){
				let namespace = data.nm;
				let clazz = Blackprint._utils.deepProperty(Blackprint.nodes, namespace.split('/'));
				this._onSyncOut({w:'ins', t:'addrm', d: clazz._scopeURL, nm: namespace});
			}
			else if(data.t === 'addrm')
				this._answeredRemoteModule(data.nm, data.d);
			else if(data.t === 'nidc'){ // node id changed
				this._skipEvent = true;
				let iface = ifaceList[data.i];

				try{
					if(iface == null)
						throw new Error("Node list was not synced");

					if(iface.id !== data.f)
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
	}
}

Blackprint.RemoteEngine = RemoteEngine;