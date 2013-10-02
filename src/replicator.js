/*global window */
/*global $ */
/*global ko */
/*global exports */
/*global require */
/*jslint node: true */

var async = require('async');
var events = require('events');
var assert = require('assert');
var utils = require('utils');
var jsonCrypto = require('jsonCrypto');
var Buff = require('buffer').Buffer;
var processor = require('./processor.js');
var processorQueue = require('./processorQueue.js');
var processorQueueStack = require('./processorQueueStack.js');

var pouchService = require('./pouchService.js');


var genReplicationId = function(src, target, filter, log) {
  var filterFun = filter ? filter.toString() : '';

  log('generating repID from:' + src.id() + target.id() + filterFun);
  if(!src.id() || !target.id())
  {
    throw new Error('the source or target ids cannot be null');
  }
  var hashBuff = jsonCrypto.hashBuffer(new Buff(src.id() + target.id() + filterFun, 'utf8'), 'md5');
  return src.id() + "-" +  target.id() + hashBuff.toString('hex');
};


module.exports  = function (src, target, opts, initLog){
  var filter = opts.filter || null;
  var repId = genReplicationId(src, target, filter, initLog.wrap('genReplicationId'));

  var awaitingDiff = processorQueue(getAwaitingDiffProcessor(filter, target));
  var awaitingGet = processorQueue(getAwaitingGetProcessor(src));
  var awaitingSave = processorQueue(getAwaitingSaveProcessor(target));


  if(opts.checkpointDb)
  {
    initLog('showing checkpoints');
    opts.hideCheckpoints = false;
  }
  else
  {
    initLog('hiding checkpoints');
    opts.hideCheckpoints = true;
  }
  var checkpointDb = opts.checkpointDb || target;

  var that = pouchService(repId, src, checkpointDb, [awaitingDiff, awaitingGet, awaitingSave], opts, initLog.wrap('changeService'));

  return that;
};


//the processors
var getAwaitingDiffProcessor = function(filter, target){
  var that = function(queue, itemProcessed, log, callback){
      assert.ok(queue);
      assert.ok(itemProcessed);
      assert.ok(log);
      assert.ok(callback);

      var diff = {};
      var processing = {};

      Object.keys(queue).map(function(seq){
        var change = queue[seq];
        processing[seq] = change;
        if(typeof filter !== 'undefined' && filter && !filter(change.doc))
        {
          diff[change.id] = [];
          return;
        }
        diff[change.id] = change.changes.map(function(x) { return x.rev; });
      });
      log('getting diffs from target');
      target.revsDiff(diff, utils.safe.catchSyncronousErrors(callback, function(error, diffs){
        if(error)
        {
          log('could not process awaiting diffs, possibly disconnected');
          callback(error);
          return;
        }
        Object.keys(processing).map(function(seq){
            var change = queue[seq];
            var id = change.id;

            var payload = {};
            payload.change = change;
            if(id  ==='task_4fd4dbb6-d5a5-4983-bb71-0bfb9f9e8468')
            {
              log('diffs for id: ' + id);
              log.dir(diffs[id]);
              log('given');
              log.dir(diff);
            }

            if(diffs[id] && diffs[id].missing)
            {
              payload.missing = diffs[id].missing;
            }
            else
            {
              payload.missing = [];
            }
            delete queue[seq];
            itemProcessed(seq, payload);
        });
        callback();
      }));
  };
  return that;
};


var getAwaitingGetProcessor =  function(src){
  var that = processor(function(seq, payload, logs, callback){
    assert.ok(seq);
    assert.ok(payload);
    assert.ok(logs);
    assert.ok(callback);

    var foundRevs = [];
    var missing = payload.missing;
    var change = payload.change;
    logs('get processor running');
    async.forEachSeries(missing, function(rev, cbk2){
      logs('gettig revs for ' + rev);
      src.get(change.id, {revs: true, rev: rev, attachments: true}, utils.safe(cbk2, function(error, got) {
        if(error)
        {
          logs('error getting rev: ' + rev + ' id : '  + change.id + ' for seq: ' + seq);
          cbk2(error);
          return;
        }
        logs('successfully got rev: ' + rev + ' id : '  + change.id + ' for seq: ' + seq);
        foundRevs.push(got);
        cbk2();
      }));
    }, function(error){
      if(error)
      {
        logs('could not get revs for ' + seq);
        callback(error);
        return;
      }
      logs('successfully got all revs');
      var payload = {change: change, revs: foundRevs};
      callback(null, payload);
    });
  });
  return that;
};

var getAwaitingSaveProcessor = function(target){
  var p = processor(function(seq, payload, logs, callback){
    var change = payload.change;
    var revs = payload.revs;
    async.forEachSeries(revs, function(rev, cbk){
      assert.ok(rev);
      logs('saving rev' + rev._rev);
      target.bulkDocs({docs: [rev]}, {new_edits: false}, utils.safe.catchSyncronousErrors(cbk, function(error, response){
        if(error)
        {
          //logs('Possible problem saving seq: ' + seq + ' id: ' + rev._id);
          //if(error.status ==500)
          //{
            logs('error on bulk doc for document: ');
            logs.dir(rev);
            logs.error(error, 'saving rev');
            cbk(error);
            return;
          //}
          //else
          //{
           // logs('duplicate rev');
           // logs.dir(error);
            //there is a duplicate record already, that is ok
          //}
        }
        else if(response.length > 0)
        {
            var revResponse = response[0];
            if(revResponse.error)
            {
              logs('Error saving rev');
              var e = new Error('bulkDocs error: ' + revResponse.error + ', ' + revResponse.reason + ' for id: ' + rev._id);
              logs.error(e, 'bulkDocs error');
              cbk(e);
              return;
            }
        }
        logs('successfully saved: ' + rev._id);
        cbk();
      }));
    }, function(error){
      if(error)
      {
        callback(error);
        return;
      }
      callback(null, change);
    });
  });
  return p;
};

