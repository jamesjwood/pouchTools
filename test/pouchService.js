
 var assert = require('assert');
 var utils = require('utils');

 var masterLog = utils.log().wrap('pouchService');

 var lib = require('./../src/pouchService.js');

 var pouch = require('pouchdb');
 var async = require('async');

 describe('pouchService', function () {
	it('1: should process changes', function (done) {
		var testNumber = 1;
		var log = masterLog.wrap(testNumber);

		var onDone = function(error){
			if(error)
			{
				log.error(error);
			}			
			done(error);
		};

		pouch('stage/testService' + testNumber, utils.cb(onDone, function(db){
			var myService = lib('stage_testService_' + testNumber, db, db, function(change, callback){
				
				callback();
			});

			myService.on('error', function(error){
				onDone(error);
			});

			myService.on('changeProcessed', function(change){
				if(change.id === 'mychange')
				{
					db.get('serviceCheckpoint_stage_testService_1', utils.cb(onDone, function(doc){
						assert.equal(doc.last_seq, 1);
						onDone();
					}));
					
				}
			});

			utils.log.emitterToLog(myService, log.wrap('the service'));
			db.put({_id: 'mychange'}, function(error){
				if(error)
				{
					onDone(error);
				}
			});
		}));
	});
});