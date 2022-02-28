Blackprint.Node.prototype.syncOut = function(id, data){
	if(this._instance._remote == null || this._syncronizing || this._instance.syncData === false)
		return;

	if(this.syncThrottle !== 0){
		if(this._syncWait != null){
			this._syncHasWait = true;
			this._syncWait[id] = data;
			return;
		}

		this._syncWait = {};
		setTimeout(()=> {
			if(this._syncHasWait)
				this._instance.emit('_node.sync', {iface: this.iface, data: this._syncWait});

			this._syncWait = null;
			this._syncHasWait = false;
		}, this.syncThrottle);
	}

	this._instance.emit('_node.sync', {iface: this.iface, data: {[id]: data}});
}