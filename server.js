var Cantrip = require("Cantrip");
var upload = require("./index.js");


Cantrip.special("/upload", upload);
Cantrip.start();