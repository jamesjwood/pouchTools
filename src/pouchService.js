var events = require('events');
var utils = require('utils');
var jsonCrypto = require('jsonCrypto');

module.exports = function(id, pouch, checkpointPouch, privatePEMBuffer, certificate, onChange){

	var that = new events.EventEmitter();
	that.cancelled = false;
	var runLog = utils.log(that);

	var checkpointId = "serviceCheckpoint_" + id;

	var fetchCheckpoint = function(target, id, log, callback) {
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

	var writeCheckpoint = function(target, id, checkpoint, log, callback) {
		var check = {
			_id: id,
			last_seq: checkpoint,
			type: 'checkpoint',
		};
		log('checking for existing checkpoint: ' + checkpoint);
		target.get(check._id, function(err, doc) {
			if (doc && doc._rev) {
				check._rev = doc._rev;
				check.creator = doc.creator;
				log('existing checkpoint at : ' + doc.last_seq);
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
			var signedCheck = jsonCrypto.signObject(check, privatePEMBuffer, certificate, false, log.wrap('signing checkpoint'));
			log.dir(signedCheck);
			target.put(signedCheck, function(err, doc) {
				log('wrote checkpoint: ' + checkpoint);
				callback();
			});
		});
	};

	that.on('error', function(){
		that.cancel();
	});

	var foundCheckpointError = function(error){
		runLog.log('error getting initial checkpoint');
		runLog.error(error);
	};
	var changes;

	fetchCheckpoint(checkpointPouch, checkpointId, runLog.wrap('fetching initial checkpoint'), utils.safe(foundCheckpointError, function(error, target_seq){
		if(error)
		{
			log.dir(error);
			return;
		}
		runLog('got initial checkpoint');
		if(!that.cancelled)
		{
			var upTo = target_seq;
			changes = pouch.changes({
				continuous: true,
				since: target_seq,
				include_docs: true,
				onChange: function(change){
					var changeLog = runLog.wrap('processing change ' + change.seq);
					if(change.seq <= upTo)
					{
						changeLog('duplicate change');
						return;
					}
					upTo = change.seq;

					if(change.id.substring(0, 18) === 'serviceCheckpoint_')
					{
						changeLog('ignoring checkpoint change');
						return;
					}
					changeLog('start');
					var eachChangeDone  = function(error){
						if(error)
						{
							changeLog.error(error);
							return;
						}

						writeCheckpoint(checkpointPouch, checkpointId, change.seq, changeLog.wrap('writing checkpoint'), utils.cb(function(err){
							changeLog.error(err);
							return;
						},function(){
							changeLog('end');
							that.emit('changeProcessed', change);
						}));
					};


					utils.cb(eachChangeDone, function(){
						if(!that.cancelled)
						{
							changeLog('calling service function');
							onChange(change, changeLog.wrap('service function'), eachChangeDone);
						}
					})();
			}});	
		}
	}));

	that.cancel = function(){
		that.cancelled = true;
		that.removeAllListeners();
		if(changes)
		{
			changes.cancel();
		}
	};
	return that;
};