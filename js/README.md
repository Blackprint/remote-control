# Blackprint - Remote Control
This module will provide an ability for Blackprint to control engine remotely and can be used for multi-user collaboration

> Not for production!<br>
> Please remove this feature if you're going to ship your product, unless you know what you're doing. This module gives ability to remotely control your software, you will need a sandboxed environment and permission based system in order to ship to production..

Any ports data flow for sketch will be disabled if it's connected to remote engine. It's not recommended to combine different data flow between `remote <~> remote` in just one instance, you should create two different instance for them and use feature from other module/library to sync data between the two instance itself.

> Don't forget to update the version, it may get outdated

```xml
<script src="https://cdn.jsdelivr.net/npm/scarletsframe@0.35.9/dist/scarletsframe.dev.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@blackprint/engine@0.6.2"></script>
<script src="https://cdn.jsdelivr.net/npm/@blackprint/remote-control@0.1/dist/remote-control.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@blackprint/sketch@0.6.3/dist/blackprint.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@blackprint/sketch@0.6.3/dist/blackprint.sf.js"></script>
<script src="https://cdn.socket.io/4.4.1/socket.io.min.js"></script>

<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/@blackprint/sketch@0.6.3/dist/blackprint.sf.css">
```

---

### Implementation for browser
Implementation for browser

```js
let instance = new Blackprint.Sketch();
let client = new Blackprint.RemoteSketch(instance);
let socket = new io("http://localhost:2345"); // Replace with your relaying server (Socket.io)

// Add listener in case if the remote sync was disabled
client.on('disabled', ()=> SmallNotif.add("Remote sync was disabled", 'red'));

// instance.syncDataOut = false; // Uncomment this if you don't want to sync browser "node data" to the engine
instance.disablePorts = true; // Uncomment this if you want to disable any data flow on the browser

// Allow import/module sync (you can perform async actions, return true to allow, and return false to disallow)
client.onImport = async v => console.log("Remote import is allowed") || true;
client.onModule = async v => console.log("Remote module is allowed") || true;

// Relay data sync between instance (remote engine and the control)
socket.on('relay', v => client.onSyncIn(v));     // Engine -> Sketch
client.onSyncOut = v => socket.emit('relay', v); // Sketch -> Engine
```

### Implementation for server
For the example below with Node.js, you need to install socket.io `npm i socket.io`.

<details>
	<summary>Remote control other browser's sketch with relay server</summary>

This is just relaying server with Socket.io, you can customize it with WebRTC or UDP instead. Both `RemoteSketch` from the browser need to be connected to this same relaying server.
```js
let port = 2345;
let httpServer = require('http').createServer();
let io = require('socket.io')(httpServer, {
  cors: { origin: ["http://localhost:6789", "https://blackprint.github.io"]}
});

io.on('connection', client => {
	client.on('relay', data => client.broadcast.emit('relay', data));

	console.log("A client was connected");
	client.on('disconnect', ()=> console.log("A client got disconnected"));
});

console.log(`Waiting connection on port: ${port}`);
httpServer.listen(port);
```
</details>

<details>
	<summary>Remote control your engine on Node.js from the browser</summary>

You must change `Blackprint.RemoteSketch` with `Blackprint.RemoteControl` if you want to remote control only the engine (RemoteSketch is used if you want to control remote sketch).

```js
let { createServer } = require("http");
let { Server } = require("socket.io");

let port = 2345;
let httpServer = createServer();
let io = new Server(httpServer, {
  cors: { origin: ["http://localhost:6789", "https://blackprint.github.io"]}
});

Blackprint.allowModuleOrigin('*'); // Allow load from any URL (localhost/https only)

let instance = new Blackprint.Engine();
let remote = new Blackprint.RemoteEngine(instance);

// Allow import/module sync (return true = allow, false = disable sync)
remote.onImport = v=> console.log("Remote import is allowed") || true;
remote.onModule = v=> console.log("Remote module is allowed") || true;

// "Blackprint.onModuleConflict" need to be replaced if you want to use this to solve conflicting nodes
// Use below if you want to always use the newest module
// Blackprint.onModuleConflict = async map => Object.entries(map).forEach(v => v.useOld = false);

let engineStartup = Date.now();
io.on('connection', client => {
	// Relay data sync between instance (remote engine and the control)
	client.on('relay', data => remote.onSyncIn(data));     // Sketch -> Engine
	remote.onSyncOut = data => client.emit('relay', data); // Engine -> Sketch

	console.log('Remote control: connected');
	client.on('disconnect', () => console.log('Remote control: disconnected'));
});

console.log(`Waiting connection on port: ${port}`);
httpServer.listen(port);
```
</details>

# License
MIT License