module.exports = {
	setup(instance, remotePort=2345, cors=[]){
		if(!globalThis.Blackprint?.RemoteEngine) require("@blackprint/remote-control");

		const { createServer } = require("http");
		const { Server } = require("socket.io");

		let httpServer = createServer();
		let io = new Server(httpServer, {
			cors: { origin: cors.map(v => v.trim()) }
		});

		let remote = new Blackprint.RemoteEngine(instance);
		remote.on('module.add', ({ list }) => {
			console.log(`BlackprintRC> Adding ${list.length} new module, triggered by remote sync`);
		});
		remote.on('module.added', ({ list, failed }) =>{
			console.log(`BlackprintRC> ${list.length} new module has been added`);

			if(failed.length !== 0)
				console.log(`BlackprintRC> Failed to add ${failed.length} new module`);
		});
		remote.on('module.remove', ({ list }) => {
			console.log(`BlackprintRC> ${list.length} module has been removed, triggered by remote sync`);
		});
		remote.on('disabled', ()=> console.log('BlackprintRC> Due to some reason, remote control was disabled'));

		// Allow import/module sync (return true = allow, false = disable sync)
		remote.onImport = v=> console.log("BlackprintRC> Remote import is allowed") || true;
		remote.onModule = v=> console.log("BlackprintRC> Remote module is allowed") || true;

		let engineStartup = Date.now();
		io.on('connection', client => {
			client.on('relay', data => remote.onSyncIn(data));
			remote.onSyncOut = data => client.emit('relay', data);

			console.log('BlackprintRC> Remote control: connected');
			client.on('disconnect', () => {
				console.log('BlackprintRC> Remote control: disconnected');
			});

			setTimeout(() => {
				client.emit('startup-time', engineStartup);
			}, 1000);
		});

		console.log(`BlackprintRC> Waiting connection on port: ${remotePort}`);
		httpServer.listen(remotePort);

		return remote;
	}
};