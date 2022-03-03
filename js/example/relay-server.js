// node ./example/relay-server.js

let port = 2345;
let httpServer = require('http').createServer();
let io = require('socket.io')(httpServer);
let connectedTime = new Map();

io.on('connection', client => {
	let userID = Math.random() * 1000 | 0;
	connectedTime.set(client, Date.now());

	client.on('relay', data => {
		// Let's change the UserID of this client
		data = JSON.parse(data);
		data.uid = userId;

		client.broadcast('relay', data);
	});

	client.broadcast('user-connect', { userID });
	client.on('disconnect', () =>{
		connectedTime.delete(client);
	    client.broadcast('user-disconnect', { userID });
	});

	// client.emit('startup-time', engineStartup);
});

console.log(`Waiting connection on port: ${port}`);
httpServer.listen(port);