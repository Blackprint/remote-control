Blackprint.Node.prototype.syncOut = function(id, data){
	if(this.instance._remote == null || this._syncronizing || this.instance.syncDataOut === false)
		return;

	if(id.constructor !== String)
		throw new Error("syncOut's ID must be a string, but got: "+ id);

	let char = id.slice(0, 1);
	if(char === '_' || char === '$'){
		throw new Error("syncOut's ID can't be started with '_' or '$' character as it's assumed as a private field, but got: "+ id);
	}

	if(this.syncThrottle !== 0){
		if(this._syncWait != null){
			this._syncHasWait = true;
			this._syncWait[id] = data;
			return;
		}

		this._syncWait = {};
		setTimeout(()=> {
			if(this._syncHasWait)
				this.instance.emit('_node.sync', {
					iface: this.iface,
					data: clearPrivateField(this._syncWait)
				});

			this._syncWait = null;
			this._syncHasWait = false;
		}, this.syncThrottle);
	}

	this.instance.emit('_node.sync', {iface: this.iface, data: clearPrivateField({ [id]: data })});
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