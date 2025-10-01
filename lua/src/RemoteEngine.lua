local Blackprint = _G.Blackprint
local RemoteBase = require("@src/RemoteBase.lua")
local PuppetNode = require("@src/PuppetNode.lua")
local Utils = require("@src/Utils.lua")

local RemoteEngine = setmetatable({}, {__index = RemoteBase})
RemoteEngine.__index = RemoteEngine

-- ToDo: port to PHP, Golang, and other programming languages
function RemoteEngine.new(instance)
	local this = RemoteBase.new(instance)
	setmetatable(this, RemoteEngine)

	this._syncInWait = nil
	this.jsonTemp = nil

	-- Set up event listeners
	local evCableDisconnect = function(ev)
		local cable = ev.cable
		if cable._evDisconnected or this._skipEvent then return end
		local fid = Utils.getFunctionId(cable.output.iface)
		local ifaceList = cable.owner.iface.node.instance.ifaceList

		local inputIndex = ifaceList:indexOf(cable.input.iface)
		local outputIndex = ifaceList:indexOf(cable.output.iface)
		if(inputIndex == -1 or outputIndex == -1) then return end

		cable._evDisconnected = true
		this:_onSyncOut({
			w = 'c',
			fid = fid,
			inp = {i = inputIndex, s = cable.input.source, n = cable.input.name},
			out = {i = outputIndex, s = cable.output.source, n = cable.output.name},
			t = 'd'
		})
	end
	instance:on('cable.disconnect', evCableDisconnect)

	local evFlowEvent = function(ev)
		if this._skipEvent and not this._isImporting then return end
		local cable = ev.cable
		local fid = Utils.getFunctionId(cable.output.iface)
		local ifaceList = cable.owner.iface.node.instance.ifaceList

		local input_ = cable.input
		local output_ = cable.output

		this:_onSyncOut({
			w = 'c',
			fid = fid,
			inp = {i = ifaceList:indexOf(input_.iface), s = input_.source, n = input_.name, nr = input_.iface.node.routes == input_}, -- nr=node route
			out = {i = ifaceList:indexOf(output_.iface), s = output_.source, n = output_.name, nr = output_.iface.node.routes == output_}, -- nr=node route
			t = 'f'
		})
	end
	instance:on('_flowEvent', evFlowEvent)

	local evNodeSync = function(ev) -- internal node data sync
		-- if(this._skipEvent and !this._isImporting) return
		local fid = Utils.getFunctionId(ev.iface)
		local ifaceList = ev.iface.node.instance.ifaceList
		this:_onSyncOut({w = 'nd', fid = fid, i = ifaceList:indexOf(ev.iface), d = ev.data or nil, t = 's'})
	end
	instance:on('_node.sync', evNodeSync)

	local evError = function(ev)
		if this._skipEvent then return end
		this:_onSyncOut({w = 'err', d = ev.data})
	end
	instance:on('error', evError)

	-- _fnStructureUpdate
	-- instance:on('_fn.structure.update', _fnStructureUpdate = ev => {
	-- 	if(this._skipEvent) return

		-- ask function structure
		-- this:_onSyncOut({w:'ins', t: 'askfns', fid: ev.bpFunction.id })
	-- })

	-- instance:on('cable.connecting', cable => {})
	-- instance:on('cable.cancel', cable => {})
	-- instance:on('port.output.call', cable => {})
	-- instance:on('port.output.value', cable => {})

	-- Store cleanup function
	this._destroy1 = function()
		instance:off('cable.disconnect', evCableDisconnect)
		instance:off('_flowEvent', evFlowEvent)
		instance:off('_node.sync', evNodeSync)
		-- instance:off('_fn.structure.update', _fnStructureUpdate)
		instance:off('error', evError)
	end

	return this
end

function RemoteEngine:onSyncIn(data, _parsed)
	if self._skipEvent then return end -- Skip incoming event until this flag set to false
	if not _parsed then
		data = RemoteBase.onSyncIn(self, data)
	end

	if data == nil then return end
	if data['w'] == 'skc' then return end -- Skip any sketch event
	if not _parsed and self._syncInWait ~= nil and data['w'] ~= 'ins' and data['t'] ~= 'addrm' then
		table.insert(self._syncInWait, data)
		return
	end

	local instance = self.instance
	if data['fid'] then
		instance = self.instance.functions[data['fid']].used[1]
		if instance ~= nil then instance = instance.bpInstance end
		if instance == nil then return self:_resync('FunctionNode') end
	end

	local ifaceList = instance.ifaceList

	if data['w'] == 'c' then -- cable
		local inp = data['inp']
		local out = data['out']
		local ifaceInput = ifaceList[inp['i']]
		local ifaceOutput = ifaceList[out['i']]

		if ifaceInput == nil or ifaceOutput == nil then
			return self:_resync('Cable')
		end

		if data['t'] == 'c' then -- connect
			self._skipEvent = true
			local inputPort = nil
			local outputPort = nil

			if inp['s'] == 'route' then
				ifaceOutput.node.routes:routeTo(ifaceInput)
				self._skipEvent = false
				return
			else
				inputPort = ifaceInput[inp['s']][inp['n']]
				outputPort = ifaceOutput[out['s']][out['n']]
			end

			if outputPort == nil then
				if ifaceOutput.namespace == "BP/Fn/Input" then
					outputPort = ifaceOutput:addPort(inputPort)
				elseif ifaceOutput.namespace == "BP/Var/Get" then
					ifaceOutput:useType(inputPort)
					outputPort = ifaceOutput.output.Val
				end
			end

			if inputPort == nil then
				if ifaceInput.namespace == "BP/Fn/Output" then
					inputPort = ifaceInput:addPort(outputPort)
				elseif ifaceInput.namespace == "BP/Var/Set" then
					ifaceInput:useType(outputPort)
					inputPort = ifaceInput.input.Val
				end
			end

			inputPort:connectPort(outputPort)
			self._skipEvent = false
			return
		end

		if data['t'] == 'd' then -- route cable disconnect
			if inp['s'] == 'route' then
				self._skipEvent = true
				if ifaceOutput.node.routes.out ~= nil then
					ifaceOutput.node.routes.out:disconnect()
				end
				self._skipEvent = false
				return
			end
		end

		local cables = ifaceInput[inp['s']][inp['n']].cables
		local cable = nil
		for i, temp in ipairs(cables) do
			if temp.output.iface == ifaceOutput then
				cable = temp
				break
			end
		end

		if cable == nil then return end

		if data['t'] == 'd' then -- disconnect
			self._skipEvent = true
			cable._evDisconnected = true
			local success, err = pcall(function()
				cable:disconnect()
			end)
			if not success then
				print("Error disconnecting cable:", err)
			end
			self._skipEvent = false
		end
	elseif data['w'] == 'nd' then -- node
		local iface = ifaceList[data['i']]
		if data['i'] == -1 then return end

		if data['t'] == 's' then -- sync
			if iface == nil then
				print(string.format("Node index '%d' was not found when trying to syncing data", data['i']))
				return -- Maybe when creating nodes it's trying to syncing data
				-- return self:_resync('Node')
			end

			local node = iface.node
			local temp = data['d']

			node._syncronizing = true
			for key, value in pairs(temp) do
				if key == 'bp_port_default' then
					if value['which'] == 'input' then
						if value['call'] ~= -1 then
							node.input[value['id']]()
						else
							iface.input[value['id']].default = value['value']
							node:update(nil)
							node.routes:routeOut()
						end
					end
					if value['which'] == 'output' then
						if value['call'] ~= -1 then node.output[value['id']]() end
					end
				else
					node:syncIn(key, value)
				end
			end

			node._syncronizing = false
		elseif data['t'] == 'c' then -- created
			if iface ~= nil then -- The index mustn't be occupied by other iface
				return self:_resync('Node')
			end

			local namespace = data['nm']
			if not Utils._stringStartsWith(namespace, "BPI/F/") then
				local clazz = Blackprint.Utils.getDeepProperty(Blackprint.Internal.nodes, Utils._stringSplit(namespace, '/'))
				if clazz == nil then
					if self._syncInWait == nil then
						self._syncInWait = {}
					end
					self:_askRemoteModule(namespace)
				end
			end

			self._skipEvent = true
			local newIface
			local success, err = pcall(function()
				newIface = instance:createNode(namespace, data)
			end)
			if not success then
				print("Error creating node:", data, err)
				self._skipEvent = false
				self:_syncInWaitContinue()
				return
			end
			self._skipEvent = false

			if ifaceList:indexOf(newIface) ~= data['i'] then
				return self:_resync('Node')
			end

			self:_syncInWaitContinue()
		elseif data['t'] == 'd' then -- deleted
			if iface == nil then return self:_resync('Node') end
			instance:deleteNode(iface)
		elseif data['t'] == 'fnrnp' then -- function rename node port
			iface:renamePort(data['wh'], data['fnm'], data['tnm'])
		end
	elseif data['w'] == 'ins' then -- instance
		if data['t'] == 'c' then -- clean nodes
			self._skipEvent = true
			self.jsonTemp = nil
			self.jsonSyncTime = 0
			instance:clearNodes()
			self._skipEvent = false
		elseif data['t'] == 'ci' then -- clean import
			self._skipEvent = true

			self.jsonTemp = data['d']
			self.jsonSyncTime = os.time() * 1000 -- Convert to milliseconds

			if self:onImport() == true then
				self._isImporting = true
				instance:clearNodes()
				if data['d'] == nil then
					self:emit('empty.json.import')
				else
					self:emit('sketch.import', {data = data['d']})
					instance:importJSON(data['d'])
					self:emit('sketch.imported', {data = data['d']})
				end
				self._isImporting = false
			end

			self._skipEvent = false
		elseif data['t'] == 'ssk' then -- save sketch json
			self.jsonTemp = data['d']
			self.jsonSyncTime = os.time() * 1000 -- Convert to milliseconds
		elseif data['t'] == 'puppetnode.ask' then -- send puppetnode list
			self:_onSyncOut({w = 'skc', t = 'puppetnode.list', d = PuppetNode.getRegisteredNodes()})
		elseif data['t'] == 'sfns' then -- sync function structure
			self.instance.functions[data['fid']].structure = data['d']
		elseif data['t'] == 'sml' then -- sync module list
			self:_syncModuleList(data['d'])
		elseif data['t'] == 'ajs' then -- ask json
			if self.jsonTemp == nil then return end
			self:_onSyncOut({w = 'ins', t = 'ci', d = self.jsonTemp})
		elseif data['t'] == 'askrm' then
			local namespace = data['nm']
			local clazz = Blackprint.Utils.getDeepProperty(Blackprint.Internal.nodes, Utils._stringSplit(namespace, '/'))
			if clazz == nil then return end -- This node dont have remote module
			self:_onSyncOut({w = 'ins', t = 'addrm', d = clazz._scopeURL, nm = namespace})
		elseif data['t'] == 'addrm' then
			self:_answeredRemoteModule(data['nm'], data['d'])
		elseif data['t'] == 'nidc' then -- node id changed
			self._skipEvent = true
			local iface = ifaceList[data['i']]

			local success, err = pcall(function()
				if iface == nil then
					return self:_resync('Node')
				end

				if iface.id ~= data['f'] then
					error("Old node id was different")
				end

				-- This may need to be changed if the ID was being used for reactivity
				instance.iface[iface.id] = nil
				instance.iface[data['to']] = iface
				iface.id = data['to']
			end)

			if not success then
				print("Error in 'nidc' handling:", err)
			end

			self._skipEvent = false
		elseif data['t'] == 'jsonim' then
			self._skipEvent = true
			local success, err = pcall(function()
				instance:importJSON(data['data'], {
					appendMode = data['app'] or false
				})
			end)
			if not success then
				print("Error importing JSON:", err)
			end
			self._skipEvent = false
		elseif data['t'] == 'pdc' then
			local iface = ifaceList[data['i']]
			iface.input[data['k']].default = data['v']

			local node = iface.node
			node:update(nil)
			node.routes:routeOut()
		elseif data['t'] == 'prsc' then
			local iface = ifaceList[data['i']]
			iface.output[data['k']].allowResync = data['v']
		end
	end
end

function RemoteEngine:destroy()
	self._destroy1()
	self.onSyncIn = function() end
	self.onSyncOut = function() end
	RemoteBase.destroy(self)
end

return RemoteEngine