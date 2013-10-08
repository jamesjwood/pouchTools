var async = require('async');
var assert = require('assert');
var utils = require('utils');

var masterLog = utils.log().wrap('pouchService');

var processor = require('./../src/processor.js');
var processorQueue = require('./../src/processorQueue.js');

var lib = require('./../src/pouchService.js');

var jsonCrypto = require('jsonCrypto');


var localDbUrl;
var EXPONENT = 65537;
var MODULUS = 512;
var pouch = require('pouchdb');

if(typeof window != 'undefined')
{

	localDbUrl ='';

}
else
{
	localDbUrl = 'leveldb://stage/';
}

var rootKeyBufferPair = jsonCrypto.generateKeyPEMBufferPair(MODULUS, EXPONENT);
var rootCert = jsonCrypto.createCert('root', rootKeyBufferPair.publicPEM);

describe('pouchService', function () {

	var cleanDB = function(done){
		masterLog('cleaning');
		async.forEachSeries(['1'], function(name, cbk){
			pouch.destroy(localDbUrl + 'test_pouchService_' + name, function(error, body){
				cbk();
			});
		}, function(){
			masterLog('cleaned');
			done();
		});
	};

	before(function(done){
		cleanDB(function(){
			done();
		});
	});

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

		var checkpoint = 0;


		var queue = processorQueue(processor(function(seq, payload, state, mlog, callback){
			mlog('processor called');
			callback(null, payload);
		}));

		var dbName = localDbUrl + 'test_pouchService_1';

		pouch(dbName, utils.cb(onDone, function(db){
			var myService = lib('test_pouchService', db, db, [queue], {continuous: true},  log.wrap('changeServiceInit'));
			utils.log.emitterToLog(myService, log.wrap('service'));

			myService.on('setupComplete', utils.cb(onDone, function(){
				log('setup complete');
				myService.on('error', function(error){
					onDone(error);
				});

				log('submitting a new change');

				db.put({_id: 'mychange'}, function(error){
					if(error)
					{
						onDone(error);
						return;
					}
					log('submitted change');
				});
			}));

			myService.on('changeDone', utils.safe.catchSyncronousErrors(onDone, function(seq){
				assert.ok(seq);
				assert.equal(seq, 1);
				myService.cancel();
				onDone();
			}));
		}));
	});
});