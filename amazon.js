var fs = require("fs");
var _ = require("lodash");
var AWS = require('aws-sdk');
AWS.config.loadFromPath('./config.json');
var s3 = new AWS.S3(); 
var AWSbucket = "kriek";
var request = require("request");

/**
 * Upload file to S3 bucket
 * Params should include bucket, key and mime parameters
 */
function uploadS3(params,callback) {
	var bucket = params.bucket ? params.bucket : AWSbucket;
	var data = {
		Bucket: bucket,
		Key: params.key,
		ContentType: params.mime
	};
	//read file flom local folder if any
	if(params.save) {
		data.Body = fs.readFileSync(params.save);
	}
	
	if(params.body) {
		data.Body = params.body;
	}
	s3.putObject(data, function(err, retData) {
	    if (err) {
	      console.log("Error uploading data: ", err);
	    } else {
	      	//delete file from local folder
	      	if(params.save) {
	      		fs.unlinkSync(params.save);
	      	}
			//if there are multiply files uplad to AWS wait till all finished
			var url = "https://s3-eu-west-1.amazonaws.com/"+bucket+"/"+data.Key;
			console.log("File uploaded to S3: ", url);
			callback({id:params.id,files:url},callback);
	  	}
	});
}

/**
 * Copy one or more files from one bucket to another.
 * params should include Bucket, Key and CopySource parameters
 * If the CopySource is not a direct reference to a file (it doesn't have a .something extension at the end) then a whole folder will be copied
 * In this case Key can just be ""
 */
function copyS3(params, callback) {
	if (_.last(params.CopySource.split("/")).indexOf(".") > -1) {
		console.log("Single S3 file copy");
		s3.copyObject(params, callback);
	} else {
		console.log("Multiple S3 file copies");
		var copySource = params.CopySource.split("/");
		s3.listObjects({
			Prefix: copySource.splice(1).join("/"),
			Bucket: copySource[0]
		}, function(err, data) {
			if (err) {
				console.log(err);
				return;
			}

			var total = data.Contents.length;
			var current = 0;

			for (var i = 0; i < total; i++) {
				(function() {
					var key = data.Contents[i].Key;
					console.log("Copying " + params.CopySource.split("/")[0] + "/" + key);
					var targetKey = data.Contents[i].Key.split("/");
					targetKey = targetKey.splice(1).join("/");
					s3.copyObject({
						Bucket: params.Bucket ? params.Bucket : "kriek",
						Key: params.Key === "" ? targetKey : params.Key + "/" + targetKey,
						CopySource: "www.autogrid.de/" + key
					}, function() {
						if (++current === total) {
							callback(err, data);
						}
					});
				})(i);
			}
		});
	}
}

/**
 * Set up a cloudflare rule for a bucket, so it can be accessed as something.autogrid.de
 */
function cloudflare(username) {
	var credentials = fs.readFile("config.json", function(err, credentials) {
		if (err) console.log(err);
		else {
			credentials = JSON.parse(credentials);
			request({
				method: "POST",
				url: "https://www.cloudflare.com/api_json.html",
				form: {
					"act": "rec_new",
					"a": "rec_new",
					"tkn": credentials.cloudflare.token,
					"email": credentials.cloudflare.email,
					"type": "CNAME",
					"z": "autogrid.de",
					"name": username,
					"content": username+".autogrid.de.s3-website-eu-west-1.amazonaws.com",
					"ttl": "1"
				}
			}, function(err, res) {
				if (err) console.log(err);
				else console.log("Added cloudflare rule. Now modifying service mode...");
				var body = JSON.parse(res.body);
				var rec_id = body.response.rec.obj.rec_id;
				request({
					method: "POST",
					url: "https://www.cloudflare.com/api_json.html",
					form: {
						"act": "rec_edit",
						"a": "rec_edit",
						"id": rec_id,
						"tkn": credentials.cloudflare.token,
						"email": credentials.cloudflare.email,
						"type": "CNAME",
						"z": "autogrid.de",
						"name": username,
						"content": username+".autogrid.de.s3-website-eu-west-1.amazonaws.com",
						"ttl": "1",
						"service_mode": "1"
					}
				}, function(err, res) {
					if (err) console.log(err);
					else console.log("Modified cloudflare service mode.");
				});
			});
		}
	});

}


/**
 * Set up everything needed for a new account. Copy all files from the ciocattino repository, create new bucket, create cloudflare rule
 */
function newAccount(clientName, callback) {
	var bucketName = clientName + ".autogrid.de";
	//Create new Bucket
	s3.createBucket({
		Bucket: bucketName,
		CreateBucketConfiguration: {
		  LocationConstraint: 'eu-west-1'
		},
	}, function(err, res) {
		if (err) console.log(err);
		console.log("Created Bucket");
		//Set the newly created Bucket's ACL
		s3.putBucketPolicy({
			Bucket: bucketName,
			Policy: JSON.stringify({
			    "Version": "2012-10-17",
			    "Statement": [
			        {
			            "Sid": "PublicReadForGetBucketObjects",
			            "Effect": "Allow",
			            "Principal": "*",
			            "Action": ["s3:GetObject"],
			            "Resource": "arn:aws:s3:::"+bucketName+"/*"
			        }
			    ]
			})
		}, function(err, res) {
			if (err) console.log(err);
			console.log("Bucket Policy change: ", res);
			//Set Website settings for the new bucket
			s3.putBucketWebsite({
				Bucket: bucketName,
				WebsiteConfiguration: {
				    IndexDocument: {
				     	Suffix: 'index.html'
				    }
			  	}
			}, function(err, res) {
				if (err) console.log(err);
				console.log("Bucket Website change: ", res);
				//Copy all files from the last ciocattino build
				copyS3({
					Bucket: bucketName,
					Key: "",
					CopySource: "www.autogrid.de/ciocattino"
				}, function(err, res) {
					if (err) console.log(err);
					console.log("Copied ciocattino");
					//Create cloudflare rule
					cloudflare(clientName);
				});
			});

		});

	});
}

module.exports = {
	/**
	 * Cache data of a given dealer
	 */
	upload: function(params, callback) {
		uploadS3(params, function(r) {
			callback(r);
		});
	},

	copy: function(params, callback) {
		copyS3(params, function(err, res) {
			callback(err, res);
		});
	},

	newAccount: function(clientName, callback) {
		newAccount(clientName, function(r) {
			callback(r);
		});
	}
};