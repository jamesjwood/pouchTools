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



describe('data', function() {
    'use strict';
    it('should be able to add a database', function(done) {
        var log = masterLog.wrap('1');
        var onDone = function(err) {
            if (err) {
                log.error(err);
            }
            done(err);
        };

        var queue = processorQueue(processor(function(id, item, log, callback) {
            callback(null, id, item);
        }));

        var testDb = pouchManager.newDatabase('test', 'http://test.tre/test', {
            waitForInitialReplicate: false
        }, log.wrap('new database'));
        assert.ok(pouchManager.databases.test);
        testDb.on('setupComplete', utils.safe(onDone, function() {
            var testService = pouchManager.newService('test', 'test', [queue], {continuous: true}, log.wrap('new Service'));
            assert.ok(pouchManager.services.test);
            testService.on('setupComplete', utils.safe(onDone, function() {
	            pouchManager.dispose(utils.cb(onDone, function() {
	                assert.ifError(pouchManager.services.test, 'should be null');
	                assert.ifError(pouchManager.databases.test, 'should be null');
	                onDone();
	            }));
            }));
        }));

    });

    /*

    it('should be able to create a view', function(done) {
        var log = masterLog.wrap('2');
        var onDone = function(err) {
            if (err) {
                log.error(err);
            }
            done(err);
        };
        var sourceDb = pouchManager.newDatabase('view_source', null, {
            localOnly: true,
            wipeLocal: true
        }, log.wrap('new source db'));

        var view = pouchManager.newView('my_view', [{
            databaseName: 'view_source',
            generatorFunction: function(viewDB, seq, change, stage, mlog, cbk) {
                var item = change.doc;
                assert.equal(item._id, 'testDoc');
                viewDB.get('testDoc', utils.safe(onDone, function(error, item) {
                    if (item) {
                        updatingViewItem = item;
                    } else {
                        updatingViewItem = {
                            _id: 'testDoc'
                        };
                    }
                    updatingViewItem.fullName = item.firstName + " " + item.surname
                    viewDB.put(updatingViewItem, mlog.wrap('viewDB.put'), utils.cb(cbk, function() {
                        cbk();
                    }));
                }));
            }
        }], {}, log.wrap('new View'));

        sourceDb.put({
            _id: 'testDoc',
            firstName: 'james',
            surname: 'wood'
        }, log.wrap('save doc'), utils.cb(onDone, function() {
            log('saved');
        }));

        view.db.changes({
            continuous: true,
            include_docs: true,
            onChange: function(change) {
                assert.equal(change.doc.fullName, 'james wood');
                view.dispose(utils.cb(onDone, function() {
                    onDone();
                }));
            }
        }, function() {
            log('changes set up');
        });


    });
*/
});
