// node ./example/relay-server.js

let port = 2345;
let connectedTime = new Map();
let httpServer = require('http').createServer();
let io = require('socket.io')(httpServer, {
  cors: { origin: ["http://localhost:6789", "https://blackprint.github.io"] }
});

io.on('connection', client => {
	let userId = Math.random() * 1000 | 0;
	connectedTime.set(client, Date.now());

	client.on('relay', data => {
		// Let's change the UserId of this client
		data.uid = userId;
		client.broadcast.emit('relay', data);
	});

	client.broadcast.emit('user-connect', { userId });
	client.on('disconnect', () =>{
		connectedTime.delete(client);
	    client.broadcast.emit('user-disconnect', { userId });
	});

	// client.emit('startup-time', engineStartup);
});

console.log(`Waiting connection on port: ${port}`);
httpServer.listen(port);