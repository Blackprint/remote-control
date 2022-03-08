let fs = require('fs');
fs.mkdirSync('./dist');

// Copy file to dist folder
var temp = fs.readFileSync('../../dist/remote-control.min.js', 'utf8');
fs.writeFileSync('./dist/remote-control.min.js', temp);

var temp = fs.readFileSync('../../dist/remote-control.min.js.map', 'utf8');
fs.writeFileSync('./dist/remote-control.min.js.map', temp);