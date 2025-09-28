local Node = {}
local Timer = require("@src/LuaUtils/Timer.lua")

function Node.BpSyncOut(node, id, data, force)
	local instance = node.instance.rootInstance or node.instance

	if instance._remote == nil or (not force and node._syncronizing) or instance.syncDataOut == false then
		return
	end

	if type(id) ~= "string" then
		error("syncOut's ID must be a string, but got: " .. type(id))
	end

	local char = id:sub(1, 1)
	if char == '_' or char == '$' then
		error("syncOut's ID can't be started with '_' or '$' character as it's assumed as a private field, but got: " .. id)
	end

	if node.syncThrottle ~= 0 then -- ToDo: make this timer more efficient
		if node._syncWait == nil then node._syncWait = {} end
		node._syncWait[id] = data

		local function timeout()
			if node._syncHasWait then
				instance:emit('_node.sync', {
					iface = node.iface,
					data = Node.clearPrivateField(node._syncWait)
				})
			end

			node._syncWait = nil
			node._syncHasWait = false
		end

		if node._syncHasWait then
			Timer.clearTimeout(node._syncHasWait)
		end
		node._syncHasWait = Timer.setTimeout(timeout, node.syncThrottle)
	else
		instance:emit('_node.sync', {
			iface = node.iface,
			data = Node.clearPrivateField({ [id] = data })
		})
	end
end

function Node.clearPrivateField(obj)
	if obj == nil then return obj end

	if type(obj) == "table" then
		local temp = {}
		for key, value in pairs(obj) do
			local char = key:sub(1, 1)
			if char == '_' or char == '$' then
				continue
			end

			if type(value) == "table" then
				temp[key] = Node.clearPrivateField(value)
			else
				temp[key] = value
			end
		end
		return temp
	end

	return obj
end

return Node