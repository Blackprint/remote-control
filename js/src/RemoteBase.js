// Used by Sketch and Engine as a base class for remoting or send/receive data

class RemoteBase extends Blackprint.Engine.CustomEvent {
	// true  => allow
	// false => block
	async onImport(json){return false}
	async onModule(urls){return false}

	// Can be use to stop syncing the instance to remote sketch/engine
	stopSync = false;

	// "onSyncOut" function need to be replaced and the data need to be send to remote client
	onSyncOut(data){}
	_onSyncOut(data){ this.onSyncOut(data) }
	// _onSyncOut(data){ this.onSyncOut(JSON.stringify(data)) }

	_resync(which){
		if(this.stopSync) return;
		this.stopSync = true;

		setTimeout(()=> {
			this.emit("need.sync", { unsynced: which });
			this._skipEvent = false;
		}, 1000);
	}

	constructor(instance){
		super();
		this.instance = instance;
		this._skipEvent = false;

		if(instance._remote == null)
			instance._remote = this;
		else {
			if(instance._remote.constructor === Array)
				instance._remote.push(this);
			else{
				instance._remote = [instance._remote, this];
				// instance._remote.importJSON = function(){
				// 	let ref = this;
				// 	for (var i = 0; i < ref.length; i++) {
				// 		let temp = ref[i];
				// 		if(temp.isSketch){
				// 			let func = temp.importJSON;
				// 			func.apply(temp, arguments);
				// 			break;
				// 		}
				// 	}
				// }
			}

			let ref = instance._remote;
			let sketchCount = 0;
			for (var i = 0; i < ref.length; i++) {
				if(ref[i].isSketch && ++sketchCount){
					ref.splice(i, 1);
					throw new Error("Can't use multiple remote sketch in one instance");
				}
			}
		}

		let evNodeCreatePending = this._evNodeCreatePending = new Map();
		let evNodeCreating;
		instance.on('node.creating', evNodeCreating = ({ namespace }) => {
			// if(this._skipEvent || this.stopSync) return;
			if(!evNodeCreatePending.has(namespace))
				evNodeCreatePending.set(namespace, []);
		});

		let evNodeSync;
		instance.on('_node.sync', evNodeSync = ev => { // internal node data sync
			// if(this._skipEvent || this.stopSync) return;
			let ifaceList = ev.iface.node.instance.ifaceList;
			let fid = getFunctionId(ev.iface);
			let evData = {w:'nd', t:'s', fid, i:ifaceList.indexOf(ev.iface), d: ev.data || null};

			let namespace = ev.iface.namespace;
			if(evNodeCreatePending.has(namespace))
				evNodeCreatePending.get(namespace).push(evData);
			else this._onSyncOut(evData);
		});

		let evNodeCreated;
		instance.on('node.created', evNodeCreated = ev => {
			let namespace = ev.iface.namespace;
			if(evNodeCreatePending.has(namespace)) {
				let list = evNodeCreatePending.get(namespace);
				evNodeCreatePending.delete(namespace);

				if(list.length === 0) return;
				setTimeout(() => {
					for (let i=0; i < list.length; i++) this._onSyncOut(list);
				}, 1);
			}
		});

		this._destroy1 = function(){
			instance.off('node.creating', evNodeCreating);
			instance.off('_node.sync', evNodeSync);
			instance.off('node.created', evNodeCreated);
		}
	}

	// ToDo: make custom library/CLI version to handle data relaying
	// so we can handle this request to be redirected to another remote sketch instance
	_RemoteJSON_Respond = null;
	_RemoteJSON_Reject = null;
	requestRemoteJSON(){
		this._RemoteJSON_Reject?.("Re-requesting JSON data from the remote instance");

		let that = this;
		return new Promise((resolve, reject) => {
			function cleanup(){
				that._RemoteJSON_Respond = null;
				that._RemoteJSON_Reject = null;
			}

			this._RemoteJSON_Respond = function(json){ cleanup(); resolve(json); }
			this._RemoteJSON_Reject = function(reason){ cleanup(); reject(reason); };
			this._onSyncOut({w:'ins', t:'ajs'});
		});
	}

	_sMLPending = false;
	syncModuleList(){
		if(this._sMLPending) return;
		this._sMLPending = true

		// Avoid burst sync when delete/add new module less than 2 seconds
		// And we need to wait until the module was deleted/added and get the latest list
		setTimeout(()=>{
		    this._sMLPending = false;

			this._onSyncOut({w:'ins', t:'sml', d: Blackprint._modulesURL.map(v=> v._url)});
		}, 2000);
	}

	async _syncModuleList(urls){
		this._skipEvent = true;

		if(await this.onModule(urls) === true){
			// Import from editor
			this._skipEvent = true;

			let oldList = Blackprint._modulesURL.map(v => v._url);
			let removed = [];

			for (var i = oldList.length - 1; i >= 0; i--) {
				var url = oldList[i];
				let index = urls.indexOf(url);

				// Remove module
				if(index === -1){
					Blackprint.deleteModuleFromURL(url);
					removed.push(url);
					continue;
				}

				// From from add list if already exist
				urls.splice(index, 1);
			}

			if(removed.length !== 0)
				this.emit('module.remove', {list: removed});

			if(urls.length !== 0){
				this.emit('module.add', {list: urls});
				await Blackprint.loadModuleFromURL(urls, {
					loadBrowserInterface: Blackprint.Sketch != null
				});

				// Check if the list has been updated, and find any module that was not added
				let oldList = Blackprint._modulesURL.map(v => v._url);
				let failed = [];
				for (var i = urls.length - 1; i >= 0; i--) {
					if(oldList.includes(urls[i]) === false){
						failed.push(urls[i]);
						urls.splice(i, 1);
					}
				}

				this.emit('module.added', {list: urls, failed});
			}

			this._skipEvent = true;
		}
		else {
			// Disable remote on blocked module sync
			console.error("Loaded module sync was denied, the remote control will be disabled");
			this.disable();
		}

		this._skipEvent = false;
	}

	async _syncInWaitContinue(){
		let temp = this._syncInWait;
		if(temp == null) return;

		for (let i=0; i < temp.length; i++) {
			let ref = temp.splice(i--, 1)[0];
			await this.onSyncIn(ref, true);
		}

		if(this._syncInWait.length === 0)
			this._syncInWait = null;
	}
	
	nodeSyncOut(node, id, data='', force=false){
		let instance = node.instance.rootInstance || node.instance;
		if(instance._remote == null || (!force && node._syncronizing) || instance.syncDataOut === false)
			return;

		if(id.toUpperCase == null)
			throw new Error("syncOut's ID must be a string, but got: "+ id);

		let char = id.slice(0, 1);
		if(char === '_' || char === '$'){
			throw new Error("syncOut's ID can't be started with '_' or '$' character as it's assumed as a private field, but got: "+ id);
		}

		if(node.syncThrottle !== 0){
			clearTimeout(node._syncHasWait);
			node._syncHasWait = setTimeout(() => {
				if(node._syncHasWait)
					instance.emit('_node.sync', {
						iface: node.iface,
						data: clearPrivateField(node._syncWait)
					});

				node._syncWait = null;
			}, node.syncThrottle);

			if(node._syncWait == null)
				node._syncWait = {};

			node._syncWait[id] = data;
		}
		else instance.emit('_node.sync', {iface: node.iface, data: clearPrivateField({ [id]: data })});
	}

	async onSyncIn(data){
		if(data.w === 'skc') return;

		// data = JSON.parse(data);
		// this.emit('_syncIn', data);

		let instance = this.instance;
		let bpFunctionInstance;
		if(data.fid != null){
			bpFunctionInstance = getDeepProperty(this.instance.functions, data.fid.split('/'));
			instance = bpFunctionInstance?.used[0]?.bpInstance;
			if(instance == null) return this._resync('FunctionNode');
		}

		let { ifaceList } = instance;

		if(data.w === 'p'){
			let iface = ifaceList[data.i];
			if(iface == null)
				return this._resync('Node');

			let port = iface[data.ps][data.n];

			this._skipEvent = true;
			if(data.t === 's') // split
				Blackprint.Port.StructOf.split(port);
			else if(data.t === 'uns') // unsplit
				Blackprint.Port.StructOf.unsplit(port);
			else{
				this._skipEvent = false;
				return data;
			}
			this._skipEvent = false;
		}
		else if(data.w === 'ins'){
			this._skipEvent = true;
			if(data.t === 'cvn'){ // create variable.new
				if(data.scp === Blackprint.VarScope.Public){
					this.instance.createVariable(data.id, {
						title: data.ti,
						description: data.dsc
					});
				}
				else {
					bpFunctionInstance.createVariable(data.id, {
						title: data.ti,
						description: data.dsc,
						scope: data.scp
					});
				}
			}
			else if(data.t === 'vrn'){ // variable.renamed
				if(data.scp === Blackprint.VarScope.Public){
					this.instance.renameVariable(data.old, data.now, data.scp);
				}
				else {
					bpFunctionInstance.renameVariable(data.old, data.now, data.scp);
				}
			}
			else if(data.t === 'vdl'){ // variable.deleted
				if(data.scp === Blackprint.VarScope.Public){
					this.instance.deleteVariable(data.id, data.scp);
				}
				else {
					bpFunctionInstance.deleteVariable(data.id, data.scp);
				}
			}

			else if(data.t === 'cfn'){ // create function.new
				this.instance.createFunction(data.id, {
					title: data.ti,
					description: data.dsc
				});
			}
			else if(data.t === 'frn'){ // function.renamed
				this.instance.renameFunction(data.old, data.now);
			}
			else if(data.t === 'fdl'){ // function.deleted
				this.instance.deleteFunction(data.id);
			}

			else if(data.t === 'cev'){ // create event.new
				this.instance.events.createEvent(data.nm);
			}
			else if(data.t === 'evrn'){ // event.renamed
				this.instance.events.renameEvent(data.old, data.now);
			}
			else if(data.t === 'evdl'){ // event.deleted
				this.instance.events.deleteEvent(data.nm);
			}

			else if(data.t === 'evfcr'){ // create event.field.new
				this.instance.events.list[data.nm].used[0].createField(data.name);
			}
			else if(data.t === 'evfrn'){ // event.field.renamed
				this.instance.events.list[data.nm].used[0].renameField(data.old, data.now);
			}
			else if(data.t === 'evfdl'){ // event.field.deleted
				this.instance.events.list[data.nm].used[0].deleteField(data.name);
			}
			else if(data.t === 'rajs'){
				if(this._RemoteJSON_Respond == null) return this._skipEvent = false; // This instance doesn't requesting the data

				if(data.d != null) this._RemoteJSON_Respond(data.d);
				else this._RemoteJSON_Reject(data.error ?? "Peer instance responsed with empty data");
			}
			else{
				this._skipEvent = false;
				return data;
			}
			this._skipEvent = false;
		}
		else {
			this._skipEvent = false;
			return data;
		}
	}

	destroy(){
		this.disable();
		this._destroy1();
		delete this.instance._remote;
	}
	disable(){
		if(this.disabled) return;

		let { onSyncIn, onSyncOut } = this;
		this.enable = () => {
			this.onSyncIn = onSyncIn;
			this.onSyncOut = onSyncOut;
			this.disabled = false;
			this.stopSync = false;
			this._skipEvent = false;
			this.emit('enabled');
		}

		this.onSyncIn = ()=>{};
		this.onSyncOut = ()=>{};
		this.emit('disabled');
		this.disabled = true;
		this.stopSync = true;
		this._skipEvent = true;
	}

	clearNodes(){
		this._skipEvent = true;
		this.instance.clearNodes();
		this._skipEvent = false;

		this._onSyncOut({w:'ins', t:'c'})
	}

	_pendingRemoteModule = {};
	async _answeredRemoteModule(namespace, url){
		if(!url)
			throw new Error("Can't obtain module URL from remote for: "+namespace);

		let temp = Blackprint._modulesURL.map(v => v._url);
		if(!temp.includes(url)){
			temp.push(url);

			try{
				await this._syncModuleList(temp);
			} catch(e){console.error(e)}
		}

		let obj = this._pendingRemoteModule[namespace];
		if(obj == null) return;
		setTimeout(()=> {
			obj.resolve();
			delete this._pendingRemoteModule[namespace];
		}, 100);
	}
	_askRemoteModule(namespace){
		let temp = this._pendingRemoteModule[namespace];
		if(temp == null){
			temp = this._pendingRemoteModule[namespace] = {};
			temp.promise = new Promise(resolve => temp.resolve = resolve);
		}

		this._onSyncOut({w:'ins', t:'askrm', nm: namespace});
		return temp.promise;
	}
}

function clearPrivateField(obj){
	if(obj == null) return obj;

	if(obj instanceof Array){
		let temp = obj.slice(0);
		for (var i = 0; i < temp.length; i++) {
			let ref = temp[i];

			if(typeof ref === 'object')
				temp[i] = clearPrivateField(ref);
		}

		return temp;
	}

	let temp = {};
	for(let key in obj){
		let char = key.slice(0, 1);
		if(char === '_' || char === '$')
			continue;

		let ref = obj[key];

		if(typeof ref === 'object')
			temp[key] = clearPrivateField(ref);
		else temp[key] = ref;
	}

	return temp;
}