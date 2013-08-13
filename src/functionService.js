var events = require('events');
var utils = require('utils');
var jsonCrypto = require('jsonCrypto');
var changeQueue = require('./changeQueue.js');
var changeProcessor = require('./changeProcessor.js');

module.exports = function(pouch, f, log){

	var fetchCheckpoint = function(id, log, callback) {
		log('getting checkpoint');
		target.get(id, function(err, doc) {
			if (err && err.status === 404) {
				log('could not get checkpoint with id: ' + id);
				callback(null, 0);
			} else {
				log('got checkpoint at:' + doc.last_seq);
				callback(null, doc.last_seq);
			}
		});
	};

	var writeCheckpoint = function(id, checkpoint, log, callback) {
		var check = {
			_id: id,
			type: 'checkpoint',
		};
		log('checking for existing checkpoint: ' + checkpoint);
		target.get(check._id, function(err, doc) {
			if(err)
			{
				if(err.status !== 404)
				{
					log.error(err);
					callback(err);
					return;
				}
			}
			if (doc && doc._rev) {
				log('existing checkpoint at : ' + doc.last_seq);
				check = doc;
				check.editor = certificate.name;
				if(doc.last_seq === checkpoint)
				{
					callback();
					return;
				}
			}
			else
			{
				log('no existing checkpoint');
				check.creator = certificate.name;
			}
			check.last_seq= checkpoint;
			var signedCheck = jsonCrypto.signObject(check, privatePEMBuffer, certificate, false, log.wrap('signing checkpoint'));
			log.dir(signedCheck);
			target.put(signedCheck, utils.cb(callback, function(doc) {
				log('wrote checkpoint: ' + checkpoint);
				callback();
			}));
		});
	};

	var processor = changeProcessor(function(seq, change, processLog, callback){
		onChange(change, processLog, utils.cb(callback, function(){
			callback();
			that.changeDone(seq, change);
		}));
	});

	var queue = changeQueue(processor);


	var that = changeService(pouch, fetchCheckpoint, writeCheckpoint, queue, setupLog.wrap('changeService'));
	return that;
}