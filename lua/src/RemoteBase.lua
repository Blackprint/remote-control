local Blackprint = _G.Blackprint
local Node = require("@src/Node.lua")

local RemoteBase = setmetatable({}, {__index = Blackprint.CustomEvent})
RemoteBase.__index = RemoteBase

-- True  => allow
-- False => block
function RemoteBase.onImport(this, json) return false end
function RemoteBase.onModule(this, urls) return false end
RemoteBase.disabled = false

-- "onSyncOut" function need to be replaced and the data need to be send to remote client
function RemoteBase.onSyncOut(this, data) end
function RemoteBase._onSyncOut(this, data) this:onSyncOut(data) end
-- _onSyncOut(this, data): this.onSyncOut(JSON.stringify(data))

function RemoteBase._resync(this, which)
	if which then print(which .. " list was not synced") end
	if this.__resync then return end
	this.__resync = true

	print("Blackprint: Resyncing diagrams")
	this:importRemoteJSON()
	this.__resync = false
end

function RemoteBase.new(instance)
	local this = setmetatable(Blackprint.CustomEvent.new(), RemoteBase)

	this.instance = instance
	this._skipEvent = false
	this.__resync = false
	this._sMLPending = false

	if instance._remote == nil then
		instance._remote = this
	else
		if type(instance._remote) == "table" then
			table.insert(instance._remote, this)
		else
			instance._remote = {instance._remote, this}
		end
	end

	return this
end

function RemoteBase:importRemoteJSON()
	self._RemoteJSON_Respond = function(data)
		self._RemoteJSON_Respond = nil
		self._RemoteJSON_Reject = nil
		self.instance:importJSON(data)
	end
	self._RemoteJSON_Reject = function(err)
		self._RemoteJSON_Respond = nil
		self._RemoteJSON_Reject = nil
		print(err)
	end
	self:_onSyncOut({w = 'ins', t = 'ajs'})
end

function RemoteBase:syncModuleList()
	-- error("Can't sync module list as Lua doesn't load module from URL")
end

function RemoteBase:_syncModuleList(urls)
	-- error("Can't sync module list as Lua doesn't load module from URL")
end

function RemoteBase:notifyPuppetNodeListReload(data)
	if data == nil then data = {} end
	self:_onSyncOut({w = 'skc', t = 'puppetnode.reload', d = data})
end

function RemoteBase:_syncInWaitContinue()
	local temp = self._syncInWait
	if temp == nil then
		return
	end

	for i, x in ipairs(temp) do
		self:onSyncIn(x[1], true)
	end

	self._syncInWait = nil
end

function RemoteBase:nodeSyncOut(node, id, data, force)
	return Node.BpSyncOut(node, id, data or '', force or false)
end

function RemoteBase:onSyncIn(data)
	if self._skipEvent then return end -- Skip incoming event until this flag set to false
	if data['w'] == 'skc' then return end

	-- data = JSON.parse(data)
	self:emit('_syncIn', data)

	local instance = self.instance
	if data['fid'] then
		instance = self.instance.functions[data['fid']].used[1]
		if instance ~= nil then instance = instance.bpInstance end
		if instance == nil then return self:_resync('FunctionNode') end
	end

	local ifaceList = instance.ifaceList

	if data['w'] == 'p' then
		local iface = ifaceList[data['i']]
		if iface == nil then
			return self:_resync('Node')
		end

		local port = iface[data['ps']][data['n']]

		self._skipEvent = true
		if data['t'] == 's' then -- split
			Blackprint.Port.StructOf_split(port)
		elseif data['t'] == 'uns' then -- unsplit
			Blackprint.Port.StructOf_unsplit(port)
		else
			self._skipEvent = false
			return data
		end
		self._skipEvent = false
	elseif data['w'] == 'ins' then
		self._skipEvent = true
		if data['t'] == 'cvn' then -- create variable.new
			if data['scp'] == Blackprint.VarScope.Public then
				self.instance:createVariable(data['id'], {
					title = data['ti'],
					description = data['dsc']
				})
			else
				self.instance.functions[data['fid']]:createVariable(data['id'], {
					title = data['ti'],
					description = data['dsc'],
					scope = data['scp']
				})
			end
		elseif data['t'] == 'vrn' then -- variable.renamed
			if data['scp'] == Blackprint.VarScope.Public then
				self.instance:renameVariable(data['old'], data['now'], data['scp'])
			else
				self.instance.functions[data['fid']]:renameVariable(data['old'], data['now'], data['scp'])
			end
		elseif data['t'] == 'vdl' then -- variable.deleted
			if data['scp'] == Blackprint.VarScope.Public then
				self.instance:deleteVariable(data['id'], data['scp'])
			else
				self.instance.functions[data['fid']]:deleteVariable(data['id'], data['scp'])
			end
		elseif data['t'] == 'cfn' then -- create function.new
			self.instance:createFunction(data['id'], {
				title = data['ti'],
				description = data['dsc']
			})
		elseif data['t'] == 'frn' then -- function.renamed
			self.instance:renameFunction(data['old'], data['now'])
		elseif data['t'] == 'fdl' then -- function.deleted
			self.instance:deleteFunction(data['id'])
		elseif data['t'] == 'cev' then -- create event.new
			self.instance.events:createEvent(data['nm'])
		elseif data['t'] == 'evrn' then -- event.renamed
			self.instance.events:renameEvent(data['old'], data['now'])
		elseif data['t'] == 'evdl' then -- event.deleted
			self.instance.events:deleteEvent(data['nm'])
		elseif data['t'] == 'evfcr' then -- create event.field.new
			self.instance.events.list[data['nm']].used[1]:createField(data['name'])
		elseif data['t'] == 'evfrn' then -- event.field.renamed
			self.instance.events.list[data['nm']].used[1]:renameField(data['old'], data['now'])
		elseif data['t'] == 'evfdl' then -- event.field.deleted
			self.instance.events.list[data['nm']].used[1]:deleteField(data['name'])
		elseif data['t'] == 'rajs' then
			if self._RemoteJSON_Respond == nil then
				self._skipEvent = false
				return -- This instance doesn't requesting the data
			end
			if data['d'] ~= nil then
				self._RemoteJSON_Respond(data['d'])
			else
				self._RemoteJSON_Reject(data['error'] or "Peer instance responsed with empty data")
			end
		else
			self._skipEvent = false
			return data
		end
		self._skipEvent = false
	else
		return data
	end
end

function RemoteBase:destroy()
	self:disable()
	self.instance._remote = nil
end

function RemoteBase:disable()
	if self.disabled then
		return
	end

	local onSyncIn = self.onSyncIn
	local onSyncOut = self.onSyncOut

	local function enable()
		self.onSyncIn = onSyncIn
		self.onSyncOut = onSyncOut
		self.disabled = false
		self._skipEvent = false
		self:emit('enabled')
	end

	self.enable = enable
	self.onSyncIn = function() end
	self.onSyncOut = function() end
	self:emit('disabled')
	self.disabled = true
	self._skipEvent = true
end

function RemoteBase:clearNodes()
	self._skipEvent = true
	local success, err = pcall(function()
		self.instance:clearNodes()
	end)
	if not success then
		print("Error clearing nodes:", err)
	end
	self._skipEvent = false

	self:_onSyncOut({w = 'ins', t = 'c'})
end

RemoteBase._pendingRemoteModule = {}
function RemoteBase:_answeredRemoteModule(namespace, url)
	-- error("Can't sync module list as Lua doesn't load module from URL")
end

function RemoteBase:_askRemoteModule(namespace)
	-- error("Can't sync module list as Lua doesn't load module from URL")
end

return RemoteBase