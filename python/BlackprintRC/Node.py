from threading import Timer

def BpSyncOut(this, id: str, data='', force=False):
	instance = this.instance.rootInstance or this.instance

	if(instance._remote == None or (not force and this._syncronizing) or instance.syncDataOut == False):
		return

	char = id[0]
	if(char == '_' or char == '$'):
		raise Exception("syncOut's ID can't be started with '_' or '$' character as it's assumed as a private field, but got: "+ id)

	if(this.syncThrottle != 0): # ToDo: make this timer more efficient
		if(this._syncWait == None): this._syncWait = {}
		this._syncWait[id] = data

		def timeout():
			if(this._syncHasWait):
				instance.emit('_node.sync', {
					'iface': this.iface,
					'data': clearPrivateField(this._syncWait)
				})

			this._syncWait = None
			this._syncHasWait = False

		if(this._syncHasWait): this._syncHasWait.cancel()
		t = this._syncHasWait = Timer(this.syncThrottle, timeout)
		t.start()
	else:
		instance.emit('_node.sync', {'iface': this.iface, 'data': clearPrivateField({ id: data })})

def clearPrivateField(obj):
	if(obj == None): return obj

	if(isinstance(obj, list)):
		temp = obj.copy()
		for i in range(len(temp)):
			ref = temp[i]

			if(isinstance(ref, dict)):
				temp[i] = clearPrivateField(ref)

		return temp

	temp = {}
	for key in obj:
		char = key[0]
		if(char == '_' or char == '$'):
			continue

		ref = obj[key]

		if(isinstance(ref, dict)):
			temp[key] = clearPrivateField(ref)
		else: temp[key] = ref

	return temp