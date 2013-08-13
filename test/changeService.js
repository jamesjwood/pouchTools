
 var assert = require('assert');
 var utils = require('utils');

 var masterLog = utils.log().wrap('pouchService');

 var processor = require('./../src/processor.js');
 var processorQueue = require('./../src/processorQueue.js');

 var lib = require('./../src/changeService.js');

var jsonCrypto = require('jsonCrypto');


var EXPONENT = 65537;
var MODULUS = 512;
 var pouch = require('pouchdb');
 var async = require('async');


var rootKeyBufferPair = jsonCrypto.generateKeyPEMBufferPair(MODULUS, EXPONENT);
var rootCert = jsonCrypto.createCert('root', rootKeyBufferPair.publicPEM);

 describe('pouchService', function () {
	var cleanDB = function(done){

    async.forEachSeries(['1'], function(name, cbk){
      pouch.destroy('stage/testService' + name, function(error, body){
       cbk();
      });
    }, function(){
		done();
    });
  };

  before(function(done){
    cleanDB(function(){
      done();
    });
  });
  after(function(done){
    cleanDB(done);
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


		var queue = processorQueue(processor(function(seq, payload, mlog, callback){
			mlog('processor called');
			callback(null, payload);
		}));

		pouch('stage/testService' + testNumber, utils.cb(onDone, function(db){
			var myService = lib('myservice', db, db, [queue], 2, 500, true, log.wrap('changeServiceInit'));
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

			myService.on('changeDone', function(){
				onDone();
			})
		}));
	});
});