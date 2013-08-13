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
var changeQueue = require('./changeQueue.js');


var genReplicationId = function(src, target, filter, log) {
  var filterFun = filter ? filter.toString() : '';

  log('generating repID from:' + src.id() + target.id() + filterFun);
  if(!src.id() || !target.id())
  {
    throw new Error('the source or target ids cannot be null');
  }
  var hashBuff = jsonCrypto.hashBuffer(new Buff(src.id() + target.id() + filterFun, 'utf8'), 'md5');
  return hashBuff.toString('hex');
};


module.exports  = function (src, target, filter, retries, retryInterval, continuous, initLog){
  var repId = genReplicationId(src, target, filter, initLog.wrap('genReplicationId'));

  var awaitingDiff = changeQueue(getAwaitingDiffProcessor(filter, target));
  var awaitingGet = changeQueue(getAwaitingGetProcessor(src));
  var awaitingSave = changeQueue(getAwaitingSaveProcessor(target));

  var that = changeService(repId, src, target, [awaitingDiff, awaitingGet, awaitingSave], retries, retryInterval, continuous, initLog.wrap('changeService'));

  return that;
};


//the processors
var getAwaitingDiffProcessor = function(filter, target){
  var that = function(queue, itemProcessed, log, callback){
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

      target.revsDiff(diff, utils.safe.catchSyncronousErrors(callback, function(error, diffs){
        if(error)
        {
          logs('could not process awaiting diffs, possibly disconnected');
          callback();
          return;
        }
        Object.keys(processing).map(function(seq){
            var change = queue[seq];
            var id = change.id;

            var payload = {};
            payload.change = change;

            if(diffs[id] && diffs[id].missing)
            {
              payload.missing = diffs[id].missing;
            }
            else
            {
              payload.missing = [];
            }
            itemProcessed(seq, payload);
            delete queue[seq];
        });
        callback();
      }));
  };
  return that;
};


var getAwaitingGetProcessor =  function(src){
  var that = processor(function(seq, payload, callback){
    var foundRevs = [];
    var missing = payload.missing;
    var change = payload.change;

    async.forEachSeries(missing, function(rev, cbk2){
      src.get(change.id, {revs: true, rev: rev, attachments: true}, utils.cb(cbk2, function(rev) {
        foundRevs.push(rev);
        cbk2();
      }));
    }, function(error){
      if(error)
      {
        logs('could not get revs for ' + seq);
        callback(error);
        return;
      }
      var payload = {change: change, revs: foundRevs};
      callback(null, payload);
    });
  }, logs);
  return that;
};

var getAwaitingSaveProcessor = function(target){
  var p = processor(function(seq, payload, callback){
    var change = payload.change;
    var revs = payload.revs;
    async.forEachSeries(revs, function(rev, cbk){
      logs('saving rev');
      logs(JSON.stringify(rev));
      target.bulkDocs({docs: [rev]}, {new_edits: false}, utils.safe.catchSyncronousErrors(cbk, function(error, response){
        if(error)
        {
          logs('Possible problem saving diff: ' + rev._dif);
          if(error.status !==500)
          {
            logs.error(error, 'saving record');
            cbk(error);
            return;
          }
          else
          {
            //there is a duplicate record already, that is ok
          }
        }
        else
        {
          assert.equal(response.length, 1);
          var revResponse = response[0];
          if(revResponse.error)
          {
            var e = new Error('bulkDocs error: ' + revResponse.error + ', ' + revResponse.reason + ' for rev: ' + revResponse.rev + ' id: ' + revResponse.id);
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
  }, logs);
  return p;
};

