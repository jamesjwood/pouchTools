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
var rootDir;
var pouch = require('pouchdb');
if(typeof window != 'undefined')
{
  rootDir = '';

}
else
{
  rootDir = 'stage/';
}

var async = require('async');

var masterLog = utils.log().wrap('offlinePouch');

var lib = require('../src/offlinePouch.js');

var serverURL = 'http://admin:password@localhost:5984';
var noServerURL = 'http://noserver/nodb';



describe('offlinePouch', function () {
  'use strict';
  var cleanDB = function(done){

    async.forEachSeries(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], function(name, cbk){

      pouch.destroy(serverURL + '/test_offlinepouch_' + name, function(error, body){
        cbk();
      });
    }, function(error){
      done(error);
    });
  };


  

  before(function(done){
    cleanDB(function(){
      done();
    });
  });
  after(function(done){
    cleanDB(function(){
      done();
    });
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
      assert.equal(rootDir + 'test_offlinepouch_3', url);
      cbk(null, {});
    };

    lib.getLocalDb(fakePouch, 'test_offlinepouch_3', false, log.wrap('getting localDB'), utils.cb(onDone, function(db){
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

    var offlinePouch = lib('test_offlinepouch_4', serverURL + '/test_offlinepouch_4',{retryDelay: 2}, log.wrap('creating offline pouch'));
    offlinePouch.on('setupComplete', function(){
      offlinePouch.close();
      onDone();
    });
  });

  it('5: if offline supported should create local db, should be able to delete it', function (done) {
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
    pouch.destroy(serverURL + '/test_offlinepouch_5', utils.safe(onDone, function(){
     pouch(serverURL + '/test_offlinepouch_5', utils.cb(onDone, function(serverDb){
      serverDb.put({_id: 'testdoc'}, utils.cb(onDone, function(){
        serverDb.close();


        var offlinePouchLog = log.wrap('offlinePouch');
        var offlinePouch = lib('test_offlinepouch_5', serverURL + '/test_offlinepouch_5', {retryDelay: 2, waitForInitialReplicate: true}, log.wrap('creating offline pouch'));
          offlinePouch.on('downUpToDate', function(){
            offlinePouch.get('testdoc', utils.cb(onDone, function(doc){
              assert.equal('testdoc', doc._id);
              offlinePouch.wipeLocal(log.wrap('wipeLocal'), utils.cb(onDone, function(){
                onDone();
              }));
            }));
          });

          utils.log.emitterToLog(offlinePouch, offlinePouchLog);
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
      if(lib.offlineSupported.restore)
      {
        lib.offlineSupported.restore();
      }
      done(error);
    };

    sinon.stub(lib, 'offlineSupported', function(){
      return true;
    });

    var offlinePouch =lib('test_offlinepouch_6', noServerURL,{retries: -1, retryDelay: 200, waitForInitialReplicate: false}, log.wrap('creating offline pouch'));
    offlinePouch.on('setupComplete', function(){
      offlinePouch.put({_id: 'testdoc2'}, utils.cb(onDone, function(){
        onDone();
      }));
    });

  });
});