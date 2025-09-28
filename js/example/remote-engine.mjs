// bun run --preload ../../../engine-js/bun-loader.mjs ./remote-engine.mjs
// node --enable-source-maps --import ../../../engine-js/nodejs-loader.js ./remote-engine.mjs

// Comment this if you want to use published version of the module
import '../../../dist/engine.min.js';
import '../../../dist/remote-control.min.js';

// import '@blackprint/engine';
// import '@blackprint/remote-control';

import { createServer } from "http";
import { Server } from "socket.io";

globalThis.window = globalThis;

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
	console.log(`${list.length} new module has been added`);

	if(failed.length !== 0)
		console.log(`Failed to add ${failed.length} new module`);
});
remote.on('module.remove', ({ list }) => {
	console.log(`${list.length} module has been removed, triggered by remote sync`);
});
remote.on('disabled', ()=> console.log('Due to some reason, remote control was disabled'));

// Allow import/module sync (return true = allow, false = disable sync)
remote.onImport = v=> console.log("Remote import is allowed") || true;
remote.onModule = v=> console.log("Remote module is allowed") || true;

// "Blackprint.onModuleConflict" need to be replaced if you want to use this to solve conflicting nodes
// Use below if you want to always use the newest module
// Blackprint.onModuleConflict = async map => Object.entries(map).forEach(v => v.useOld = false);

let engineStartup = Date.now();
io.on('connection', client => {
	client.on('relay', data => remote.onSyncIn(data));
	remote.onSyncOut = data => client.emit('relay', data);

	console.log('Remote control: connected');
	client.on('disconnect', () => {
		console.log('Remote control: disconnected');
	});

	setTimeout(() => {
		client.emit('startup-time', engineStartup);
	}, 1000);
});

console.log(`Waiting connection on port: ${port}`);
httpServer.listen(port);

// Blackprint.loadModuleFromURL([
// 	"http://localhost:6789/dist/nodes-console.mjs",
// 	"http://localhost:6789/dist/nodes-data.mjs",
// ]);

// Blackprint.loadModuleFromURL([
// 	"http://localhost:6789/dist/nodes-example.mjs",
// ]);