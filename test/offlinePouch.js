/*jslint node: true */
/*global describe */
/*global it */
/*global before */
/*global after */


var assert = require('assert');
var utils = require('utils');
var events = require('events');
var sinon = require('sinon');
var rootDir;
var pouch = require('pouchdb');
if (typeof window != 'undefined') {
    rootDir = '';

} else {
    rootDir = 'stage/';
}

var async = require('async');

var masterLog = utils.log().wrap('offlinePouch');

var lib = require('../src/offlinePouch.js');

var serverURL = 'http://admin:password@localhost:5985';
var noServerURL = 'http://noserver/nodb';

var jsonCrypto = require('jsonCrypto');


var EXPONENT = 65537;
var MODULUS = 512;

var userKeyPair = jsonCrypto.generateKeyPEMBufferPair(MODULUS, EXPONENT);
var userCertificate = jsonCrypto.createCert(userKeyPair.publicPEM);


describe('offlinePouch', function() {
    'use strict';
    var cleanDB = function(done) {

        async.forEachSeries(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], function(name, cbk) {

            pouch.destroy(serverURL + '/test_offlinepouch_' + name, function(error, body) {
                pouch.destroy(rootDir + 'test_offlinepouch_' + name, function(error2, body2) {
                    cbk();
                });
            });
        }, function(error) {
            done(error);
        });
    };




    before(function(done) {
        cleanDB(function() {
            done();
        });
    });

    /*
    it('4: if offline not supported should open server', function(done) {
        var log = masterLog.wrap('4');
        var onDone = function(error) {
            if (error) {
                log.error(error);
            }
            lib.offlineSupported.restore();
            done(error);
        };

        sinon.stub(lib, 'offlineSupported', function() {
            return false;
        });

        var offlinePouch = lib('test_offlinepouch_4', serverURL + '/test_offlinepouch_4', {
            retryDelay: 2
        }, log.wrap('creating offline pouch'));
        offlinePouch.on('setupComplete', function() {
            offlinePouch.dispose(onDone);
        });
    });

    it('5: if offline supported should create local db, should be able to delete it', function(done) {
        var log = masterLog.wrap('5');
        var onDone = function(error) {
            if (error) {
                log.error(error);
            }
            done(error);
        };
        this.timeout(10000);

        lib.offlineSupported = function() {
            return true;
        };

        var offlinePouch3;
        var offlinePouch2;
        var offlinePouch;

        var serverDBUrl = serverURL + '/test_offlinepouch_5';

        pouch.destroy(serverDBUrl, utils.safe(onDone, function() {
            pouch(serverDBUrl, utils.cb(onDone, function(serverDb) {
                serverDb.put({
                    _id: 'testdoc'
                }, utils.cb(onDone, function() {
                    var offlinePouchLog = log.wrap('offlinePouch');
                    var offlinePouch = lib('test_offlinepouch_5', serverDBUrl, {
                        retryDelay: 2,
                        waitForInitialReplicate: true
                    }, log.wrap('creating offline pouch'));
                    utils.log.emitterToLog(offlinePouch, offlinePouchLog);
                    offlinePouch.on('downUpToDate', function() {
                        offlinePouch.get('testdoc', utils.cb(onDone, function(doc) {
                            assert.equal('testdoc', doc._id);
                            offlinePouch.wipeLocalAndDispose(log.wrap('wipeLocal'), utils.cb(onDone, function() {
                                offlinePouch2 = lib('test_offlinepouch_5', serverDBUrl, {
                                    retryDelay: 2,
                                    waitForInitialReplicate: false
                                }, log.wrap('creating offline pouch2'));
                                utils.log.emitterToLog(offlinePouch2, log.wrap('offlinePouch2'));
                                log('getting test doc (should be deleted)');
                                offlinePouch2.get('testdoc', utils.safe(onDone, function(error, doc) {
                                    assert.ok(error);
                                    assert.equal(error.reason, 'missing');
                                    onDone();

                                }));
                            }));
                        }));
                    });
                }));
            }));
        }));
    });

    */
    it('7: should create docLocations and replicate them', function(done) {
        var log = masterLog.wrap('7');
        var onDone = function(error) {
            if (error) {
                log.error(error);
            }
            done(error);
        };
        this.timeout(10000);

        lib.offlineSupported = function() {
            return true;
        };
        var serverDBUrl = serverURL + '/test_offlinepouch_7';


        pouch.destroy(serverDBUrl, utils.safe(onDone, function() {
            pouch(serverDBUrl, utils.cb(onDone, function(serverDb) {

                var offlinePouch = lib('test_offlinepouch_7', serverDBUrl, {
                    retryDelay: 2,
                    waitForInitialReplicate: false,
                    continuous: true,
                    useDocLocations: true,
                    docLocationCert: userCertificate,
                    docLocationPrivatePEMBuffer: userKeyPair.privatePEM
                }, log.wrap('creating offline pouch'));


                utils.log.emitterToLog(offlinePouch, log.wrap('offlinePouch'));

                offlinePouch.on('error', onDone);

                offlinePouch.put({
                    _id: 'testdoc2'
                }, utils.cb(onDone, function() {
                    log('saved local doc');
                    log('setting up changes');
                    var changes = serverDb.changes({
                        continuous: true,
                        onChange: function(change) {
                            log('CHANGE DETECTED');
                            if (change.id === 'testdoc2_locations') {
                                log('closing');
                                changes.cancel();
                                offlinePouch.dispose(utils.cb(onDone, function() {
                                    onDone();
                                }));
                            }
                        }
                    });
                }));
            }));
        }));
    });

    /*
    it('6: if offline, should be able to start using anyway', function(done) {
        var log = masterLog.wrap('6');
        var onDone = function(error) {
            if (error) {
                log.error(error);
            }
            if (lib.offlineSupported.restore) {
                lib.offlineSupported.restore();
            }
            done(error);
        };

        sinon.stub(lib, 'offlineSupported', function() {
            return true;
        });

        var offlinePouch = lib('test_offlinepouch_6', noServerURL, {
            retries: -1,
            retryDelay: 200,
            waitForInitialReplicate: false
        }, log.wrap('creating offline pouch'));

        offlinePouch.on('setupComplete', function() {
            offlinePouch.put({
                _id: 'testdoc2'
            }, utils.cb(onDone, function() {
                offlinePouch.dispose(utils.cb(onDone, function() {
                    onDone();
                }))
            }));
        });

    });
*/
});