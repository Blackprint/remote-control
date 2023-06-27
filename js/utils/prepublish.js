let fs = require('fs');
fs.mkdirSync('./dist');

// Copy file to dist folder
var temp = fs.readFileSync('../../dist/remote-control.min.js', 'utf8');
fs.writeFileSync('./dist/remote-control.min.js', temp);
var temp = fs.readFileSync('../../dist/remote-control.min.js.map', 'utf8');
fs.writeFileSync('./dist/remote-control.min.js.map', temp);

var temp = fs.readFileSync('../../dist/remote-control.sf.css', 'utf8');
fs.writeFileSync('./dist/remote-control.sf.css', temp);
var temp = fs.readFileSync('../../dist/remote-control.sf.css.map', 'utf8');
fs.writeFileSync('./dist/remote-control.sf.css.map', temp);

var temp = fs.readFileSync('../../dist/remote-control.sf.js', 'utf8');
fs.writeFileSync('./dist/remote-control.sf.js', temp);
var temp = fs.readFileSync('../../dist/remote-control.sf.js.map', 'utf8');
fs.writeFileSync('./dist/remote-control.sf.js.map', temp);