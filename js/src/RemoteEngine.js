// Remote Control between Engine <-> Sketch
// Used by Engine to accept remote from the Sketch including send/receive data with the Sketch

// ToDo: port to PHP, Golang, and other programming languages
class RemoteEngine extends RemoteBase {
	constructor(instance){
		super(instance);

		Blackprint.settings('_remoteEngine', true);
		Blackprint.settings('visualizeFlow', true);

		let evCableDisconnect;
		instance.on('cable.disconnect', evCableDisconnect = ({ cable }) => {
			if(cable._evDisconnected || this._skipEvent) return;
			let fid = getFunctionId(cable.output.iface);
			let ifaceList = cable.owner.iface.node.instance.ifaceList;

			cable._evDisconnected = true;
			this._onSyncOut({
				w:'c',
				fid,
				inp:{i: ifaceList.indexOf(cable.input.iface), s: cable.input.source, n: cable.input.name},
				out:{i: ifaceList.indexOf(cable.output.iface), s: cable.output.source, n: cable.output.name},
				t:'d'
			});
		});

		let evExecPaused;
		instance.on('execution.paused', evExecPaused = ({ 
			afterNode,
			beforeNode,
			cable,
			cables,

			// 0 = execution order, 1 = route, 2 = trigger port, 3 = request
			// execution priority: 3, 2, 1, 0
			triggerSource,
		}) => {
			let _cable;
			if(cable != null){
				_cable = {};
				let { input, output } = cable;
				if(input != null) _cable.in = {name: input.name, i: input.iface.i};
				if(output != null) _cable.out = {name: output.name, i: output.iface.i};
			}

			this._onSyncOut({
				w:'ins',
				t:'exp',
				ts: triggerSource,
				an: afterNode?.iface.i,
				bn: beforeNode?.iface.i,
				cb: _cable,
				cbs: cables?.map(cable => {
					_cable = {};
					let { input, output } = cable;
					if(input != null) _cable.in = {name: input.name, i: input.iface.i};
					if(output != null) _cable.out = {name: output.name, i: output.iface.i};
					return _cable;
				}),
			});
		});

		let evFlowEvent;
		instance.on('_flowEvent', evFlowEvent = ({ cable }) => {
			if(this._skipEvent && !this._isImporting) return;
			let fid = getFunctionId(cable.output.iface);
			let ifaceList = cable.owner.iface.node.instance.ifaceList;

			this._onSyncOut({
				w:'c',
				fid,
				inp:{i: ifaceList.indexOf(cable.input.iface), s: cable.input.source, n: cable.input.name},
				out:{i: ifaceList.indexOf(cable.output.iface), s: cable.output.source, n: cable.output.name},
				t:'f'
			});
		});

		let evNodeSync;
		instance.on('_node.sync', evNodeSync = ev => { // internal node data sync
			// if(this._skipEvent && !this._isImporting) return;
			let fid = getFunctionId(ev.iface);
			let ifaceList = ev.iface.node.instance.ifaceList;
			this._onSyncOut({w:'nd', fid, i:ifaceList.indexOf(ev.iface), d: ev.data || null, t:'s'})
		});

		let evError;
		instance.on('error', evError = ev => {
			if(this._skipEvent) return;
			this._onSyncOut({w:'err', d: ev.data})
		});

		let evExecutionTerminated;
		instance.on('execution.terminated', evExecutionTerminated = ({ reason, iface }) => {
			if(this._skipEvent) return;
			this._onSyncOut({w:'execterm', reason: reason});
		});

		this.destroy = () => {
			instance.off('cable.disconnect', evCableDisconnect);
			instance.off('execution.paused', evExecPaused);
			instance.off('_flowEvent', evFlowEvent);
			instance.off('_node.sync', evNodeSync);
			instance.off('error', evError);
			instance.off('execution.terminated', evExecutionTerminated);

			this.onSyncIn = ()=>{};
			this.onSyncOut = ()=>{};
		}
	}

	async onSyncIn(data, _parsed){
		if(!_parsed)
			data = await super.onSyncIn(data);

		if(data == null) return;
		if(data.w === 'skc') return; // Skip any sketch event
		if(!_parsed && this._syncInWait != null && data.w !== 'ins' && data.t !== 'addrm'){
			return this._syncInWait.push(data);
		}

		let instance = this.instance;
		if(data.fid != null){
			instance = getDeepProperty(this.instance.functions, data.fid.split('/')).used[0]?.bpInstance;
			if(instance == null)
				return this._resync('FunctionNode');
		}

		let { ifaceList } = instance;

		if(data.w === 'c'){ // cable
			let {inp, out} = data;
			let ifaceInput = ifaceList[inp.i];
			let ifaceOutput = ifaceList[out.i];

			if(data.t === 'c'){ // connect
				this._skipEvent = true;
				let inputPort, outputPort;
				if(inp.s === 'route'){
					ifaceOutput.node.routes.routeTo(ifaceInput);
					this._skipEvent = false;
					return;
				}
				else{
					inputPort = ifaceInput[inp.s][inp.n];
					outputPort = ifaceOutput[out.s][out.n];
				}

				if(outputPort == null){
					if(ifaceOutput.namespace === "BP/Fn/Input")
						outputPort = ifaceOutput.createPort(inputPort);
					else if(ifaceOutput.namespace === "BP/Var/Get"){
						ifaceOutput.useType(inputPort);
						outputPort = ifaceOutput.output.Val;
					}
				}

				if(inputPort == null){
					if(ifaceInput.namespace === "BP/Fn/Output")
						inputPort = ifaceInput.createPort(outputPort);
					else if(ifaceInput.namespace === "BP/Var/Set"){
						ifaceInput.useType(outputPort);
						inputPort = ifaceInput.input.Val;
					}
				}

				inputPort.connectPort(outputPort);
				this._skipEvent = false;
				return;
			}

			let cables = ifaceInput[inp.s][inp.n].cables;
			let cable;
			for (var i = 0; i < cables.length; i++) {
				if(cables[i].output.iface === ifaceOutput){
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
			else console.log(`Unrecognized event: ${data.w} -> type: ${data.t}`)
		}
		else if(data.w === 'nd'){ // node
			let iface = ifaceList[data.i];

			if(data.t === 's'){ // sync
				if(iface == null)
					return; // Maybe when creating nodes it's trying to syncing data
					// return this._resync('Node');

				let node = iface.node;
				let temp = data.d;

				node._syncronizing = true;
				for(let key in temp)
					node.syncIn(key, temp[key]);

				node._syncronizing = false;
			}
			else if(data.t === 'c'){ // created
				if(iface != null) // The index mustn't be occupied by other iface
					return this._resync('Node');

				let namespace = data.nm;
				if(!namespace.startsWith("BPI/F/")){
					let clazz = Blackprint._utils.getDeepProperty(Blackprint.nodes, namespace.split('/'));
					if(clazz == null){
						this._syncInWait ??= [];
						await this._askRemoteModule(namespace);
					}
				}

				this._skipEvent = true;
				let newIface = instance.createNode(namespace, data);
				this._skipEvent = false;

				if(ifaceList.indexOf(newIface) !== data.i)
					return this._resync('Node');

				await this._syncInWaitContinue();
			}
			else if(data.t === 'd'){ // deleted
				if(iface == null) return this._resync('Node');
				instance.deleteNode(iface);
			}
			else if(data.t === 'fnrnp'){ // function rename node port
				iface.renamePort(data.wh, data.fnm, data.tnm);
			}
			else console.log(`Unrecognized event: ${data.w} -> type: ${data.t}`)
		}
		else if(data.w === 'ins'){ // instance
			if(data.t === 'exeen'){
				instance.executionOrder.stepMode = data.flag;
				this._onSyncOut({w:'ins', t:'exens', flag: data.flag});
			}
			else if(data.t === 'exps'){
				if(data.pause){
					this._onSyncOut({w:'ins', t:'exps', pause: true});
					instance.executionOrder.pause = true;
				}
				else {
					this._onSyncOut({w:'ins', t:'exps', pause: false});
					instance.executionOrder.pause = false;
					instance.executionOrder.next(true);
				}
			}
			else if(data.t === 'c'){ // clean nodes
				this._skipEvent = true;
				this.jsonTemp = null;
				this.jsonSyncTime = 0;
				instance.clearNodes();
				this._skipEvent = false;
			}
			else if(data.t === 'ci'){ // clean import
				this._skipEvent = true;

				this.jsonTemp = data.d;
				this.jsonSyncTime = Date.now();

				if(await this.onImport() === true){
					this._isImporting = true;
					this._skipEvent = true;
					this.emit('sketch.import', {data: data.d});
					await instance.importJSON(data.d);
					this.emit('sketch.imported', {data: data.d});
					this._isImporting = false;
				}

				this._skipEvent = false;
			}
			else if(data.t === 'ssk'){ // save sketch json
				this.jsonTemp = data.d;
				this.jsonSyncTime = Date.now();
			}
			else if(data.t === 'sfns'){ // sync function structure
				getDeepProperty(this.instance.functions, data.fid.split('/')).structure = data.d;
				// getDeepProperty(this.instance.functions, data.fid.split('/')).structure = JSON.parse(data.d);
			}
			else if(data.t === 'sml') // sync module list
				this._syncModuleList(data.d);
			else if(data.t === 'ajs') // ask json
				this._onSyncOut({w:'ins', t:'rajs', d: this.jsonTemp});
			else if(data.t === 'askrm'){
				let namespace = data.nm;
				let clazz = Blackprint._utils.getDeepProperty(Blackprint.nodes, namespace.split('/'));
				if(clazz == null) return; // This node dont have remote module
				this._onSyncOut({w:'ins', t:'addrm', d: clazz._scopeURL, nm: namespace});
			}
			else if(data.t === 'addrm')
				this._answeredRemoteModule(data.nm, data.d);
			else if(data.t === 'nidc'){ // node id changed
				this._skipEvent = true;
				let iface = ifaceList[data.i];
				if(iface == null) return this._resync("Node");

				try{
					if(iface == null)
						return this._resync('Node');

					if(iface.id !== data.f)
						throw new Error("Old node id was different");

					// This may need to be changed if the ID was being used for reactivity
					delete instance.iface[iface.id];
					instance.iface[data.to] = iface;
					iface.id = data.to;
				}
				finally {
					this._skipEvent = false;
				}
			}
			else if(data.t === 'jsonim'){
				this._skipEvent = true;
				await instance.importJSON(data.raw, {appendMode: data.app});
				this._skipEvent = false;
			}
			else if(data.t === 'pdc'){
				let iface = ifaceList[data.i];
				if(iface == null) return this._resync("Node");
				iface.input[data.k].default = data.v;

				let node = iface.node;
				node.update?.();
				node.routes.routeOut();
			}
			else if(data.t === 'prsc'){
				let iface = ifaceList[data.i];
				if(iface == null) return this._resync("Node");
				iface.output[data.k].allowResync = data.v;
			}
			else console.log(`Unrecognized event: ${data.w} -> type: ${data.t}`)
		}
	}
}

Blackprint.RemoteEngine = RemoteEngine;