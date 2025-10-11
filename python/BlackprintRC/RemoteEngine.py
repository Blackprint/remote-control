# Remote Control between Engine <-> Sketch

import Blackprint
from .RemoteBase import RemoteBase
from .utils import getFunctionId
from .PuppetNode import getRegisteredNodes
import datetime

# ToDo: port to PHP, Golang, and other programming languages
class RemoteEngine(RemoteBase):
	_syncInWait = None
	jsonTemp = None

	def __init__(this, instance):
		RemoteBase.__init__(this, instance)

		def evCableDisconnect(ev):
			cable = ev.cable
			if(cable._evDisconnected or this._skipEvent): return
			fid = getFunctionId(cable.output.iface)
			ifaceList = cable.owner.iface.node.instance.ifaceList

			try:
				inputIndex = ifaceList.index(cable.input.iface)
				outputIndex = ifaceList.index(cable.output.iface)
			except: # if(inputIndex == -1 or outputIndex == -1): return
				return # just return as the cable already removed

			cable._evDisconnected = True
			this._onSyncOut({
				'w':'c',
				'fid': fid,
				'inp':{'i': inputIndex, 's': cable.input.source, 'n': cable.input.name},
				'out':{'i': outputIndex, 's': cable.output.source, 'n': cable.output.name},
				't':'d'
			})
		instance.on('cable.disconnect', evCableDisconnect)

		def evFlowEvent(ev):
			if(this._skipEvent and (not this._isImporting)): return
			cable = ev.cable
			fid = getFunctionId(cable.output.iface)
			ifaceList = cable.owner.iface.node.instance.ifaceList

			input_ = cable.input
			output_ = cable.output

			this._onSyncOut({
				'w': 'c',
				'fid': fid,
				'inp':{'i': ifaceList.index(input_.iface), 's': input_.source, 'n': input_.name, 'nr': input_.iface.node.routes == input_}, # nr=node route
				'out':{'i': ifaceList.index(output_.iface), 's': output_.source, 'n': output_.name, 'nr': output_.iface.node.routes == output_}, # nr=node route
				't':'f'
			})
		instance.on('_flowEvent', evFlowEvent)

		def evNodeSync(ev): # internal node data sync
			# if(this._skipEvent and !this._isImporting) return
			fid = getFunctionId(ev['iface'])
			ifaceList = ev['iface'].node.instance.ifaceList
			this._onSyncOut({'w':'nd', 'fid': fid, 'i':ifaceList.index(ev['iface']), 'd': (ev['data'] if 'data' in ev else None) or None, 't':'s'})
		instance.on('_node.sync', evNodeSync)

		def evError(ev):
			if(this._skipEvent): return
			this._onSyncOut({'w':'err', 'd': ev.data})
		instance.on('error', evError)

		# _fnStructureUpdate
		# instance.on('_fn.structure.update', _fnStructureUpdate = ev => {
		# 	if(this._skipEvent) return

			# ask function structure
			# this._onSyncOut({w:'ins', t: 'askfns', fid: ev.bpFunction.id })
		# })

		# instance.on('cable.connecting', cable => {})
		# instance.on('cable.cancel', cable => {})
		# instance.on('port.output.call', cable => {})
		# instance.on('port.output.value', cable => {})

		def destroy():
			instance.off('cable.disconnect', evCableDisconnect)
			instance.off('_flowEvent', evFlowEvent)
			instance.off('_node.sync', evNodeSync)
			# instance.off('_fn.structure.update', _fnStructureUpdate)
			instance.off('error', evError)

			this.onSyncIn = lambda:0
			this.onSyncOut = lambda:0

		this.destroy = destroy

	def onSyncIn(this, data: dict, _parsed=False): # async
		if(this._skipEvent): return # Skip incoming event until this flag set to false
		if(not _parsed):
			data = RemoteBase.onSyncIn(this, data)

		if(data == None): return
		if(data['w'] == 'skc'): return # Skip any sketch event
		if(not _parsed and this._syncInWait != None and data['w'] != 'ins' and data['t'] != 'addrm'):
			return this._syncInWait.append(data)

		instance = this.instance
		if('fid' in data):
			instance = this.instance.functions[data['fid']].used[0]
			if(instance != None): instance = instance.bpInstance
			if(instance == None): return this._resync('FunctionNode')

		ifaceList = instance.ifaceList

		if(data['w'] == 'c'): # cable
			inp = data['inp']
			out = data['out']
			ifaceInput = ifaceList[inp['i']]
			ifaceOutput = ifaceList[out['i']]

			if(ifaceInput == None or ifaceOutput == None): return this._resync('Cable')

			if(data['t'] == 'c'): # connect
				this._skipEvent = True
				inputPort = None
				outputPort = None

				if(inp['s'] == 'route'):
					ifaceOutput.node.routes.routeTo(ifaceInput)
					this._skipEvent = False
					return
				else:
					inputPort = getattr(ifaceInput, inp['s']).get(inp['n'], None)
					outputPort = getattr(ifaceOutput, out['s']).get(out['n'], None)

				if(outputPort == None):
					if(ifaceOutput.namespace == "BP/Fn/Input"):
						outputPort = ifaceOutput.addPort(inputPort, None)
					elif(ifaceOutput.namespace == "BP/Var/Get"):
						ifaceOutput.useType(inputPort)
						outputPort = ifaceOutput.output['Val']
					else: raise Exception("Can't find handler for namespace: " + ifaceOutput.namespace)

				if(inputPort == None):
					if(ifaceInput.namespace == "BP/Fn/Output"):
						inputPort = ifaceInput.addPort(outputPort, None)
					elif(ifaceInput.namespace == "BP/Var/Set"):
						ifaceInput.useType(outputPort)
						inputPort = ifaceInput.input['Val']
					else: raise Exception("Can't find handler for namespace: " + ifaceInput.namespace)

				inputPort.connectPort(outputPort)
				this._skipEvent = False
				return

			if(data['t'] == 'd'): # route cable disconnect
				if(inp['s'] == 'route'):
					this._skipEvent = True
					if(ifaceOutput.node.routes.out != None):
						ifaceOutput.node.routes.out.disconnect()
					this._skipEvent = False
					return

			cables = getattr(ifaceInput, inp['s'])[inp['n']].cables
			cable = None
			for temp in cables:
				if(temp.output.iface == ifaceOutput):
					cable = temp
					break

			if(cable == None): return

			if(data['t'] == 'd'): # disconnect
				this._skipEvent = True
				cable._evDisconnected = True
				try:
					cable.disconnect()
				finally:
					this._skipEvent = False
		elif(data['w'] == 'nd'): # node
			iface = ifaceList[data['i']] if len(ifaceList) > data['i'] else None

			if(data['t'] == 's'): # sync
				if(iface == None):
					print(f"Node index '{data['i']}' was not found when trying to syncing data")
					return # Maybe when creating nodes it's trying to syncing data
					# return this._resync('Node')

				node = iface.node
				temp = data['d']

				node._syncronizing = True
				for key, value in temp.items():
					if(key == 'bp_port_default'):
						if(value['which'] == 'input'):
							if(value['call'] != -1): node.input[value['id']]()
							else:
								iface.input[value['id']].default = value['value']
								node.update(None)
								node.routes.routeOut()
						if(value['which'] == 'output'):
							if(value['call'] != -1): node.output[value['id']]()
					else: node.syncIn(key, value)

				node._syncronizing = False
			elif(data['t'] == 'c'): # created
				if(iface != None): # The index mustn't be occupied by other iface
					return this._resync('Node')

				namespace = data['nm']
				if(not namespace.startswith("BPI/F/")):
					clazz = Blackprint.Utils.getDeepProperty(Blackprint.Internal.nodes, namespace.split('/'))
					if(clazz == None):
						if(this._syncInWait == None):
							this._syncInWait = []
						this._askRemoteModule(namespace)

				this._skipEvent = True
				try:
					newIface = instance.createNode(namespace, data)
				finally:
					this._skipEvent = False
					this._syncInWaitContinue()

				if(ifaceList.index(newIface) != data['i']):
					return this._resync('Node')

				this._syncInWaitContinue()
			elif(data['t'] == 'd'): # deleted
				if(iface == None): return this._resync('Node')
				instance.deleteNode(iface)
			elif(data['t'] == 'fnrnp'): # function rename node port
				iface.renamePort(data['wh'], data['fnm'], data['tnm'])
		elif(data['w'] == 'ins'): # instance
			if(data['t'] == 'c'): # clean nodes
				this._skipEvent = True
				this.jsonTemp = None
				this.jsonSyncTime = 0
				instance.clearNodes()
				this._skipEvent = False
			elif(data['t'] == 'ci'): # clean import
				this._skipEvent = True

				this.jsonTemp = data['d']
				this.jsonSyncTime = int(datetime.datetime.utcnow().timestamp()*1000)

				if(this.onImport() == True):
					this._isImporting = True
					instance.clearNodes()
					if(data['d'] == None): this.emit('empty.json.import')
					else:
						this.emit('sketch.import', {'data': data['d']})
						instance.importJSON(data['d'])
						this.emit('sketch.imported', {'data': data['d']})
					this._isImporting = False

				this._skipEvent = False
			elif(data['t'] == 'ssk'): # save sketch json
				this.jsonTemp = data['d']
				this.jsonSyncTime = int(datetime.datetime.utcnow().timestamp()*1000)
			elif(data['t'] == 'puppetnode.ask'): # send puppetnode list
				this._onSyncOut({'w':'skc', 't':'puppetnode.list', 'd': getRegisteredNodes()})
			elif(data['t'] == 'sfns'): # sync function structure
				this.instance.functions[data['fid']].structure = data['d']
				# this.instance.functions[data['fid']].structure = JSON.parse(data['d'])
			elif(data['t'] == 'sml'): # sync module list
				this._syncModuleList(data['d'])
			elif(data['t'] == 'ajs'): # ask json
				if(this.jsonTemp == None): return
				this._onSyncOut({'w':'ins', 't':'ci', 'd': this.jsonTemp})
			elif(data['t'] == 'askrm'):
				namespace = data['nm']
				clazz = Blackprint.Utils.getDeepProperty(Blackprint.Internal.nodes, namespace.split('/'))
				if(clazz == None): return; # This node dont have remote module
				this._onSyncOut({'w':'ins', 't':'addrm', 'd': clazz._scopeURL, 'nm': namespace})
			elif(data['t'] == 'addrm'):
				this._answeredRemoteModule(data['nm'], data['d'])
			elif(data['t'] == 'nidc'): # node id changed
				this._skipEvent = True
				iface = ifaceList[data['i']]

				try:
					if(iface == None):
						return this._resync('Node')

					if(iface.id != data['f']):
						raise Exception("Old node id was different")

					# This may need to be changed if the ID was being used for reactivity
					del instance.iface[iface.id]
					instance.iface[data['to']] = iface
					iface.id = data['to']
				finally:
					this._skipEvent = False
			elif(data['t'] == 'jsonim'):
				this._skipEvent = True
				try:
					instance.importJSON(data['data'], {
						'appendMode': data['app'] if 'app' in data else False
					})
				finally:
					this._skipEvent = False
			elif(data['t'] == 'pdc'):
				iface = ifaceList[data['i']]
				iface.input[data['k']].default = data['v']

				node = iface.node
				node.update(None)
				node.routes.routeOut()
			elif(data['t'] == 'prsc'):
				iface = ifaceList[data['i']]
				iface.output[data['k']].allowResync = data['v']
