
var pouch = require('pouchdb');
var utils = require('utils');

module.exports =  function(url, log, callback){
	try
	{
		pouch(url, utils.safe(callback, function(error, db){
			if(error)
			{
				log('error getting db: ' + url + ' retrying in 10 seconds');
				setTimeout(utils.safe(callback, function(){
					module.exports(url, log, callback);
				}), 10000);
			}
			else
			{
				callback(null, db);
			}
		}));
	}
	catch(e)
	{
		log('error getting db: ' + url + ' retrying in 10 seconds');
		setTimeout(utils.safe(callback, function(){
				module.exports(url, log, callback);
		}), 10000);
	}
};