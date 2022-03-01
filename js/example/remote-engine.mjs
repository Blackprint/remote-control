// node --no-warnings --loader ../../engine-js/es6-https-loader.mjs ./example/remote-engine.mjs

import '../../../dist/engine.min.js';
import '../../../dist/remote-control.min.js';
import { createServer } from "http";
import { Server } from "socket.io";

globalThis.window = globalThis;
globalThis.fetch = await import('node-fetch');
globalThis.crypto = (await import('crypto')).webcrypto;

let port = 2345;
let httpServer = createServer();
let io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:6789", "https://blackprint.github.io"],
  }
});

Blackprint.allowModuleOrigin('*'); // Allow load from any URL (localhost/https only)

let instance = new Blackprint.Engine();
let remote = new Blackprint.RemoteEngine(instance);

// Allow import/module sync
remote.onImport = v=> true;
remote.onModule = v=> true;

io.on('connection', client => {
	client.on('relay', data => remote.onSyncIn(data));
	remote.onSyncOut = data => client.emit('relay', data);

	console.log('Remote control: connected');
	client.on('disconnect', () => console.log('Remote control: disconnected'));
});

console.log(`Waiting connection on port: ${port}`);
httpServer.listen(port);