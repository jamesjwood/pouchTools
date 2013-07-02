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

var masterLog = utils.log().wrap('pouchManager');

var lib = require('../src/designDoc.js');

var pouch = require('pouchdb');
var nano = require('nano');

var serverURL = 'http://admin:password@localhost:5984';

describe('designDoc', function () {
	'use strict';

	before(function(done){
		var service = nano(serverURL);

		async.forEachSeries(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], function(name, cbk){
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
	});

	it('1: should return a doc', function () {

		var log = masterLog.wrap('1');

		var typeSpecs = [
		{
			type: 'user',
			editors: [],
			contributors: []	
		}
		];
		var doc = lib(typeSpecs);
		assert.ok(doc);

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
		var designDoc = lib(typeSpecs);


		pouch(serverURL + 'test_designdoc_2', utils.cb(onDone, function(db){
			db.put(designDoc, utils.cb(onDone, function(){
				db.put({_id: 'notype', signature: {}}, utils.safe(onDone, function(error){
					assert.ok(error);
					assert.equal('Must have a type', error.reason);
					done();
				}));
			}))
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
		var designDoc = lib(typeSpecs);


		pouch(serverURL + 'test_designdoc_3', utils.cb(onDone, function(db){
			db.put(designDoc, utils.cb(onDone, function(){
				db.put({_id: 'nosignature', type: 'user'}, utils.safe(onDone, function(error){
					assert.ok(error);
					assert.equal('Must have a signature', error.reason);
					done();
				}));
			}))
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
		}
		];
		var designDoc = lib(typeSpecs);


		pouch(serverURL + 'test_designdoc_4', utils.cb(onDone, function(db){
			db.put(designDoc, utils.cb(onDone, function(){
				db.put({_id: 'nosignature', type: 'notuser', signature: {}}, utils.safe(onDone, function(error){
					assert.ok(error);
					assert.equal('type not allowed', error.reason);
					done();
				}));
			}))
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
			editors: ['testEditor'],
			contributors: ['testContributor']	
		}
		];
		var designDoc = lib(typeSpecs);


		pouch(serverURL + 'test_designdoc_5', utils.cb(onDone, function(db){
			db.put(designDoc, utils.cb(onDone, function(){
				db.put({_id: 'notUser', type: 'user', signature: {id: 'noone'}}, utils.safe(onDone, function(error){
					assert.equal('you must be an editor or contributor to create new record', error.reason);
					assert.ok(error);
					done();
				}));
			}))
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
			editors: ['testEditor'],
			contributors: ['testContributor']	
		}
		];
		var designDoc = lib(typeSpecs);


		pouch(serverURL + 'test_designdoc_6', utils.cb(onDone, function(db){
			db.put(designDoc, utils.cb(onDone, function(){
				db.put({_id: 'notUser', type: 'user', signature: {id: 'testContributor'}}, utils.safe(onDone, function(error){
					assert.ifError(error);
					done();
				}));
			}))
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
			editors: ['testEditor'],
			contributors: ['testContributor']	
		}
		];
		var designDoc = lib(typeSpecs);


		pouch(serverURL + 'test_designdoc_7', utils.cb(onDone, function(db){
			db.put(designDoc, utils.cb(onDone, function(){
				db.put({_id: 'notUser', type: 'user', signature: {id: 'testEditor'}}, utils.safe(onDone, function(error){
					assert.ifError(error);
					done();
				}));
			}))
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
			editors: ['testEditor'],
			contributors: ['testContributor', 'testContributor2']	
		}
		];
		var designDoc = lib(typeSpecs);


		pouch(serverURL + 'test_designdoc_8', utils.cb(onDone, function(db){
			db.put(designDoc, utils.cb(onDone, function(){
				db.put({_id: 'notUser', type: 'user', signature: {id: 'testContributor'}}, utils.safe(onDone, function(error, response){
					assert.ifError(error);
					db.put({_id: 'notUser', _rev: response.rev,  type: 'user', signature: {id: 'testContributor2'}}, utils.safe(onDone, function(error){
						assert.ok(error);
						assert.equal('contributors can only update their own records', error.reason);
						done();
					}));
				}));
			}))
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
			editors: ['testEditor'],
			contributors: ['testContributor', 'testContributor2']	
		}
		];
		var designDoc = lib(typeSpecs);


		pouch(serverURL + 'test_designdoc_9', utils.cb(onDone, function(db){
			db.put(designDoc, utils.cb(onDone, function(){
				db.put({_id: 'notUser', type: 'user', signature: {id: 'testContributor'}}, utils.safe(onDone, function(error, response){
					assert.ifError(error);
					db.put({_id: 'notUser', _rev: response.rev,  type: 'user', signature: {id: 'testContributor'}}, utils.safe(onDone, function(error){
						assert.ifError(error);
						done();
					}));
				}));
			}))
		}));
	});

	it('10: should allow updates to contributors', function (done) {
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
			editors: ['testEditor'],
			contributors: ['testContributor', 'testContributor2']	
		}
		];
		var designDoc = lib(typeSpecs);


		pouch(serverURL + 'test_designdoc_10', utils.cb(onDone, function(db){
			db.put(designDoc, utils.cb(onDone, function(){
				db.put({_id: 'notUser', type: 'user', signature: {id: 'testContributor'}}, utils.safe(onDone, function(error, response){
					assert.ifError(error);
					db.put({_id: 'notUser', _rev: response.rev,  type: 'user', signature: {id: 'testEditor'}}, utils.safe(onDone, function(error){
						assert.ifError(error);
						done();
					}));
				}));
			}))
		}));
	});



});