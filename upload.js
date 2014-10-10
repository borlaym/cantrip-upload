var Busboy = require('busboy');
var fs = require("fs");
var request = require("request");
var lwip = require('lwip');
var jpeg = require("jpegorientation");

var amazon = require('./amazon.js');
var returnFiles = {};

function waitForFiles(data, callback) {
	returnFiles[data.id].counter--;
	returnFiles[data.id].files.push(data.files);

	if(returnFiles[data.id].counter==0) {
		var temp = returnFiles[data.id].files;	
		delete returnFiles[data.id];	      	
		callback({"success": true,"images":temp});
	}
}

/**
 * Download file from URL
 */
function downloadFile(req,callback) {
	var params = {};

	if(req.body.url){
    	params.query = req.body.image;	
    	var url = req.body.url;
    } else {
    	callback({"error":"URL missing."}); 
    	return;
    }

	var filename = url.split('/');
	filename = filename[filename.length-1];

	var ext = filename.split('.');
    params.id = makeid(25);
    params.ext = ext[ext.length-1].toLowerCase();
    params.file = params.id;
    params.mime = 'image/'+params.ext;
    params.save = __dirname+"/temp/"+params.file+"."+params.ext;

    console.log(params);

	var r = request(url).pipe(fs.createWriteStream(params.save));
	r.on('finish', function () {
		changeImage(params,callback);
	});
}

/**
 * Image manipulation
 */
function changeImage(params,callback) {

	returnFiles[params.id] = {
		counter:1,
		files:[]
	};

	if(params.query) {
		for (var i = 0; i<params.query.length; i++) {
			openImages(params,i,callback);
		};
	}

	params.key = "images/"+params.file+"."+params.ext;
	amazon.upload(params,function(r) {
		waitForFiles(r, callback);
	});

}

function openImages(params,i,callback) {
	lwip.open(params.save, function(err, image){
		console.log(err);
		if(err!=undefined){ 
			return; 
		}
		console.log("number:" + i);
		returnFiles[params.id].counter++;
		var exe = cloneObj(params.query[i]);
		exe.params = cloneObj(params);
		imageChain(image,exe,callback);
	});
}


function smartResize(image,exe) {
	if(image.width() < image.height()) {
		exe.width = (exe.height/image.height())*image.width();
		return exe;
	} else {
		exe.height = (exe.width/image.width())*image.height();
		return exe;
	}
}

function imageChain(image,exe,callback) {

	if(exe.resize) {
		image.resize(exe.resize.width, exe.resize.height, 
			function(err, image){
			delete exe.resize;
			imageChain(image,exe,callback);
		});
	}
	else if(exe.smartresize) {
		exe.smartresize = smartResize(image,exe.smartresize);
		image.resize(exe.smartresize.width, exe.smartresize.height, 
			function(err, image){
			delete exe.smartresize;
			imageChain(image,exe,callback);
		});
	}
	else if(exe.crop) {
		image.crop(exe.crop.left, exe.crop.top, exe.crop.right, exe.crop.bottom,
			function(err, image){
			delete exe.crop;
			imageChain(image,exe,callback);
		});
	}
	else {
		exe.params.file = exe.file+"_"+exe.params.file;
		exe.params.save = __dirname+"/temp/"+exe.params.file+"."+exe.params.ext;
	    image.writeFile(exe.params.save, function(err){
	    	exe.params.key = "images/"+exe.params.file+"."+exe.params.ext;
	    	amazon.upload(exe.params,function(r) {
				waitForFiles(r, callback);
			});
	    });
	}

}

/**
 * Save file to local folder
 */
function saveFile(req,callback) {
	var params = {};

	if(req.query.image){
    	params.query = JSON.parse(req.query.image);	
    }


	var busboy = new Busboy({ headers: req.headers });
    busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
    	var ext = filename.split('.');
    	params.id = makeid(20);
    	params.ext = ext[ext.length-1].toLowerCase();
    	params.file = params.id;
    	params.mime = mimetype;
    	params.save = __dirname+"/temp/"+params.file+"."+params.ext;

    	file.pipe(fs.createWriteStream(params.save));
    });
    busboy.on('finish', function() {
    	jpeg.orientation(params.save, function(err, orientation) {
		    console.log(orientation); // --> "TopLeft"

		    if(orientation==6) {
		    	var degs = 90;
		    } else if (orientation==3) {
		    	var degs = 180;
		    } else if (orientation==8) {
		    	var degs = -90;
		    }

		    if(degs) {
				lwip.open(params.save, function(err, image){
					image.rotate(degs, function() {
						image.writeFile(params.save, function(err){
					       	changeImage(params,callback);
					    });
					})
				});
		    } else {
		    	changeImage(params,callback);
		    }
		});
	});
    return req.pipe(busboy);
}

/**
 * Create unique id
 */
function makeid(num)
{
    var text = "";
    var possible = "abcdefghijklmnopqrstuvwxyz0123456789";

    for( var i=0; i < num; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}
/**
 * Clone obj
 */
function cloneObj(obj) {
	console.log(obj);
	return JSON.parse(JSON.stringify(obj));
}

module.exports = {
	/**
	 * Modify image and save to S3
	 */
	upload: function(req,callback) {
		saveFile(req,function(r) {
			callback(r);
		});
	},
	image: function(req,callback) {
		downloadFile(req,function(r) {
			callback(r);
		});
	}
};