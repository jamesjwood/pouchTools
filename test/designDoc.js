/*jslint node: true */
/*global describe */
/*global it */
/*global before */
/*global after */



var assert = require('assert');
var utils = require('utils');
var events = require('events');
var sinon = require('sinon');
var pouch = require('pouchdb');

var async = require('async');

var masterLog = utils.log().wrap('designDoc');

var lib = require('../src/designDoc.js');

var pouch = require('pouchdb');
var nano = require('nano');

var serverURL = 'http://admin:password@localhost:5984';

var jsonCrypto = require('jsonCrypto');


var EXPONENT = 65537;
var MODULUS = 512;

var rootKeyBufferPair = jsonCrypto.generateKeyPEMBufferPair(MODULUS, EXPONENT);
var rootCert = jsonCrypto.createCert('root', rootKeyBufferPair.publicPEM);

var userKeyBufferPair = jsonCrypto.generateKeyPEMBufferPair(MODULUS, EXPONENT);
var userCert = jsonCrypto.createCert('user_1', userKeyBufferPair.publicPEM);

var signedUserCert = jsonCrypto.signObject(userCert, rootKeyBufferPair.privatePEM, rootCert,  true,masterLog);


var user2KeyBufferPair = jsonCrypto.generateKeyPEMBufferPair(MODULUS, EXPONENT);
var user2Cert = jsonCrypto.createCert('user_2', user2KeyBufferPair.publicPEM);

var signedUser2Cert = jsonCrypto.signObject(user2Cert, rootKeyBufferPair.privatePEM, rootCert,  true,masterLog);


var VALIDATE_PATH = __dirname + '/../src/validateDoc.js';
var RELATIVE_PATH = '/src/validateDoc.js';

describe('designDoc', function () {
	'use strict';

	before(function(done){
		var service = nano(serverURL);

		async.forEachSeries(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], function(name, cbk){
			service.db.get('test_designdoc_' + name, function(error, body){
				if(!error)
				{
					service.db.destroy('test_designdoc_' + name, cbk);
				}
				else
				{
					cbk();
				}
			});
		}, function(error){
			done(error);
		});
		assert.ok(rootCert);
		assert.ok(signedUserCert);
	});

	it('1: should return a doc', function (done) {
		assert.ok(rootCert);
		assert.ok(signedUserCert);
		var log = masterLog.wrap('1');
		var onDone = function(error){
			if(error)
			{
				log.error(error);
			}
			done(error);
		};
		var typeSpecs = [
		{
			type: 'user',
			editors: [],
			contributors: []	
		}
		];
		lib(VALIDATE_PATH, RELATIVE_PATH, typeSpecs, [signedUserCert], log.wrap('genrating design doc'), utils.cb(onDone, function(designDoc){
			assert.ok(designDoc);
			onDone();
		}));
		

	});

	it('2: should check for type', function (done) {
		var log = masterLog.wrap('2');

		var onDone = function(error){
			if(error)
			{
				log.error(error);
			}
			done(error);
		};

		var typeSpecs = [
		{
			type: 'user',
			editors: ['*'],
			contributors: []	
		}
		];
		lib(VALIDATE_PATH, RELATIVE_PATH, typeSpecs, [signedUserCert], log.wrap('genrating design doc'), utils.cb(onDone, function(designDoc){
			var testDoc = {
			_id: 'testDoc_1',
			creator: 'user_1'
		};
		testDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, signedUserCert, true, log);

		pouch(serverURL + 'test_designdoc_2', utils.cb(onDone, function(db){
			db.put(designDoc, utils.cb(onDone, function(){
				db.put(testDoc, utils.safe(onDone, function(error){
					assert.ok(error);
					assert.equal(0, error.reason.indexOf('Must have a type'));
					done();
				}));
			}));
		}));
		}));

		
	});


	it('3: should check for signature', function (done) {
		var log = masterLog.wrap('3');

		var onDone = function(error){
			if(error)
			{
				log.error(error);
			}
			done(error);
		};

		var typeSpecs = [
		{
			type: 'user',
			editors: ['*'],
			contributors: []	
		}
		];
		lib(VALIDATE_PATH, RELATIVE_PATH, typeSpecs, [signedUserCert], log.wrap('genrating design doc'), utils.cb(onDone, function(designDoc){
			var testDoc = {
				_id: 'user_3',
				creator: 'user_1'
			};


			pouch(serverURL + 'test_designdoc_3', utils.cb(onDone, function(db){
				db.put(designDoc, utils.cb(onDone, function(){
					db.put(testDoc, utils.safe(onDone, function(error){
						assert.ok(error);
						assert.equal(0, error.reason.indexOf('Must have a signature'));
						done();
					}));
				}));
			}));
		}));
	});

	it('4: should check for valid type', function (done) {
		var log = masterLog.wrap('4');

		var onDone = function(error){
			if(error)
			{
				log.error(error);
			}
			done(error);
		};

		var typeSpecs = [
		{
			type: 'user',
			editors: ['*'],
			contributors: []	
		}];
		lib(VALIDATE_PATH, RELATIVE_PATH, typeSpecs, [signedUserCert], log.wrap('genrating design doc'), utils.cb(onDone, function(designDoc){
			var testDoc = {
				_id: 'user_4',
				type: 'notuser',
				creator: 'user_1'
			};
			testDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, signedUserCert, true, log);

			
			pouch(serverURL + 'test_designdoc_4', utils.cb(onDone, function(db){
				db.put(designDoc, utils.cb(onDone, function(){
					db.put(testDoc, utils.safe(onDone, function(error){
						assert.ok(error);
						assert.equal(0, error.reason.indexOf('type not allowed'));
						done();
					}));
				}));
			}));
		}));

	
	});

	it('5: should deny if user is not in contributors or editors', function (done) {
		var log = masterLog.wrap('5');

		var onDone = function(error){
			if(error)
			{
				log.error(error);
			}
			done(error);
		};

		var typeSpecs = [
		{
			type: 'user',
			editors: [],
			contributors: []	
		}
		];

		lib(VALIDATE_PATH, RELATIVE_PATH, typeSpecs, [signedUserCert], log.wrap('genrating design doc'), utils.cb(onDone, function(designDoc){
			var testDoc = {
				_id: 'user_5',
				type: 'user',
				creator: 'user_1'
			};
			testDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, signedUserCert,  true, log);


			pouch(serverURL + 'test_designdoc_5', utils.cb(onDone, function(db){
				db.put(designDoc, utils.cb(onDone, function(){
					db.put(testDoc, utils.safe(onDone, function(error){
						assert.equal('the user user_1 is not an editor or contributor', error.reason);
						assert.ok(error);
						done();
					}));
				}));
			}));
		}));
	});

	it('6: should allow if user is in contributors', function (done) {
		var log = masterLog.wrap('6');

		var onDone = function(error){
			if(error)
			{
				log.error(error);
			}
			done(error);
		};

		var typeSpecs = [
		{
			type: 'user',
			editors: [],
			contributors: ['user_1']	
		}];
		
		lib(VALIDATE_PATH, RELATIVE_PATH, typeSpecs, [signedUserCert], log.wrap('genrating design doc'), utils.cb(onDone, function(designDoc){
			var testDoc = {
				_id: 'user_6',
				type: 'user',
				creator: 'user_1'
			};
			testDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, signedUserCert,  true, log);

			log(JSON.stringify(testDoc));
			pouch(serverURL + 'test_designdoc_6', utils.cb(onDone, function(db){
				db.put(designDoc, utils.cb(onDone, function(){
					db.put(testDoc, utils.safe(onDone, function(error){
						assert.ifError(error);
						done();
					}));
				}));
			}));
		}));
	});

	it('7: should allow if user is in editors', function (done) {
		var log = masterLog.wrap('7');

		var onDone = function(error){
			if(error)
			{
				log.error(error);
			}
			done(error);
		};

		var typeSpecs = [
		{
			type: 'user',
			editors: ['user_1'],
			contributors: []	
		}
		];

		lib(VALIDATE_PATH, RELATIVE_PATH, typeSpecs, [signedUserCert], log.wrap('genrating design doc'), utils.cb(onDone, function(designDoc){
			var testDoc = {
				_id: 'user_7',
				type: 'user',
				creator: 'user_1'
			};
			testDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, signedUserCert, true, log);



			pouch(serverURL + 'test_designdoc_7', utils.cb(onDone, function(db){
				db.put(designDoc, utils.cb(onDone, function(){
					db.put(testDoc, utils.safe(onDone, function(error){
						assert.ifError(error);
						done();
					}));
				}));
			}));
		}));

		
	});

	it('8: should only allow updates to the contributor', function (done) {
		var log = masterLog.wrap('8');

		var onDone = function(error){
			if(error)
			{
				log.error(error);
			}
			done(error);
		};

		var typeSpecs = [
		{
			type: 'user',
			editors: [],
			contributors: ['user_1', 'user_2']	
		}
		];

		lib(VALIDATE_PATH, RELATIVE_PATH, typeSpecs, [signedUserCert, signedUser2Cert], log.wrap('genrating design doc'), utils.cb(onDone, function(designDoc){
			var testDoc = {
				_id: 'user_8',
				type: 'user',
				creator: 'user_1'
			};
			var newDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, signedUserCert, true, log);
			testDoc.updated = 'updated';
			testDoc.editor = 'user_2';
			var updatedDoc = jsonCrypto.signObject(testDoc, user2KeyBufferPair.privatePEM, signedUser2Cert, true, log);

			log.dir(updatedDoc);
			pouch(serverURL + 'test_designdoc_8', utils.cb(onDone, function(db){
				db.put(designDoc, utils.cb(onDone, function(){
					log('saved design doc');
					db.put(newDoc, utils.safe(onDone, function(error, response){
						assert.ifError(error, 'error saving initial test doc');
						log('saved initial test doc');
						updatedDoc._rev = response.rev;
						db.put(updatedDoc, utils.safe(onDone, function(error2){
							assert.ok(error2, 'should have errored when updating doc');
							assert.equal('the user user_2 can only update their own records', error2.reason);
							done();
						}));
					}));
				}));
			}));
		}));
	});

	it('9: should allow updates to contributors', function (done) {
		var log = masterLog.wrap('9');

		var onDone = function(error){
			if(error)
			{
				log.error(error);
			}
			done(error);
		};

		var typeSpecs = [
		{
			type: 'user',
			editors: [],
			contributors: ['user_1']	
		}];
		lib(VALIDATE_PATH, RELATIVE_PATH, typeSpecs, [signedUserCert], log.wrap('genrating design doc'), utils.cb(onDone, function(designDoc){
			var testDoc = {
			_id: 'user_9',
			type: 'user',
			creator: 'user_1'
		};
		var newDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, signedUserCert, true, log);

		testDoc.updated = '2';
		testDoc.editor = 'user_1';

		var updatedDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, signedUserCert, true, log);

		pouch(serverURL + 'test_designdoc_9', utils.cb(onDone, function(db){
			db.put(designDoc, utils.cb(onDone, function(){
				db.put(newDoc, utils.safe(onDone, function(error, response){
					assert.ifError(error);
					updatedDoc._rev = response.rev;
					db.put(updatedDoc, utils.safe(onDone, function(error){
						assert.ifError(error);
						done();
					}));
				}));
			}));
		}));
	}));
});

	it('10: should allow updates to editors', function (done) {
		var log = masterLog.wrap('10');

		var onDone = function(error){
			if(error)
			{
				log.error(error);
			}
			done(error);
		};

		var typeSpecs = [
		{
			type: 'user',
			editors: ['user_2'],
			contributors: ['user_1']
		}
		];
		lib(VALIDATE_PATH, RELATIVE_PATH, typeSpecs, [signedUserCert,signedUser2Cert], log.wrap('genrating design doc'), utils.cb(onDone, function(designDoc){
			var testDoc = {
				_id: 'user_10',
				type: 'user',
				creator: 'user_1'
			};
			var newDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, signedUserCert, true, log);
			testDoc.editor = 'user_2';
			var updatedDoc = jsonCrypto.signObject(testDoc, user2KeyBufferPair.privatePEM, signedUser2Cert, true, log);

			pouch(serverURL + 'test_designdoc_10', utils.cb(onDone, function(db){
				db.put(designDoc, utils.cb(onDone, function(){
					db.put(newDoc, utils.safe(onDone, function(error, response){
						assert.ifError(error);
						updatedDoc._rev = response.rev;
						db.put(updatedDoc, utils.safe(onDone, function(error){
							assert.ifError(error);
							done();
						}));
					}));
				}));
			}));
		}));

		
	});

	it('11: should allow user certificates', function (done) {
		var log = masterLog.wrap('11');

		var onDone = function(error){
			if(error)
			{
				log.error(error);
			}
			done(error);
		};

		var typeSpecs = [
		{
			type: 'user',
			editors: ['user_1'],
			contributors: []
		}
		];

		lib(VALIDATE_PATH, RELATIVE_PATH, typeSpecs, [signedUserCert], log.wrap('genrating design doc'), utils.cb(onDone, function(designDoc){
			var testDoc = {
				_id: 'user_11',
				type: 'user',
				creator: 'user_1'
			};
			testDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, signedUserCert,  false, log);


			log.dir(testDoc);
			pouch(serverURL + 'test_designdoc_11', utils.cb(onDone, function(db){
				db.put(designDoc, utils.cb(onDone, function(){
					db.put(testDoc, utils.safe(onDone, function(error){
						assert.ifError(error);
						done();
					}));
				}));
			}));
		}));
	});
	/*
	it('12: should run custom check', function (done) {
		var log = masterLog.wrap('12');

		var onDone = function(error){
			if(error)
			{
				log.error(error);
			}
			done(error);
		};

		var typeSpecs = [
		{
			type: 'user',
			editors: ['user_1'],
			contributors: []
		}
		];

		var designDoc = lib(typeSpecs, [signedUserCert], function(){
			throw({forbidden: 'test'});
		});

		var testDoc = {
			_id: 'user_12',
			type: 'user',
			creator: 'user_1'
		};

		testDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, signedUserCert, true, log);

		pouch(serverURL + 'test_designdoc_12', utils.cb(onDone, function(db){
			db.put(designDoc, utils.cb(onDone, function(){
				db.put(testDoc, utils.safe(onDone, function(error){
					assert.ok(error,'should error from customCheck');
					assert.equal(error.reason, 'test');

					done();
				}));
			}));
		}));
	});
*/
});