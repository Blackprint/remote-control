// Remote Control between Sketch <-> Engine
// Used by Sketch to remoting the Engine including send/receive data with the Engine
// This will also be used for syncing between other Sketch remotely

// Will be extended by RemoteSketch
class RemoteControl extends RemoteBase {
	constructor(instance){
		super(instance);
		this.isSketch = false;

		Blackprint.settings('_remoteSketch', true);
		let { ifaceList } = instance;

		let evJsonImporting;
		instance.on('json.importing', evJsonImporting = ({ appendMode, raw }) => {
			if(this._skipEvent || this.stopSync) return;
			this._skipEvent = true;

			this._onSyncOut({
				w:'ins',
				t:'jsonim',
				app: appendMode,
				raw,
			});
		});

		let evJsonImported;
		instance.on('json.imported', evJsonImported = ({ appendMode, raw }) => {
			this._skipEvent = false;
			if(this._skipEvent || this.stopSync) return;
		});

		let evCableConnect;
		instance.on('cable.connect', evCableConnect = ({ cable }) => {
			if(this._skipEvent || this.stopSync) return;
			let ci = this.isSketch ? instance.scope('cables').list.indexOf(cable) : -1;
			let iER = cable.isRoute; // isEdgeRoute
			let fid = getFunctionId(cable.output.iface);
			let ifaceList = cable.owner.iface.node.instance.ifaceList;

			this.saveSketchToRemote();
			this._onSyncOut({
				w:'c',
				ci,
				fid,
				inp:{i: ifaceList.indexOf(cable.input.iface), s: iER ? 'route' : cable.input.source, n: cable.input.name || ''},
				out:{i: ifaceList.indexOf(cable.output.iface), s: iER ? 'route' : cable.output.source, n: cable.output.name || ''},
				t:'c'
			});
		});

		let evCableDisconnect;
		instance.on('cable.disconnect', evCableDisconnect = ({ cable }) => {
			if(cable._evDisconnected || this._skipEvent || this.stopSync) return;
			let ci = this.isSketch ? instance.scope('cables').list.indexOf(cable) : -1;
			let fid = getFunctionId(cable.output.iface);
			let ifaceList = cable.owner.iface.node.instance.ifaceList;

			cable._evDisconnected = true;
			this.saveSketchToRemote();
			this._onSyncOut({
				w:'c',
				ci,
				fid,
				inp:{i: ifaceList.indexOf(cable.input.iface), s: cable.input.source, n: cable.input.name},
				out:{i: ifaceList.indexOf(cable.output.iface), s: cable.output.source, n: cable.output.name},
				t:'d'
			});
		});

		let evNodeCreated;
		instance.on('node.created', evNodeCreated = ev => {
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			let fid = getFunctionId(ev.iface);
			let ifaceList = ev.iface.node.instance.ifaceList;
			let namespace = ev.iface.namespace;

			let exportedIface = instance.exportJSON({
				ifaceList: [ev.iface],
				environment: false,
				module: false,
				exportFunctions: false,
				exportVariables: false,
				exportEvents: false,
				toRawObject: true,
			}).instance[namespace][0];

			if(this.isSketch){
				instance.scope('nodes').deselectAll();
				instance.scope('cables').deselectAll();

				this._onSyncOut({w:'nd', i:ifaceList.indexOf(ev.iface), t:'c',
					data: exportedIface.data,
					fid,
					nm: namespace,
					x: ev.iface.x,
					y: ev.iface.y,
				});
			}
			else this._onSyncOut({w:'nd', i:ifaceList.indexOf(ev.iface), t:'c',
				data: exportedIface.data,
				fid,
				nm: namespace,
			});
		});

		let evNodeDelete;
		instance.on('node.delete', evNodeDelete = ev => {
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			let ifaceList = ev.iface.node.instance.ifaceList;

			let fid = getFunctionId(ev.iface);
			this._onSyncOut({w:'nd', fid, i:ifaceList.indexOf(ev.iface), t:'d'})
		});

		let evModuleDelete;
		Blackprint.on('module.delete', evModuleDelete = ev => {
			if(this._skipEvent || this.stopSync) return;
			this.syncModuleList();
		});

		let nodeIDChanged;
		instance.on('node.id.changed', nodeIDChanged = ({ iface, old, now }) => {
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			let ifaceList = iface.node.instance.ifaceList;

			let i = ifaceList.indexOf(iface);
			let fid = getFunctionId(iface);
			this._onSyncOut({w:'ins', t:'nidc', fid, i, f:old, to: now});
		});

		let portSplit;
		instance.on('_port.split', portSplit = ({ port }) => {
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			let ifaceList = port.iface.node.instance.ifaceList;
			let i = ifaceList.indexOf(port.iface);
			let fid = getFunctionId(port.iface);
			this._onSyncOut({w:'p', t:'s', fid, i, ps: port.source, n: port.name});
		});

		let portUnsplit;
		instance.on('_port.unsplit', portUnsplit = ({ port }) => {
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			let ifaceList = port.iface.node.instance.ifaceList;
			let i = ifaceList.indexOf(port.iface);
			let fid = getFunctionId(port.iface);
			this._onSyncOut({w:'p', t:'uns', fid, i, ps: port.source, n: port.name});
		});

		let portDefaultChanged;
		instance.on('port.default.changed', portDefaultChanged = ({ port }) => {
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			let ifaceList = port.iface.node.instance.ifaceList;
			let i = ifaceList.indexOf(port.iface);
			let fid = getFunctionId(port.iface);
			this._onSyncOut({w:'ins', t:'pdc', fid, i, k: port.name, v: port.default});
		});

		let portResyncAllow;
		instance.on('_port.resync.allow', portResyncAllow = ({ port }) => {
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			let ifaceList = port.iface.node.instance.ifaceList;
			let i = ifaceList.indexOf(port.iface);
			let fid = getFunctionId(port.iface);
			this._onSyncOut({w:'ins', t:'prsc', fid, i, k: port.name, v: true});
		});

		let portResyncDisallow;
		instance.on('_port.resync.disallow', portResyncDisallow = ({ port }) => {
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			let ifaceList = port.iface.node.instance.ifaceList;
			let i = ifaceList.indexOf(port.iface);
			let fid = getFunctionId(port.iface);
			this._onSyncOut({w:'ins', t:'prsc', fid, i, k: port.name, v: false});
		});

		let fnRenamePort;
		instance.on('_fn.rename.port', fnRenamePort = ({ iface, which, fromName, toName }) => {
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			let ifaceList = iface.node.instance.ifaceList;
			let fid = getFunctionId(iface);
			let i = ifaceList.indexOf(iface);
			this._onSyncOut({w:'nd', t:'fnrnp', i, fid, wh: which, fnm: fromName, tnm: toName});
		});

		let insVariableNew;
		instance.on('variable.new', insVariableNew = (ev) => { // ref = BPVariable
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			let ref = ev.reference;
			let bpFunction = ev.bpFunction || ev.reference.bpFunction;
			if(bpFunction != null){
				let funcId = bpFunction.id;
				this._onSyncOut({w:'ins', t:'cvn', id: ev.id, ti: ref?.title, scp: ev.scope, fid: funcId});
				return;
			}
			this._onSyncOut({w:'ins', t:'cvn', id: ev.id, ti: ref?.title, scp: ev.scope});
		});

		let varRenamed;
		instance.on('variable.renamed', varRenamed = (ev) => { // ref = BPVariable
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			let bpFunction = ev.bpFunction || ev.reference.bpFunction;
			if(bpFunction != null){
				let funcId = bpFunction.id;
				this._onSyncOut({w:'ins', t:'vrn', id: ev.id, old: ev.old, now: ev.now, scp: ev.scope, fid: funcId});
				return;
			}
			this._onSyncOut({w:'ins', t:'vrn', id: ev.id, old: ev.old, now: ev.now, scp: ev.scope});
		});

		let varDeleted;
		instance.on('variable.deleted', varDeleted = (ev) => { // ref = BPVariable
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			let bpFunction = ev.bpFunction || ev.reference.bpFunction;
			if(bpFunction != null){
				let funcId = bpFunction.id;
				this._onSyncOut({w:'ins', t:'vdl', id: ev.id, scp: ev.scope, fid: funcId});
				return;
			}
			this._onSyncOut({w:'ins', t:'vdl', id: ev.id, scp: ev.scope});
		});

		let insFunctionNew;
		instance.on('function.new', insFunctionNew = ({ reference: ref }) => { // ref = BPFunction
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			this._onSyncOut({w:'ins', t:'cfn', id: ref.id, ti: ref.title, dsc: ref.description});
		});

		let funcRenamed;
		instance.on('function.renamed', funcRenamed = (ev) => { // ref = BPFunction
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			this._onSyncOut({w:'ins', t:'frn', old: ev.old, now: ev.now});
		});

		let funcDeleted;
		instance.on('function.deleted', funcDeleted = (ev) => { // ref = BPFunction
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			this._onSyncOut({w:'ins', t:'fdl', id: ev.id});
		});

		let eventCreated;
		instance.on('event.created', eventCreated = (ev) => {
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			this._onSyncOut({w:'ins', t:'cev', nm: ev.reference.namespace});
		});

		let eventRenamed;
		instance.on('event.renamed', eventRenamed = (ev) => {
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			this._onSyncOut({w:'ins', t:'evrn', old: ev.old, now: ev.now});
		});

		let eventDeleted;
		instance.on('event.deleted', eventDeleted = (ev) => {
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			this._onSyncOut({w:'ins', t:'evdl', id: ev.reference.id});
		});

		let eventFieldCreated;
		instance.on('event.field.created', eventFieldCreated = (ev) => {
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			this._onSyncOut({w:'ins', t:'evfcr', nm: ev.namespace, name: ev.name});
		});

		let eventFieldRenamed;
		instance.on('event.field.renamed', eventFieldRenamed = (ev) => {
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			this._onSyncOut({w:'ins', t:'evfrn', nm: ev.namespace, old: ev.old, now: ev.now});
		});

		let eventFieldDeleted;
		instance.on('event.field.deleted', eventFieldDeleted = (ev) => {
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			this._onSyncOut({w:'ins', t:'evfdl', nm: ev.namespace, name: ev.name});
		});

		let envAdded;
		Blackprint.on('environment.added', envAdded = (ev) => {
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			this._onSyncOut({w:'ins', t:'envadd', key: ev.key});
		});

		let envRenamed;
		Blackprint.on('environment.renamed', envRenamed = (ev) => {
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			this._onSyncOut({w:'ins', t:'envrn', old: ev.old, now: ev.now});
		});

		let envDeleted;
		Blackprint.on('environment.deleted', envDeleted = (ev) => {
			if(this._skipEvent || this.stopSync) return;
			this.saveSketchToRemote();
			this._onSyncOut({w:'ins', t:'envdl', key: ev.key});
		});

		// ToDo: change below to `_fn.structure.update` after the engine was updated
		let saveFnStructureChanges, saveFnStructureChangesDebounce;
		instance.on('cable.connect cable.disconnect node.created node.delete node.move node.id.changed port.default.changed _port.split _port.unsplit _port.resync.allow _port.resync.disallow', saveFnStructureChanges = (ev) => {
			let bpFunction = ev.port?.iface.node.instance.parentInterface?.bpFunction;
			if(bpFunction == null) bpFunction = ev.iface?.node.instance.parentInterface?.bpFunction;
			if(bpFunction == null) bpFunction = ev.cable?.owner.iface.node.instance.parentInterface?.bpFunction;
			if(bpFunction == null) return;

			clearTimeout(saveFnStructureChangesDebounce);
			saveFnStructureChangesDebounce = setTimeout(() => {
				this._onSyncOut({
					w:'ins',
					t:'sfns',
					fid: bpFunction.id,
					d: getDeepProperty(instance.functions, bpFunction.id.split('/')).structure,
				});
			}, 1500);
		});

		this.destroy = () => {
			instance.off('json.importing', evJsonImporting);
			instance.off('json.imported', evJsonImported);
			instance.off('cable.connect', evCableConnect);
			instance.off('cable.disconnect', evCableDisconnect);
			instance.off('node.created', evNodeCreated);
			instance.off('node.delete', evNodeDelete);
			instance.off('_node.sync', evNodeSync);
			instance.off('node.id.changed', nodeIDChanged);
			instance.off('_port.split', portSplit);
			instance.off('_port.unsplit', portUnsplit);
			instance.off('port.default.changed', portDefaultChanged);
			instance.off('_port.resync.allow', portResyncAllow);
			instance.off('_port.resync.disallow', portResyncDisallow);
			instance.off('_fn.rename.port', fnRenamePort);
			instance.off('variable.new', insVariableNew);
			instance.off('variable.renamed', varRenamed);
			instance.off('variable.deleted', varDeleted);
			instance.off('function.new', insFunctionNew);
			instance.off('function.renamed', funcRenamed);
			instance.off('function.deleted', funcDeleted);
			instance.off('event.created', eventCreated);
			instance.off('event.renamed', eventRenamed);
			instance.off('event.deleted', eventDeleted);
			instance.off('event.field.created', eventFieldCreated);
			instance.off('event.field.renamed', eventFieldRenamed);
			instance.off('event.field.deleted', eventFieldDeleted);
			Blackprint.off('moduleDelete', evModuleDelete);
			Blackprint.off('environment.added', envAdded);
			Blackprint.off('environment.renamed', envRenamed);
			Blackprint.off('environment.deleted', envDeleted);
			instance.off('cable.connect cable.disconnect node.created node.delete node.move node.id.changed port.default.changed _port.split _port.unsplit _port.resync.allow _port.resync.disallow', saveFnStructureChanges);

			this.onSyncIn = ()=>{};
			this.onSyncOut = ()=>{};
			super.destroy();
		}
	}

	async sendSketchToRemote(){
		this._onSyncOut({w:'ins', t:'ci', d: this.instance.exportJSON({
			toRawObject: true,
			environment: false
		})});
	}

	_saveSketchToRemote;
	saveWhenIdle = 60e3;
	async saveSketchToRemote(instant){
		clearTimeout(this._saveSketchToRemote);

		this.emit('remote-save.reset.time');
		this._saveSketchToRemote = setTimeout(()=> {
			this.emit('remote-save.begin');
			this._onSyncOut({w:'ins', t:'ssk', d: this.instance.exportJSON({
				toRawObject: true,
				environment: false
			})});
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
		if(data.w === 'skc') {
			if(data.t === 'puppetnode.reload'){
				this._onSyncOut({w:'ins', t:'puppetnode.ask'});
				return;
			}

			if(data.t === 'puppetnode.list'){
				Blackprint.PuppetNode.setRegisteredNodes(data.d);
				Blackprint.emit('bp_editorNodeAvailability');
				return;
			}

			return data;
		}

		data = await super.onSyncIn(data);
		if(data == null) return;

		let instance = this.instance;
		let bpFunctionInstance;
		if(data.fid != null){
			bpFunctionInstance = getDeepProperty(this.instance.functions, data.fid.split('/'));
			instance = bpFunctionInstance?.used[0]?.bpInstance;
			if(instance == null) return this._resync('FunctionNode');
		}

		let { ifaceList } = instance;

		if(data.w === 'c'){ // cable
			let {inp, out} = data;

			if(this.isSketch && data.t === 'c'){ // connect
				let inputPort, outputPort;
				let ifaceInput = ifaceList[inp.i];
				let ifaceOutput = ifaceList[out.i];
				if(inp.s === 'route'){
					inputPort = ifaceInput.node.routes;
					outputPort = ifaceOutput.node.routes;
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

				this._skipEvent = true;

				if(data.ci !== -1){
					let cable = instance.scope('cables').list[data.ci];

					if(cable == null)
						return this._resync('Cable');

					if(cable.source === 'input')
						outputPort.connectCable(cable);
					else inputPort.connectCable(cable);
				}
				else{
					if(outputPort) // if function input
					inputPort.connectPort(outputPort);
				}

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
					// Maybe when creating nodes it's trying to syncing data
					if(iface == null) return this._resync('Node');

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
						if(clazz == null)
							await this._askRemoteModule(namespace);
					}

					let newIface = instance.createNode(data.nm, data);
					if(ifaceList.indexOf(newIface) !== data.i)
						return this._resync('Node');
				}
				else if(data.t === 'd'){ // deleted
					if(iface == null)
						return this._resync('Node');

					instance.deleteNode(iface);
				}
				else if(data.t === 'fnrnp'){ // function rename node port
					iface.renamePort(data.wh, data.fnm, data.tnm);
				}
			} finally {
				this._skipEvent = false;
			}
		}
		else if(data.w === 'ins'){ // instance
			if(data.t === 'exens'){ // execution order enabled status
				this.emit('stepmode.enabled', data); // data.flag
			}
			else if(data.t === 'exps'){ // execution order paused status
				this.emit('stepmode.paused', data); // data.pause
			}
			else if(data.t === 'exp'){ // execution order paused status
				this.emit('stepmode.status', {
					triggerSource: data.ts,
					afterNode: data.an,
					beforeNode: data.bn,
					cable: data.cb,
					cables: data.cbs,
				});
			}
			else if(data.t === 'ci'){
				this._skipEvent = true;

				if(await this.onImport() === true){
					this._isImporting = true;

					if(data.d != null) this.emit('empty.json.import');
					else {
						let isEmptyInstance = true;
						for (let key in data.d.instance) {
							isEmptyInstance = false;
							break;
						}

						if(!isEmptyInstance){
							instance.clearNodes();
							await instance.importJSON(data.d);
						}
						else this.emit('empty.json.import');
					}
					this._isImporting = false;
				}

				this._skipEvent = false;
			}
			else if(data.t === 'sml') // sync module list
				this._syncModuleList(data.d);
			else if(data.t === 'ajs') // ask json
				this._onSyncOut({w:'ins', t:'rajs', d: instance.exportJSON({
					toRawObject: true,
					environment: false
				})});
			else if(data.t === 'askrm'){
				let namespace = data.nm;
				let clazz = Blackprint._utils.getDeepProperty(Blackprint.nodes, namespace.split('/'));
				if(clazz == null) return; // This node dont have remote module
				this._onSyncOut({w:'ins', t:'addrm', d: clazz._scopeURL, nm: namespace});
			}
			else if(data.t === 'askfns'){ // ask function structure
				this._onSyncOut({w:'ins', t:'sfns', fid: data.fid, d: bpFunctionInstance.structure});
			}
			else if(data.t === 'addrm')
				this._answeredRemoteModule(data.nm, data.d);
			else if(data.t === 'nidc'){ // node id changed
				this._skipEvent = true;
				let iface = ifaceList[data.i];

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
				let port = iface.input[data.k];
				port.default = data.v;

				if(port._boxInput != null)
					port._boxInput.value = data.v;

				let node = iface.node;
				node.update?.();
				node.routes.routeOut();
			}
			else if(data.t === 'prsc'){
				let iface = ifaceList[data.i];
				iface.output[data.k].allowResync = data.v;
			}
		}

		if(data.w === 'err') console.error("RemoteError:", data.d);
		if(data.w === 'execterm') {
			console.error("RemoteError:", data.reason);
			instance._emit('execution.terminated', {reason: data.reason});
		}
	}

	// For controlling remote engine's execution order
	enableStepMode(flag=true){
		this._onSyncOut({
			w:'ins',
			t:'exeen',
			flag,
		});
	}
	pauseExecution(pause=true){
		this._onSyncOut({
			w:'ins',
			t:'exps',
			pause,
		});
	}
}

Blackprint.RemoteControl = RemoteControl;