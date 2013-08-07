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

var masterLog = utils.log().wrap('pouchManager.replicator');

var lib = require('../src/replicator.js');

var nano = require('nano');
var async = require('async');

var remoteDbUrl = 'http://admin:password@localhost:5984/';

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
    var service = nano(remoteDbUrl);

    async.forEachSeries(['4', '5', '6', '7'], function(name, cbk){
      service.db.get('test_replicator_' + name, function(error, body){
        if(!error)
        {
          service.db.destroy('test_replicator_' + name, cbk);
        }
        else
        {
          cbk();
        }
      });
    }, function(error){
      done(error);
    });
  };

  before(function(done){
    cleanDB(done);
  });
  after(function(done){
    cleanDB(done);
  });

it('1: processor should call ', function (done) {
 var mylog = masterLog.wrap('1');
 var onDone = function (error) {
  if (error) {
    mylog.error(error);
  }
    done(error);
  };

  var changes = {test: 1};
  var queueProcessor = lib.processor(function(id, data, callback){
    assert.equal('test', id);
    callback();
  }, mylog);
  queueProcessor(changes, function(error){
    assert.equal('undefined', typeof changes.test);
    onDone(error);
  });
});


it('2: processor should call each', function (done) {
 var mylog = masterLog.wrap('2');
 var onDone = function (error) {
  if (error) {
    mylog.error(error);
  }
    done(error);
  };
  var changes = {test: 1, test2: 2};
  var count = 0;
  var queueProcessor = lib.processor(function(id, data, callback){
    count++;
    callback();
  }, mylog);
  queueProcessor(changes, function(error){
    assert.equal('undefined', typeof changes.test);
    assert.equal('undefined', typeof changes.test2);
    assert.equal(2, count);
    onDone();
  });
});

it('3: change queue', function (done) {
 var mylog = masterLog.wrap('3');
 var onDone = function (error) {
  if (error) {
    mylog.error(error);
  }
    done(error);
  };

  var queueProcessor = function(queue, callback){
    assert.equal('hello', queue[1].id);
    delete queue[1];
    callback();
  };

  var queue = lib.changeQueue(queueProcessor);
  queue.on('error', function(error){
    onDone(error);
  });
  queue.on('log', function(message){
   mylog(message);
  });
  queue.on('state', function(message){
    if(message === 'idle')
    {
      onDone();
    }
  });

  queue.enqueue(1, {id: 'hello'});
});


it('4: replicate, should fire initialReplicate', function (done) {
 var mylog = masterLog.wrap('4');
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
        var replicator = lib(serverdb, localdb, {continuous: false});
        replicator.on('error', mylog.wrap('replicator').error);
        replicator.on('setupComplete', function(){
          replicator.on('initialReplicateComplete', function(change){
            onDone();
          });
        });
        replicator.on('log', mylog.wrap('replicator'));
      }));
    }));
  }));
}));
});

it('5: replicate, should fire upToDate', function (done) {
 var mylog = masterLog.wrap('5');
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
         var replicator = lib(serverdb, localdb, {continuous: false});
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


it('6: replicate, should replicate an item', function (done) {
 var mylog = masterLog.wrap('6');
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
        serverdb.put({_id: 'testitem'}, utils.cb(onDone, function(){

          var replicator = lib(serverdb, localdb, {continuous: false});
          replicator.on('error', function(error){
            mylog.error(error);
            onDone(error);
          });

          replicator.on('log', function(message){
            mylog.log(message);
          });

          replicator.on('initialReplicateComplete', function(change){
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


it('7: replicate, should be continuous', function (done) {
 var mylog = masterLog.wrap('7');
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

          var replicator = lib(serverdb, localdb, {continuous: true});
          replicator.on('error', function(error){
            mylog.error(error);
            onDone(error);
          });

          replicator.on('log', function(message){
            mylog.log(message);
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
              console.dir(err3);
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
});

