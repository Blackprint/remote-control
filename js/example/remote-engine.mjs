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
remote.on('module.add', ({ list }) => {
	console.log(`Adding ${list.length} new module, triggered by remote sync`);
});
remote.on('module.added', ({ list, failed }) =>{
	console.log(`${list.length} new module has been added`)

	if(failed.length !== 0)
		console.log(`Failed to add ${failed.length} new module`)
});
remote.on('module.remove', ({ list }) => {
	console.log(`${list.length} module has been removed, triggered by remote sync`);
});
remote.on('disabled', ()=> console.log('Due to some reason, remote control was disabled'));

// Allow import/module sync (return true = allow, false = disable sync)
remote.onImport = v=> console.log("Remote import is allowed") || true;
remote.onModule = v=> console.log("Remote module is allowed") || true;

// This need to be replaced if you want to use this to solve conflicting nodes
Blackprint.onModuleConflict = async (namespace, old, now) => {};

let engineStartup = Date.now();
io.on('connection', client => {
	client.on('relay', data => remote.onSyncIn(data));
	remote.onSyncOut = data => client.volatile.emit('relay', data);

	console.log('Remote control: connected');
	client.on('disconnect', () => console.log('Remote control: disconnected'));

	setTimeout(() => {
		client.emit('startup-time', engineStartup);
	}, 1000);
});

console.log(`Waiting connection on port: ${port}`);
httpServer.listen(port);