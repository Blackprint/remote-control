// ToDo:
// - sync Interface ID

class RemoteEngineServer {
	constructor(instance){
		this.instance = instance;
		this._skipEvent = false;
		let { ifaceList } = instance;

		Blackprint.settings('_remoteEngine', true);

		instance.on('cable.disconnect', ({ cable }) =>{
			if(cable._evDisconnected || this._skipEvent) return;
			this._onSyncOut({
				w:'c',
				inp:{i: ifaceList.indexOf(cable.input.iface), s: cable.input.source, n: cable.input.name},
				out:{i: ifaceList.indexOf(cable.output.iface), s: cable.output.source, n: cable.output.name},
				t:'d'
			});
		});

		instance.on('_flowEvent',  cable => {
			if(this._skipEvent) return;
			this._onSyncOut({
				w:'c',
				inp:{i: ifaceList.indexOf(cable.input.iface), s: cable.input.source, n: cable.input.name},
				out:{i: ifaceList.indexOf(cable.output.iface), s: cable.output.source, n: cable.output.name},
				t:'f'
			});
		});
		instance.on('_node.sync', ev => {
			if(this._skipEvent) return;
			this._onSyncOut({w:'nd', i:ifaceList.indexOf(ev.iface), d: ev.data, t:'s'})
		});
		instance.on('error', ev => {
			if(this._skipEvent) return;
			this._onSyncOut({w:'err', d: ev.data})
		});

		// instance.on('cable.connecting', cable => {});
		// instance.on('cable.cancel', cable => {});
		// instance.on('port.output.call', cable => {});
		// instance.on('port.output.value', cable => {});
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
			if(data.t === 'c'){ // clean nodes
				this._skipEvent = true;
				this.instance.clearNodes();
				this._skipEvent = false;
			}
			else if(data.t === 'ci'){ // clean import
				this._skipEvent = true;
				// this.instance.clearNodes();
				await this.instance.importJSON(data.d);
				this._skipEvent = false;
			}
		}
	}

	// "onSyncOut" function need to be replaced and the data need to be send to remote client
	onSyncOut(data){}
	_onSyncOut(data){ this.onSyncOut(JSON.stringify(data)) }
}

// For Blackprint.Sketch
class RemoteEngineClient {
	constructor(instance){
		this.instance = instance;
		this._skipEvent = false;
		this.isSketch = false;
		let { ifaceList } = instance;

		instance.on('cable.connect', ({ cable }) => {
			if(this._skipEvent) return;
			this._onSyncOut({
				w:'c',
				inp:{i: ifaceList.indexOf(cable.input.iface), s: cable.input.source, n: cable.input.name},
				out:{i: ifaceList.indexOf(cable.output.iface), s: cable.output.source, n: cable.output.name},
				t:'c'
			});
		});
		instance.on('cable.disconnect', ({ cable }) => {
			if(cable._evDisconnected || this._skipEvent) return;
			this._onSyncOut({
				w:'c',
				inp:{i: ifaceList.indexOf(cable.input.iface), s: cable.input.source, n: cable.input.name},
				out:{i: ifaceList.indexOf(cable.output.iface), s: cable.output.source, n: cable.output.name},
				t:'d'
			});
		});

		instance.on('node.created', ev => {
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
		instance.on('node.deleted', ev => {
			if(this._skipEvent) return;
			this._onSyncOut({w:'nd', i:ifaceList.indexOf(ev.iface), t:'d'})
		});
		instance.on('_node.sync', ev => {
			if(this._skipEvent) return;

			if(this.isSketch){
				this._onSyncOut({w:'nd', i:ifaceList.indexOf(ev.iface), d: ev.data, t:'s',
					x: ev.iface.x,
					y: ev.iface.y,
				});
			}
			else this._onSyncOut({w:'nd', i:ifaceList.indexOf(ev.iface), d: ev.data, t:'s'});
		});
	}

	clearNodes(){
		this._skipEvent = true;
		this.instance.clearNodes();
		this._skipEvent = false;

		this._onSyncOut({w:'ins', t:'c'})
	}

	async importJSON(data){
		this._skipEvent = true;
		await this.instance.importJSON(data);
		this._skipEvent = false;

		this._onSyncOut({w:'ins', t:'ci', d:data});
	}

	onSyncIn(data){
		data = JSON.parse(data);
		if(data.w === 'skc') return data;

		let { ifaceList } = this.instance;

		if(data.w === 'c'){ // cable
			let {inp, out} = data;

			if(this.isSketch && data.t === 'c'){ // connect
				let inputPort = ifaceList[inp.i][inp.s][inp.n];
				let outputPort = ifaceList[out.i][out.s][out.n];

				this._skipEvent = true;
				inputPort.connectPort(outputPort);
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

		if(data.w === 'err') console.error("RemoteError:", data.d);
	}

	// "onSyncOut" function need to be replaced and the data need to be send to remote client
	onSyncOut(data){}
	_onSyncOut(data){ this.onSyncOut(JSON.stringify(data)) }
}

Blackprint.RemoteEngineServer = RemoteEngineServer;
Blackprint.RemoteEngineClient = RemoteEngineClient;