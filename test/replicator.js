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

 var masterLog = utils.log().wrap('replicator');

 var lib = require('../src/replicator.js');

 var async = require('async');

 var remoteDbUrl = 'http://admin:password@localhost:5985/';

 var localDbUrl;

 var dbName = 'system';

 describe('pouchManager.replicator', function () {
  'use strict';

  var pouch;
  if (typeof window === 'undefined') {
    masterLog('running on server');
    localDbUrl = 'leveldb://stage/';
    pouch = require('pouchdb');
  }
  else {
    localDbUrl ='';
    masterLog('running on browser');
    pouch = Pouch;
  }

  var cleanDB = function(done){

    async.forEachSeries(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], function(name, cbk){
      pouch.destroy(remoteDbUrl + '/test_replicator_' + name, function(error, body){
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
    cleanDB(done);
  });


it('1: replicate, should fire initialReplicate', function (done) {
 var mylog = masterLog.wrap('1');
 var onDone = function (error) {
  if (error) {
    mylog.error(error);
  }
  done(error);
};

var dbName = localDbUrl + 'test_replicator_4';
var remoteDbName = remoteDbUrl + 'test_replicator_4';
mylog('creating new database: ' + remoteDbName);
pouch.destroy(remoteDbName, utils.safe(onDone, function (error) {
  pouch(remoteDbName, utils.cb(onDone, function (serverdb) {
    mylog('database created');
    mylog('creating new database: ' + dbName);
    pouch.destroy(dbName, utils.safe(onDone, function (error) {
      pouch(dbName, utils.cb(onDone, function (localdb) {
      mylog('initiating replication');
        var replicator = lib(serverdb, localdb, {}, mylog.wrap('init replicator'));
        replicator.on('error', mylog.wrap('replicator').error);
        replicator.on('setupComplete', function(){
          replicator.on('initialComplete', function(change){
            onDone();
          });
        });
        replicator.on('log', mylog.wrap('replicator'));
      }));
    }));
  }));
}));
});

it('2: replicate, should fire upToDate', function (done) {
 var mylog = masterLog.wrap('2');
 var onDone = function (error) {
  if (error) {
    mylog.error(error);
  }
  done(error);
};

var dbName = localDbUrl + 'test_replicator_5';
var remoteDbName = remoteDbUrl + 'test_replicator_5';
mylog('creating new database: ' + remoteDbName);
pouch.destroy(remoteDbName, utils.safe(onDone, function (error) {
  pouch(remoteDbName, utils.cb(onDone, function (serverdb) {
    mylog('database created');
    mylog('creating new database: ' + dbName);
    pouch.destroy(dbName, utils.safe(onDone, function (error) {
      pouch(dbName, utils.cb(onDone, function (localdb) {
        var replicator = lib(serverdb, localdb, {}, mylog.wrap('init replicator'));
        replicator.on('error', function(error){
            mylog.error(error);
          });

        replicator.on('log', function(message){
            mylog.log(message);
          });

        replicator.on('upToDate', function(change){
            onDone();
        });
      }));
    }));
  }));
}));
});

it('3: replicate, should replicate an item', function (done) {
 var mylog = masterLog.wrap('3');
 var onDone = function (err) {
  if (typeof err !== 'undefined') {
    mylog.error(err);
  }
  done(err);
};

var dbName = localDbUrl + 'test_replicator_6';
var remoteDbName = remoteDbUrl + 'test_replicator_6';
mylog('creating new database: ' + remoteDbName);
pouch.destroy(remoteDbName, utils.safe(onDone, function (error) {
  pouch(remoteDbName, utils.cb(onDone, function (serverdb) {
    mylog('database created');
    mylog('creating new database: ' + dbName);
    pouch.destroy(dbName, utils.safe(onDone, function (error) {
      pouch(dbName, utils.cb(onDone, function (localdb) {
        mylog('created new database, saving doc');
        serverdb.put({_id: 'testitem'}, utils.cb(onDone, function(){

          var replicator = lib(serverdb, localdb, {}, mylog.wrap('init replicator'));
          utils.log.emitterToLog(replicator, mylog.wrap('replicator'));
          
          replicator.on('error', function(error){
            onDone(error);
          });
          replicator.on('initialComplete', function(change){
            mylog('checking doc is synced');
            localdb.get('testitem', {}, utils.safe(onDone, function(err3, item){
              assert.ifError(err3);
              assert.equal('testitem', item._id);
              onDone();
            }));
          });
        }));
      }));
    }));
  }));
}));
});

/*
it('4: replicate, should be continuous', function (done) {
 var mylog = masterLog.wrap('4');
 var onDone = function (err) {
  if (typeof err !== 'undefined') {
    mylog.error(err);
  }
  done(err);
};

var dbName = localDbUrl + 'test_replicator_7';
var remoteDbName = remoteDbUrl + 'test_replicator_7';
mylog('creating new database: ' + remoteDbName);
pouch.destroy(remoteDbName, utils.safe(onDone, function (error) {
  pouch(remoteDbName, utils.cb(onDone, function (serverdb) {
    mylog('database created');
    mylog('creating new database: ' + dbName);
    pouch.destroy(dbName, utils.safe(onDone, function (error) {
      pouch(dbName, utils.cb(onDone, function (localdb) {
          var count =0;

          var replicator = lib(serverdb, localdb, {continuous: true}, mylog.wrap('init replicator'));
          utils.log.emitterToLog(replicator, mylog.wrap('replicator'));
          replicator.on('error', function(error){
            onDone(error);
          });


          replicator.on('upToDate', function(seq){
            mylog.log('upToDate called');
            if(count ===0)
            {
              count++;
              return;
            }
            replicator.cancel();
            mylog('checking doc is synced');
            localdb.get('testitem', {}, utils.safe(onDone, function(err3, item){
              assert.ifError(err3);
              assert.equal('testitem', item._id);
              onDone();
            }));
          });
          serverdb.put({_id: 'testitem'}, utils.cb(onDone, function(){
            mylog('doc written');
          }));
      }));
    }));
  }));
}));
});

it('5: replicate, should be deal with deletes', function (done) {
 var mylog = masterLog.wrap('5');
 var onDone = function (err) {
  if (typeof err !== 'undefined') {
    mylog.error(err);
  }
  done(err);
};

var dbName = localDbUrl + 'test_replicator_7';
var remoteDbName = remoteDbUrl + 'test_replicator_7';
mylog('creating new database: ' + remoteDbName);
pouch.destroy(remoteDbName, utils.safe(onDone, function (error) {
  pouch(remoteDbName, utils.cb(onDone, function (serverdb) {
    mylog('database created');
    mylog('creating new database: ' + dbName);
    pouch.destroy(dbName, utils.safe(onDone, function (error) {
      pouch(dbName, utils.cb(onDone, function (localdb) {
        var count =0;

        var replicator = lib(serverdb, localdb, {continuous: true}, mylog.wrap('init replicator'));
        utils.log.emitterToLog(replicator, mylog.wrap('replicator'));
        replicator.on('error', function(error){
          onDone(error);
        });

        replicator.on('upToDate', function(seq){
          if(seq ==1)
          {
            onDone();
          }
        });

        serverdb.put({_id: 'testitem'}, utils.cb(onDone, function(){
          mylog('doc written');
          serverdb.get('testitem', utils.cb(onDone, function(updated){
            updated._deleted = true;
            serverdb.put(updated, utils.cb(onDone, function(){
              mylog('doc deleted');
            }));
          }));
          }));
        }));
      }));
    }));
  }));
});
*/
});

