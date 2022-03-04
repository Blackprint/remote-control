class RemoteBase extends Blackprint.Engine.CustomEvent {
	// true  => allow
	// false => block
	async onImport(json){return false}
	async onModule(urls){return false}

	// "onSyncOut" function need to be replaced and the data need to be send to remote client
	onSyncOut(data){}
	_onSyncOut(data){ this.onSyncOut(JSON.stringify(data)) }

	constructor(instance){
		super();
		this.instance = instance;
		this._skipEvent = false;
		instance._remote = this;
	}

	async importRemoteJSON(){
		this._onSyncOut({w:'ins', t:'ajs'});
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

	disable(){
		if(this.disabled) return;

		let { onSyncIn, onSyncOut } = this;
		this.enable = () => {
			this.onSyncIn = onSyncIn;
			this.onSyncOut = onSyncOut;
			this.disabled = false;
			this._skipEvent = false;
			this.emit('enabled');
		}

		this.onSyncIn = ()=>{};
		this.onSyncOut = ()=>{};
		this.emit('disabled');
		this.disabled = true;
		this._skipEvent = true;
	}

	clearNodes(){
		this._skipEvent = true;
		this.instance.clearNodes();
		this._skipEvent = false;

		this._onSyncOut({w:'ins', t:'c'})
	}
}