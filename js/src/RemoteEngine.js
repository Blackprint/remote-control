// ToDo: port to PHP, Golang, and other programming languages
class RemoteEngine extends RemoteBase {
	constructor(instance){
		super(instance);

		let { ifaceList } = instance;
		Blackprint.settings('_remoteEngine', true);

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
				this._skipEvent = true;
				cable._evDisconnected = true;
				cable.disconnect();
				this._skipEvent = false;
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

				this._skipEvent = true;
				let newIface = this.instance.createNode(data.nm);
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
				instance.clearNodes();
				this._skipEvent = false;
			}
			else if(data.t === 'ci'){ // clean import
				this._skipEvent = true;
				// instance.clearNodes();

				if(await this.onImport() === true){
					this._skipEvent = true;
					this.emit('sketch.import', {data: data.d});
					await instance.importJSON(data.d);
					this.emit('sketch.imported', {data: data.d});
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

Blackprint.RemoteEngine = RemoteEngine;