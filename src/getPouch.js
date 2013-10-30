
var pouch = require('pouchdb');
var utils = require('utils');

module.exports =  function(url, log, callback){

	pouch(url, utils.safe(callback, function(error, db){
		if(error)
		{
			log('error getting db: ' + url);
			log.error(error);
			log('retrying in 10 seconds');
			setTimeout(utils.safe(callback, function(){
				module.exports.getPouch(url, log, callback);
			}), 10000);
		}
		else
		{
			callback(null, db);
		}
	}));
};