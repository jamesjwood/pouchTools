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

var retryHTTP = require('./retryHTTP');
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

  var awaitingDiff = processorQueue(getAwaitingDiffProcessor(filter, target, src), {retryInterval: 0, name: 'diff'});
  var awaitingGet = processorQueue(getAwaitingGetProcessor(src), {retryInterval: 0, name: 'get'});
  var awaitingSave = processorQueue(getAwaitingSaveProcessor(target), {retryInterval: 0, name: 'save'});


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
var getAwaitingDiffProcessor = function(filter, target, source){
  var that = function(queue, itemProcessed, log, callback){
    assert.ok(queue);
    assert.ok(itemProcessed);
    assert.ok(log);
    assert.ok(callback);

    var diff = {};
    var processing = {};

    async.forEachSeries(Object.keys(queue), function(seq, cbk){
      var cng = queue[seq];
      var cnhid = cng.id;
      var rev = cng.rev;
      var doc = cng.doc;

      assert.ok(cng, 'change');
      assert.ok(cnhid, 'id');
      processing[seq] = cng;

      if(typeof filter !== 'undefined' && filter)
      {
        if(filter(doc) === false)
        {
          log('excluding doc: ' + doc._id);
          cbk();
          return;
        }
      }
      retryHTTP(source.get, log.wrap('retryHTTP'))(cnhid, {revs:true, rev: doc._rev}, utils.cb(cbk, function(doc){
        var revisions = doc._revisions.ids;
        var i = 0;
        diff[cnhid] = revisions.reverse().map(function(rev){
          i = i +1;
          return i.toString() + "-" + rev;
        });
        cbk();
      }));

    }, utils.safe(callback, function(error){
      if(error)
      {
        var e = new Error('Error getting doc with revisions');
        e.inner = error;
        callback(e);
        return;
      }


      var gotDiffs = utils.safe.catchSyncronousErrors(callback, function(error, diffs){
        log('diffs returned');
        if(error)
        {
          log('could not process awaiting diffs for ' + JSON.stringify(diff));
          log.dir(error);
          var e = new Error('Error returned from revsDiff, possibly disconnected');
          e.inner = error;
          e.arguments = diff;
          if(typeof error.status !== 'undefined' && error.status ===0)
          {
            log('returning non critical error');
            e.critical = false;
          }
          else
          {
            log('returning critical error');
            e.critical = true;
          }
          callback(e);
          return;
        }
        log('processinf returned diffs');
        Object.keys(processing).map(function(seq){
          var change = queue[seq];
          assert.ok(change, 'There shoud be a change');
          assert.ok(change.id, 'There shoud be a change id');
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
          delete queue[seq];
          itemProcessed(seq, payload);
        });
        callback();
      });

      var c = 0;
      for(var k in diff)
      {
        c++;
      }
      if(c===0)
      {
        log('no records to diff');
        gotDiffs(null, {});
        return;
      }

      log('getting diffs from target');
      retryHTTP(target.revsDiff, log.wrap('retryHTTP'))(diff, gotDiffs);
}));




};
return that;
};


var getAwaitingGetProcessor =  function(src){
  var that = processor(function(seq, payload, state, logs, callback){
    assert.ok(seq, 'must have seq');
    assert.ok(payload, 'must have payload');
    assert.ok(logs, 'must have logs');
    assert.ok(callback, 'must have callback');
    if(state.cancelled)
    {
      return;
    }

    var foundRevs = [];
    var missing = payload.missing;
    var change = payload.change;
    logs('get processor running');
    async.forEachSeries(missing, function(rev, cbk2){
      if(state.cancelled)
      {
        return;
      }
      logs('gettig revs for ' + rev);
      retryHTTP(src.get, logs.wrap('retryHTTP'))(change.id, {revs: true, rev: rev, attachments: true}, utils.safe(cbk2, function(error, got) {
        if(state.cancelled)
        {
          return;
        }
        if(error)
        {
          if(error.status !== '404')
          {
            logs('rev no longer available: ' + rev + ' id : '  + change.id + ' for seq: ' + seq);
            cbk2();
            return;
          }
          logs('error getting rev: ' + rev + ' id : '  + change.id + ' for seq: ' + seq);
          var e = new Error('error getting rev: ' + rev + ' id : '  + change.id + ' for seq: ' + seq);
          e.inner = error;
          e.arguments = change.id;
          cbk2(e);
          return;
        }
        logs('successfully got rev: ' + rev + ' id : '  + change.id + ' for seq: ' + seq);
        foundRevs.push(got);
        cbk2();
      }));
    }, function(error){
      if(state.cancelled)
      {
        return;
      }
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

var checkExists = function(target, id, rev, log, callback)
{
  assert.ok(target, 'must have target');
  assert.ok(id, 'must have id');
  assert.ok(rev, 'must have rev');
  assert.ok(log, 'must have log');
  assert.ok(callback, 'must have callback');
  log('checking id: ' + id + ' rev: ' + rev);
  retryHTTP(target.get, log.wrap('retryHTTP'))(id, {rev: rev}, utils.safe(callback, function(error, doc){
    if(error)
    {
      if (typeof error.status !=='undefined' && error.status === 404)
      {
        log('missing');
        callback(null, false);
      }
      else
      {
        log('critical error');
        error.critical = true;
        callback(error);
      }
    }
    else
    {
      if(doc)
      {
        callback(null, true);
      }
      else
      {
        callback(null, false);
      }
    }
  }));
};


var cnCb = function(cbk, fnc){
  var newCb = function(error){
    if(error && typeof error.status !=='undefined' && error.status === 0)
    {
      //connection error
      error.critical = false;
    }
    fnc.apply(this, arguments);
  };

  var a = utils.cb(newCb, fnc);
  return a;
};


var getAwaitingSaveProcessor = function(target){
  var p = processor(function(seq, payload, state, logs, callback){
    var change = payload.change;
    var revs = payload.revs;
    if(state.cancelled)
    {
      return;
    }
    async.forEachSeries(revs, function(rev, cbk){
      if(state.cancelled)
      {
        return;
      }
      assert.ok(rev);
      logs('saving rev' + rev._rev);
      checkExists(target, rev._id, rev._rev, logs.wrap('checking exists'), utils.cb(cbk, function(exists){
        if(exists===false)
        {
          retryHTTP(target.bulkDocs, logs.wrap('retryHTTP'))({docs: [rev]}, {new_edits: false}, utils.safe.catchSyncronousErrors(cbk, function(error, response){
            if(state.cancelled)
            {
              return;
            }
            if(!error && typeof response !== 'undefined' && response.length > 0)
            {
              var revResponse = response[0];
              if(typeof revResponse.error !== 'undefined' && revResponse.error)
              {
                error = revResponse.error;
              }
            }
            if(error)
            {
              //logs.dir(error);
              //logs('error saving rev: ' + rev._rev + ' id : '  + rev._id + ' for seq: ' + seq);
              var e = new Error('error saving rev: ' + rev._rev + ' id : '  + rev._id + ' for seq: ' + seq);
              e.inner = error;
              if(typeof error.status !== 'undefined' && error.status ===0)
              {
                logs('returning non critical error');
                e.critical = false;
              }
              else
              {
                logs('returning critical error');
                e.critical = true;
              }
              cbk(e);
              return;
            }
            logs('successfully saved id:' + rev._id + " rev: " + rev._rev);
            cbk();
          }));
}
else
{
  cbk();
}
}));
}, function(err){
  if(state.cancelled)
  {
    return;
  }
  if(err)
  {
    callback(err);
    return;
  }
  callback(null, change);
});
});
return p;
};

