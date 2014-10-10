var Cantrip = require("Cantrip");
var fs = require("fs");
var upload = require("./index.js");


Cantrip.special("/upload", upload);
Cantrip.start();