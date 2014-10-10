var upload = require("./upload.js");

module.exports = function(req, res, next) {
	upload.upload(req, function(r) {
		res.body = r;
		next();
	});
};