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


var genReplicationId = function(src, target, opts, log) {
  var filterFun = opts.filter ? opts.filter.toString() : '';
  log('generating repID from:' + src.id() + target.id() + filterFun);
  if(!src.id() || !target.id())
  {
    throw new Error('the source or target ids cannot be null');
  }
  var hashBuff = jsonCrypto.hashBuffer(new Buff(src.id() + target.id() + filterFun, 'utf8'), 'md5');
  return '_local/' + hashBuff.toString('hex');
};

var fetchCheckpoint = function(target, id, log, callback) {
  log('getting checkpoint');
  target.get(id, function(err, doc) {
    if (err && err.status === 404) {
      log('could not get checkpoint with id: ' + id);
      callback(null, 0);
    } else {
      log('got checkpoint at:' + doc.last_seq);
      callback(null, doc.last_seq);
    }
  });
};

var writeCheckpoint = function(target, id, checkpoint, log, callback) {
  var check = {
    _id: id,
    last_seq: checkpoint
  };
  log('checking for existing checkpoint: ' + checkpoint);
  target.get(check._id, function(err, doc) {
    if (doc && doc._rev) {
      check._rev = doc._rev;
      log('existing checkpoint at : ' + doc.last_seq);
      if(doc.last_seq === checkpoint)
      {
        callback();
        return;
      }
    }
    else
    {
      log('no existing checkpoint');
    }
    target.put(check, function(err, doc) {
      log('wrote checkpoint: ' + checkpoint);
      callback();
    });
  });
};


module.exports  = function (src, target, opts, initLog)
{
  var that = new events.EventEmitter();
  that.cancelled = false;
  that.total_changes =0;
  that.outstanding_changes =0;
  that.offline =true;

  that.sEmit = function(a, b, c, d){
    try
    {
      that.emit(a, b, c, d);
    }
    catch(error)
    {
      console.log('emit error');
      that.emit('error', error);
    }
  };

  var repId = genReplicationId(src, target, opts, initLog.wrap('genReplicationId'));
  var changeCallback = opts.onChange;
  var onInitialComplete = opts.onInitialComplete;
  var onUpToDate = opts.onUpToDate;
  var retries = opts.retries || -1;
  var log = utils.log(that);

  

  var initialReplicateComplete = function(seq){
    log('initialReplicateComplete');
    that.sEmit('initialReplicateComplete', seq);
    if(!opts.continuous)
    {
      that.cancel();
    }
  };

  var upToDate = function(seq){
    log('upToDate');
    that.sEmit('upToDate', seq);
  };

  var setupComplete = function(error){
    if(error)
    {
      if(retries !== 0)
      {
        retries--;
        setTimeout(function(){
          if(!that.cancelled)
          {
            log('failed to setup, retrying in 10 seconds');
            setup(setupComplete);
          }
        }, 1000);
      }
      else
      {
        criticalError(error);
      }
      return;
    }
    if(that.cancelled)
    {
        return;
    }
    log('setup complete, target at ' + that.target_at_seq + ' source is at ' + that.source_seq);
    that.sEmit('setupComplete');
    if(that.target_at_seq == that.source_seq)
    {
      log('target and source already up to date');
      upToDate();
      initialReplicateComplete();
    }
    else
    {
      log('target and source not up to date, waiting for changes feed');
    }
  };

  var setup = utils.safe(setupComplete, function(callback){
    if(that.cancelled)
    {
        return;
    }
    log('getting sourceDB info');
    src.info(utils.cb(callback, function(info){
      that.source_seq = info.update_seq;
      log('sourceDB at ' + that.source_seq);
      fetchCheckpoint(target, repId, log.wrap('getting checkpoint'), utils.cb(callback, function(checkpoint) {
        if(that.cancelled)
        {
          return;
        }
        that.target_at_seq = checkpoint;
        log('targetDB at ' + that.target_at_seq);
        var incomingChange = function(change){
          log('incoming change: ' + change.seq);
          that.total_changes++;
          that.outstanding_changes++; // = awaitingNotify.queued + awaitingSave.queued + awaitingGet.queued + awaitingDiff.queued;
          awaitingDiff.enqueue(change.seq, change);
          that.sEmit('changeQueued', change);
        };

        var changeReplicated = function(change){
          if(that.cancelled === true)
          {
            return;
          }
          that.outstanding_changes--; // = awaitingNotify.queued + awaitingSave.queued + awaitingGet.queued + awaitingDiff.queued;
          if(change.seq >= that.source_seq)
          {
            that.source_seq = change.seq;
          }
          that.sEmit('changeReplicated', change);





          if(change.seq === info.update_seq)
          {
            initialReplicateComplete(change.seq);
          }
          else
          {
            log('not initial complete, at '  + change.seq + ' initial seq is ' + info.update_seq);
          }

          if(change.seq === that.source_seq)
          {
            upToDate(change.seq);
          }
          else
          {
            log('not up to date, at ' + change.seq + ' sourcs is at ' + that.source_seq);
          }
          
        };

        var repOpts = {
          continuous: opts.continuous,
          since: that.target_at_seq,
          style: 'all_docs',
          onChange: incomingChange,
          include_docs: true
        };


        if (opts.query_params) {
          repOpts.query_params = opts.query_params;
        }

        var emitLog = function(name){
          var loge = function(message){
            log(name + ": " + message);
          };
          return loge;
        };

        var awaitingNotify = changeQueue(getAwaitingNotifyProcessor(changeReplicated, target, repId, that.source_seq, log.wrap('notify queue')));
        var awaitingSave = changeQueue(getAwaitingSaveProcessor(awaitingNotify, target, log.wrap('save queue')));
        var awaitingGet = changeQueue(getAwaitingGetProcessor(awaitingSave, src, log.wrap('get queue')));
        var awaitingDiff = changeQueue(getAwaitingDiffProcessor(awaitingGet, opts, target, log.wrap('diff queue')));


        var updateOffline = function(){
          var off = awaitingNotify.offline || awaitingSave.offline || awaitingGet.offline || awaitingDiff.offline;
          if(that.offline !== off)
          {
            that.offline = off;
            that.emit('offline', that.offline);
          }
        };

        awaitingNotify.addListener('offline', updateOffline);
        awaitingSave.addListener('offline', updateOffline);
        awaitingGet.addListener('offline', updateOffline);
        awaitingDiff.addListener('offline', updateOffline);

        utils.log.emitterToLog(awaitingNotify, log.wrap('notifyProcessor'));
        utils.log.emitterToLog(awaitingSave, log.wrap('saveProcessor'));
        utils.log.emitterToLog(awaitingGet, log.wrap('getProcessor'));
        utils.log.emitterToLog(awaitingDiff, log.wrap('diffProcessor'));

        changes = src.changes(repOpts);

        that.cancelProcessors = function(){
          awaitingNotify.cancel();
          awaitingSave.cancel();
          awaitingGet.cancel();
          awaitingDiff.cancel();
        };
        callback();
      }));
    }));
  });

  var changes;
  that.cancel = function(){
    log('cancelling');
    that.cancelled = true;
    that.sEmit('cancelled');
    that.removeAllListeners();
    if(opts.continuous && changes)
    {
          changes.cancel();
    }
    if(that.cancelProcessors)
    {
       that.cancelProcessors();
    }
  };

  that.on('error', function(){
    that.cancel();
  });

  setup(setupComplete);

  return that;
};


var processor;

module.exports.processor = processor = function(processItem, log){
  var that = function(queue, callback){
    async.forEachSeries(Object.keys(queue), function(seq, cbk){
      var onDone = function(error){
        if(error)
        {
          log('error processing change: ' + seq + " message was " + error.message);
          cbk();
          return;
        }
        log('done ' + seq);
        delete queue[seq];
        cbk();
      };
      utils.safe(onDone, processItem)(seq, queue[seq], onDone);
    }, callback);
  };
  return that;
};

var changeQueue;

module.exports.changeQueue = changeQueue = function(processor){
  var queue = {};

  var that = new events.EventEmitter();
  that.cancelled = false;
  that.cancel = function(){
    that.cancelled = true;
    that.emit('cancelled');
    that.removeAllListeners();
  };

  var itemsBeingProcessed = [];
  var processing = false;
  var awaitingProcessing = false;
  that.offline = true;

  var setOffline= function(off){
    if(that.offline !== off)
    {
      that.offline = off;
      that.emit('offline', off);
    }
  };

  var allItemsProcesseed = function(orginalAsArray, updated){
    var all = true;
    if(Object.keys(updated).length === 0)
    {
      return all;
    }
    orginalAsArray.map(function(key){
      if(typeof updated[key] !== undefined)
      {
        all = false;
        return;
      }
    });
    return all;
  };

  that.doneProcessing = function(error){
    that.queued = Object.keys(queue).length;
    if(!that.cancelled)
    {
      if(error)
      {
        setOffline(true);
        that.emit('log', 'error processing queue');
        that.emit('error', error);
        that.cancel();
        return;
      }
      that.emit('log', 'done processing');
      processing = false;

      if(allItemsProcesseed(itemsBeingProcessed, queue) === true)
      {
        setOffline(false);
        if(awaitingProcessing)
        {
          that.emit('log', 'more added while processing');
          setTimeout(that.process, 0);
        }
        else
        {
          that.emit('state', 'idle');
        }
      }
      else
      {
        console.log(queue);
        that.emit('log', 'some changes failed to process, scheduling a retry in 5 seconds');
        setOffline(true);
        setTimeout(that.process, 5000);
        that.emit('state', 'idle');
      }
    }
  };

  that.process = utils.safe.catchSyncronousErrors(that.doneProcessing, function(){
    if(!processing && !that.cancelled)
    {
      itemsBeingProcessed = Object.keys(queue);
      that.queued = itemsBeingProcessed.length;
      if(that.queued > 0)
      {
        that.emit('state', 'busy');
        that.emit('log', 'initiating processing');
        awaitingProcessing = false;
        processing = true;
        that.emit('log', 'calling process');
        utils.safe.catchSyncronousErrors(that.doneProcessing, processor)(queue, that.doneProcessing);
      }
      else
      {
        that.doneProcessing();
      }
      return;
    }
    awaitingProcessing = true;
  });

  that.enqueue = function(seq, payload){
    that.emit('log', 'change queued ' + seq);
    queue[seq]= payload;
    if(!that.cancelled)
    {
      that.process();
    }
  };

  return that;
};


//the processors
var getAwaitingDiffProcessor = function(awaitingGet, opts, target, logs){
  var that = function(queue, callback){
      var diff = {};
      var processing = {};

      Object.keys(queue).map(function(seq){
        var change = queue[seq];
        processing[seq] = change;
        if(typeof opts.filter !== 'undefined' && opts.filter && !opts.filter(change.doc))
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
            if(diffs[id] && diffs[id].missing)
            {
              awaitingGet.enqueue(seq, {missing: diffs[id].missing, change: change});
            }
            else
            {
              awaitingGet.enqueue(seq, {missing: [], change: change});
            }
            logs('done ' + seq);
            delete queue[seq];
        });
        callback();
      }));
  };
  return that;
};

var getAwaitingGetProcessor =  function(awaitingSave, src, logs){
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
      awaitingSave.enqueue(seq, {change: change, revs: foundRevs});
      callback();
    });
  }, logs);
  return that;
};

var getAwaitingSaveProcessor = function(awaitingNotify, target, logs){
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
      awaitingNotify.enqueue(seq, change);
      callback();
    });
  }, logs);
  return p;
};

var getAwaitingNotifyProcessor = function(onChange, target, repId, source_seq, log){
  var p = processor(function(seq, change, callback){
    if(source_seq <= seq)
    {
      writeCheckpoint(target, repId, seq, log.wrap('writeCheckpoint'), utils.cb(callback, function(){
        onChange(change);
        callback();
      }));
      return;
    }
    onChange(change);
    callback();
  }, log);
  return p;
};