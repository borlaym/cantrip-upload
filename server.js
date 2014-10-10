var Cantrip = require("Cantrip");
var auth = require("cantrip-auth");
var fs = require("fs");
var upload = require("./index.js");

Cantrip.use(auth);

Cantrip.special("/upload", upload);

Cantrip.options.https = {
	key: fs.readFileSync(process.env["HOME"] + '/.canvas/server.key', 'utf8'),
	cert: fs.readFileSync(process.env["HOME"] + '/.canvas/server.crt', 'utf8')
};

Cantrip.special("/login", function(req, res, next) {
	res.body.id = req.body._id;
	next();
});


Cantrip.start();