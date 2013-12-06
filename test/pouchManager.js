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

var serverURL = 'http://admin:password@localhost:5985';



describe('data', function () {
	'use strict';
	it('should be able to add a database', function(done){
		var log  = masterLog.wrap('1');
		var onDone = function(err){
			if(err)
			{
				log.error(err);
			}
			done(err);
		};

		var queue = processorQueue(processor(function(id, item, log, callback){
			callback(null, id, item);
		}));
		
		var testDb = pouchManager.newDatabase('test', 'http://test.tre/test' , {waitForInitialReplicate: false}, log.wrap('new database'));
		assert.ok(pouchManager.databases.test);
		testDb.on('setupComplete', function(){
			var testService = pouchManager.newService('test', 'test' , [queue], {}, log.wrap('new Service'));
			assert.ok(pouchManager.services.test);
			testService.on('setupComplete', function(){
				pouchManager.close(onDone);
			});
		});

	});



	it('should be able to create a view', function(done){
		var log  = masterLog.wrap('2');
		var onDone = function(err){
			if(err)
			{
				log.error(err);
			}
			done(err);
		};
		var sourceDb = pouchManager.newDatabase('view_source', null, {localOnly: true, wipeLocal: true}, log.wrap('new source db'));

		var view = pouchManager.newView('my_view', [{databaseName: 'view_source', generatorFunction: function(viewDB, seq, change, stage, mlog, cbk){
			var item = change.doc;
			assert.equal(item._id, 'testDoc');
			var newViewItem = {
				_id: 'testDoc',
				fullName: item.firstName + " " + item.surname
			};
			viewDB.put(newViewItem, mlog.wrap('viewDB.put'), utils.cb(cbk, function(){
				cbk();
			}));

		}}], {}, log.wrap('new View'));

		sourceDb.put({_id: 'testDoc', firstName: 'james', surname: 'wood'}, log.wrap('save doc'), utils.cb(onDone, function(){
			log('saved');
		}));

		view.db.changes({
			continuous: true,
			include_docs: true,
			onChange: function(){
				onDone();
			}
		}, function(){
			log('changes set up');
		});


	});
});