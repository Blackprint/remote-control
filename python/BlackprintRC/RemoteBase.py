import Blackprint
from .Node import BpSyncOut

class RemoteBase(Blackprint.CustomEvent):
	# True  => allow
	# False => block
	def onImport(this, json): return False
	def onModule(this, urls): return False
	disabled = False

	# "onSyncOut" function need to be replaced and the data need to be send to remote client
	def onSyncOut(this, data): 1
	def _onSyncOut(this, data): this.onSyncOut(data)
	# _onSyncOut(this, data): this.onSyncOut(JSON.stringify(data))

	__resync = False
	def _resync(this, which):
		if(which): print(which + " list was not synced")
		if(this.__resync): return
		this.__resync = True
		print("Blackprint: Resyncing diagrams")
		this.importRemoteJSON()
		this.__resync = False

	def __init__(this, instance):
		Blackprint.CustomEvent.__init__(this)
		this.instance = instance
		this._skipEvent = False

		if(instance._remote == None):
			instance._remote = this
		else:
			if(isinstance(instance._remote, list)):
				instance._remote.append(this)
			else:
				instance._remote = [instance._remote, this]

	def importRemoteJSON(this):
		# Remove the listener after get respond/reject
		def remove(): this._RemoteJSON_Respond = this._RemoteJSON_Reject = None
		this._RemoteJSON_Respond = lambda data: remove() or this.instance.importJSON(data)
		this._RemoteJSON_Reject = lambda err: remove() or print(err)

		this._onSyncOut({'w': 'ins', 't': 'ajs'})

	_sMLPending = False
	def syncModuleList(this):
		pass
		# raise Exception("Can't sync module list as Python doesn't load module from URL")

	def _syncModuleList(this, urls):
		pass
		# raise Exception("Can't sync module list as Python doesn't load module from URL")

	def notifyPuppetNodeListReload(this, data={}):
		this._onSyncOut({'w': 'skc', 't': 'puppetnode.reload', 'd': data})

	def _syncInWaitContinue(this):
		temp = this._syncInWait
		if(temp == None): return

		for x in temp:
			this.onSyncIn(x[0], True)

		this._syncInWait = None

	def nodeSyncOut(this, node, id: str, data='', force=False):
		return BpSyncOut(node, id, data, force)

	def onSyncIn(this, data: dict):
		if(this._skipEvent): return # Skip incoming event until this flag set to false
		if(data['w'] == 'skc'): return

		# data = JSON.parse(data)
		this.emit('_syncIn', data)

		instance = this.instance
		if('fid' in data):
			instance = this.instance.functions[data['fid']].used[0]
			if(instance != None): instance = instance.bpInstance
			if(instance == None): return this._resync('FunctionNode')

		ifaceList = instance.ifaceList

		if(data['w'] == 'p'):
			iface = ifaceList[data['i']]
			if(iface == None):
				return this._resync('Node')

			port = iface[data['ps']][data['n']]

			this._skipEvent = True
			if(data['t'] == 's'): # split
				Blackprint.Port.StructOf_split(port)
			elif(data['t'] == 'uns'): # unsplit
				Blackprint.Port.StructOf_unsplit(port)
			else:
				this._skipEvent = False
				return data
			this._skipEvent = False
		elif(data['w'] == 'ins'):
			this._skipEvent = True
			if(data['t'] == 'cvn'): # create variable.new
				if(data['scp'] == Blackprint.VarScope.Public):
					this.instance.createVariable(data['id'], {
						'title': data['ti'],
						'description': data.get('dsc', '')
					})
				else:
					this.instance.functions[data['fid']].createVariable(data['id'], {
						'title': data['ti'],
						'description': data.get('dsc', ''),
						'scope': data['scp']
					})
			elif(data['t'] == 'vrn'): # variable.renamed
				if(data['scp'] == Blackprint.VarScope.Public):
					this.instance.renameVariable(data['old'], data['now'], data['scp'])
				else:
					this.instance.functions[data['fid']].renameVariable(data['old'], data['now'], data['scp'])
			elif(data['t'] == 'vdl'): # variable.deleted
				if(data['scp'] == Blackprint.VarScope.Public):
					this.instance.deleteVariable(data['id'], data['scp'])
				else:
					this.instance.functions[data['fid']].deleteVariable(data['id'], data['scp'])
			elif(data['t'] == 'cfn'): # create function.new
				this.instance.createFunction(data['id'], {
					'title': data['ti'],
					'description': data.get('dsc', '')
				})
			elif(data['t'] == 'frn'): # function.renamed
				this.instance.renameFunction(data['old'], data['now'])
			elif(data['t'] == 'fdl'): # function.deleted
				this.instance.deleteFunction(data['id'])
			elif(data['t'] == 'cev'): # create event.new
				this.instance.events.createEvent(data['nm'])
			elif(data['t'] == 'evrn'): # event.renamed
				this.instance.events.renameEvent(data['old'], data['now'])
			elif(data['t'] == 'evdl'): # event.deleted
				this.instance.events.deleteEvent(data['nm'])
			elif(data['t'] == 'evfcr'): # create event.field.new
				this.instance.events.list[data['nm']].used[0].createField(data['name'])
			elif(data['t'] == 'evfrn'): # event.field.renamed
				this.instance.events.list[data['nm']].used[0].renameField(data['old'], data['now'])
			elif(data['t'] == 'evfdl'): # event.field.deleted
				this.instance.events.list[data['nm']].used[0].deleteField(data['name'])
			elif(data['t'] == 'rajs'):
				if(this._RemoteJSON_Respond == None):
					this._skipEvent = False
					return # This instance doesn't requesting the data
				if(data['d'] != None):
					this._RemoteJSON_Respond(data['d'])
				else:
					this._RemoteJSON_Reject(data.get('error', "Peer instance responsed with empty data"))
			else:
				this._skipEvent = False
				return data
			this._skipEvent = False
		else: return data

	def destroy(this):
		this.disable()
		this.instance._remote = None
	def disable(this):
		if(this.disabled): return

		onSyncIn = this.onSyncIn
		onSyncOut = this.onSyncOut

		def enable():
			this.onSyncIn = onSyncIn
			this.onSyncOut = onSyncOut
			this.disabled = False
			this._skipEvent = False
			this.emit('enabled')

		this.enable = enable
		this.onSyncIn = lambda: 1
		this.onSyncOut = lambda: 1
		this.emit('disabled')
		this.disabled = True
		this._skipEvent = True

	def clearNodes(this):
		this._skipEvent = True
		try:
			this.instance.clearNodes()
		finally:
			this._skipEvent = False

		this._onSyncOut({'w':'ins', 't':'c'})

	_pendingRemoteModule = {}
	def _answeredRemoteModule(this, namespace, url):
		pass
		# raise Exception("Can't sync module list as Python doesn't load module from URL")
	def _askRemoteModule(this, namespace):
		pass
		# raise Exception("Can't sync module list as Python doesn't load module from URL")