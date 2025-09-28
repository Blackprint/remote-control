local Utils = {}

function Utils.getFunctionId(iface)
	if iface == nil then return nil end
	if type(iface) == "table" then
		-- if instance/Engine
		if iface.parentInterface then
			return iface.parentInterface.node.bpFunction.id
		end

		-- if iface
		if iface.node and iface.node.instance and iface.node.instance.parentInterface then
			return iface.node.instance.parentInterface.node.bpFunction.id
		end
	end

	return nil
end

function Utils._tableFind(arr, value)
    for i, v in pairs(arr) do
        if v == value then return i end
    end
    return nil
end

function Utils._stringHasSpace(str)
	if string.find(str, " ") or string.find(str, "\t") or string.find(str, "\n") then
		return true
	else
		return false
	end
end

function Utils._stringStartsWith(str, prefix)
	return str:sub(1, #prefix) == prefix
end

function Utils._stringSplit(str, delimiter)
	local result = {}
	for match in str:gmatch("([^" .. delimiter .. "]+)") do
		table.insert(result, match)
	end
	return result
end

function Utils._stringCleanSymbols(str)
	return str:gsub("[^a-zA-Z0-9_]", "_")
end

function Utils._isList(obj)
	local isList = true
	for i = 1, #obj do
		if obj[i] == nil then
			isList = false
			break
		end
		break
	end
	return isList
end

return Utils