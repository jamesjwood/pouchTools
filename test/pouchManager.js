/*jslint node: true */
/*global describe */
/*global it */
/*global before */
/*global after */

var assert = require('assert');
var utils = require('utils');
var events = require('events');
var async = require('async');

var masterLog = utils.log().wrap('pouchManager');

var pouchManager = require('../src/pouchManager.js');
var processor = require('../src/processor.js');
var processorQueue = require('../src/processorQueue.js');

utils.log.emitterToLog(pouchManager, masterLog.wrap('the manager'));

var pouch = require('pouchdb');

var serverURL = 'http://admin:password@localhost:5984';



describe('data', function () {
	'use strict';
	it('should be able to add a database', function(done){
		var log  = masterLog.wrap('1');

		var queue = processorQueue(processor(function(id, item, log, callback){
			callback(null, id, item);
		}));
		
		var testDb = pouchManager.newDatabase('test', 'http://test.tre/test' , {waitForInitialReplicate: false}, log.wrap('new database'));
		assert.ok(pouchManager.databases.test);
		testDb.on('setupComplete', function(){
			var testService = pouchManager.newService('test', 'test' , [queue], {}, log.wrap('new Service'));
			assert.ok(pouchManager.services.test);
			testService.on('setupComplete', function(){
				done();
			});
		});

	});
});