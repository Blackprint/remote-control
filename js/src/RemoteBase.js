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

	async _syncModuleList(urls){
		this._skipEvent = true;

		if(await this.onModule(urls) === true){
			// Import from editor
			this._skipEvent = true;

			let oldList = Object.keys(Blackprint.modulesURL);
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

				urls.splice(index, 1);
			}

			if(removed.length !== 0)
				this.emit('module.remove', {list: removed});

			if(urls.length !== 0){
				console.log(`Adding ${urls.length} new module triggered by remote sync`);
				this.emit('module.add', {list: urls});
				Blackprint.loadModuleFromURL(urls, {
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
			this.emit('disabled');
			this._skipEvent = true;
		}

		this._skipEvent = false;
	}
}