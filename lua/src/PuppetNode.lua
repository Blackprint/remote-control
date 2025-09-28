local PuppetNode = {}
local Blackprint = _G.Blackprint
local JSON = require("@src/LuaUtils/JSON.lua")
local Utils = require("@src/Utils.lua")

local typeContext = {__virtualTypes = {}}
local nativeTypeList = {
	{'string', 'String'},
	{'number', 'Number'},
	{'boolean', 'Boolean'},
	{'table', 'Object'},
	{'table', 'List'},
	{'function', 'Function'},
	{Blackprint.Types.Any, 'Any'},
	{Blackprint.Types.Route, 'Route'},
	{Blackprint.Types.Slot, 'Slot'},
	{Blackprint.Types.Trigger, 'Trigger'},
}

function PuppetNode.getNativeType(type)
	for i, x in ipairs(nativeTypeList) do
		if x[1] == type then return x[2] end
	end
	return nil
end

function PuppetNode.getTypeFullName(cls)
	error("ToDo: recheck this function")
	return cls
end

-- ToDo: port to PHP, Golang, and other programming languages
function PuppetNode.getRegisteredNodes(options)
	local nodes = Blackprint.Internal.nodes
	local list = {}
	local portTypes = Blackprint.Port

	local function typeToString(list)
		local types = {}
		for i = 1, #list do
			local port = list[i]
			local portType = type(port) == "table" and port['type'] or port
			local nativeType = PuppetNode.getNativeType(portType)

			local type = nativeType
			if type == nil then
				type = PuppetNode.getTypeFullName(portType)
			end

			table.insert(types, type)
		end

		return types
	end

	local function extractType(store, ports)
		for key, port in pairs(ports) do
			local temp = {}
			store[key] = temp
			local i = 0

			local type = nil
			if type(port) == "table" then
				local feature = port['feature']
				if feature ~= nil then
					if feature == portTypes.ArrayOf then i = 1
					elseif feature == portTypes.Default then i = 2
					elseif feature == portTypes.StructOf then i = 3
					elseif feature == portTypes.Trigger then i = 4
					elseif feature == portTypes.Union then i = 5
					elseif feature == portTypes.VirtualType then i = 6
					end
					temp['feature'] = i
				end

				if port['type'] == Blackprint.Types.Trigger then
					temp['feature'] = 4
				end
			else
				if port == Blackprint.Types.Trigger then
					temp['feature'] = 4
				end
			end

			if i ~= 5 then
				type = typeToString({
					type(port) == "table" and port['type'] or port
				})[1]
			else
				type = typeToString(port['type'])
			end

			temp['type'] = type
		end
	end

	local function extract(obj, namespace)
		for key, item in pairs(obj) do
			if namespace == '' and Utils.__stringStartsWith(key, 'BP') then
				continue
			end

			if item.__supertype == Blackprint.Node then
				local temp = {}
				list[namespace .. key] = temp

				if item.input ~= nil then
					local ref = {}
					temp['input'] = ref
					extractType(ref, item.input)
				end
				if item.output ~= nil then
					local ref = {}
					temp['output'] = ref
					extractType(ref, item.output)
				end

				temp['type'] = item.type
				temp['interfaceSync'] = item.interfaceSync
				temp['interfaceDocs'] = item.interfaceDocs
			elseif type(item) == "table" then
				extract(item, namespace .. key .. "/")
			end
		end
	end

	extract(nodes, '')
	if options and options.raw then return list end

	list = JSON.stringify(list)
	return list -- ToDo: Should we compress this with zlib?
end

Blackprint.registerInterface("BPIC/BPRemote/PuppetNode", function(class, extends)
	function class:syncIn()
		-- Do nothing
	end
end)

--[[
	Namepace: {
		type: "flow-control",
		interfaceSync: [ {type: "text_out", id: "theId"} ],
		input: { name: {type: "String", feature: 0}, ... },
		output: { name: {type: "String", feature: 0}, ... },
	}
]]

return PuppetNode