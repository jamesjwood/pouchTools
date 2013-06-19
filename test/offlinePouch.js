/**
 * Created with JetBrains WebStorm.
 * User: jameswood
 * Date: 31/10/2012
 * Time: 09:42
 * To change this template use File | Settings | File Templates.
 */

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


var masterLog = utils.log().wrap('pouchManager');

var lib = require('../src/offlinePouch.js');

var serverURL = 'http://admin:password@localhost:5984';




describe('pouchManager', function () {
  'use strict';

   it('1: get server db should try to get server pouch', function (done) {
    var log = masterLog.wrap('1');
    var onDone = function(error){
      if(error)
      {
        log.error(error);
      }
      done(error);
    };

    var fakedb = {};

    var fakePouch = function(url, cbk){
      assert.equal('myurl', url);
      cbk(null, fakedb);
    };

    lib.getServerDb(fakePouch, 'myurl', 2, 2,log.wrap('getting serverDb'), utils.cb(onDone, function(db){
      assert.equal(fakedb, db);
      onDone();
    }));
  });  

   it('2: get server db should retry if db fails', function (done) {
    var log = masterLog.wrap('2');
    var onDone = function(error){
      if(error)
      {
        log.error(error);
      }
      done(error);
    };

    var fakedb = {};
    var count = 2;

    var fakePouch = function(url, cbk){
      assert.equal('http://myurl', url);
      if(count ===0)
      {
        cbk(null, fakedb);
      }
      else
      {
        count--;
        cbk({status: 400});
      }
    };

    lib.getServerDb(fakePouch, 'http://myurl', 2, 2, log.wrap('getting serverDb'), utils.cb(onDone, function(db){
      assert.equal(fakedb, db);
      onDone();
    }));
  });
 

   it('3: getLocalDb', function (done) {
    var log = masterLog.wrap('3');
    var onDone = function(error){
      if(error)
      {
        log.error(error);
      }
      done(error);
    };

     var fakePouch = function(url, cbk){
      assert.equal('stage/localhost-5984-testdb-pouchmanager-1', url);
      cbk(null, {});
    };

    lib.getLocalDb(fakePouch, serverURL + '/testdb-pouchmanager-1',log.wrap('getting localDB'), utils.cb(onDone, function(db){
      onDone();
    }));
  });

  it('4: if offline not supported should open server', function (done) {
    var log = masterLog.wrap('4');
    var onDone = function(error){
      if(error)
      {
        log.error(error);
      }
      lib.offlineSupported.restore();
      done(error);
    };

    sinon.stub(lib, 'offlineSupported', function(){
      return false;
    });

    lib(serverURL + '/testdb-pouchmanager-1',{retryDelay: 2}, log.wrap('creating offline pouch'),  utils.cb(onDone, function(offlinePouch){
      offlinePouch.close();
      onDone();
    }));
  });

  it('5: if offline supported should create local db', function (done) {
    var log = masterLog.wrap('5');
    var onDone = function(error){
      if(error)
      {
        log.error(error);
      }
      done(error);
    };

    lib.offlineSupported = function(){
      return true;
    };
    pouch.destroy(serverURL + '/testdb-pouchmanager-1', utils.safe(onDone, function(){
     pouch(serverURL + '/testdb-pouchmanager-1', utils.cb(onDone, function(serverDb){
      serverDb.put({_id: 'testdoc'}, utils.cb(onDone, function(){
        serverDb.close();
        lib(serverURL + '/testdb-pouchmanager-1', {retryDelay: 2, waitForInitialReplicate: true}, log.wrap('creating offline pouch'),  utils.cb(onDone, function(offlinePouch){
          offlinePouch.on('upToDate', function(){
            offlinePouch.get('testdoc', utils.cb(onDone, function(doc){
              assert.equal('testdoc', doc._id);
              offlinePouch.close();
              onDone();
            }));
          });
          offlinePouch.on('error', function(err){
            log.error(err);
          });
          offlinePouch.on('log', function(message){
            log(message);
          });
        }));
      }));
    })); 
    }));
  });

  it('6: if offline, should be able to start using anyway', function (done) {
    var log = masterLog.wrap('6');
    var onDone = function(error){
      if(error)
      {
        log.error(error);
      }
      lib.offlineSupported.restore();
      done(error);
    };

    sinon.stub(lib, 'offlineSupported', function(){
      return true;
    });

    lib('http://noserver/nodb',{retries: -1, retryDelay: 200, waitForInitialReplicate: false}, log.wrap('creating offline pouch'),  utils.cb(onDone, function(offlinePouch){
      offlinePouch.put({_id: 'testdoc2'}, utils.cb(onDone, function(){
        offlinePouch.close();
        onDone();
      }));
    }));
  });
});