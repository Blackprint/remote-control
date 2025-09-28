local SocketIO = require("../lune_packages/socketio_client")
local Blackprint = require("../lune_packages/Blackprint")
local BPExample = require("../lune_packages/BPExample") -- Import example nodes
local BlackprintRC = require("../dist/BlackprintRC")

-- Create a new Socket.IO client
local client = SocketIO.new("http://localhost:2345", {
	maxReconnectionAttempts = 10,
	reconnectionDelay = 1000,
	reconnectionDelayMax = 5000,

    -- Additional config for this library
    pollingTime = 1000, -- Request for new remote message after 1 sec
    throttleDataSend = 100, -- Send all of our queued messages after 100ms to remote
})

-- Event handlers
client:on("disconnect", function(reason) print("Disconnected from server:", reason) end)
client:on("error", function(err) print("Socket error:", err) end)
client:on("reconnecting", function(attempts) print("Reconnecting... Attempt", attempts) end)
client:on("reconnect_failed", function() print("Failed to reconnect after maximum attempts") end)

-- Create Blackprint Instance
local instance = Blackprint.Engine.new()
local remote = BlackprintRC.RemoteEngine.new(instance)

remote:on('module.add', function(ev)
	print(string.format(`Adding %s new module, triggered by remote sync`, #ev.list))
end)
remote:on('module.added', function(ev)
	print(string.format(`%s new module has been added`, #ev.list))

	if #ev.failed ~= 0 then
		print(string.format(`Failed to add %s new module`, #ev.failed))
	end
end)
remote:on('module.remove', function(ev)
	print(string.format(`%s module has been removed, triggered by remote sync`, #ev.list))
end)
remote:on('disabled', function() print('Due to some reason, remote control was disabled') end)

-- Allow JSON import from remote (return true = allow, false = disable sync)
remote.onImport = function(v)
	print("Remote import is allowed")
	return true
end

local engineStartup = os.time()
client:on("connect", function()
	client:on('relay', function(data) remote:onSyncIn(data) end)
	remote.onSyncOut = function(this, data) client:emit('relay', data) end

	print('Remote control: connected')
	client:on('disconnect', function()
		print('Remote control: disconnected')
	end)

	client:emit('startup-time', engineStartup)
end)

client:connect()