var events = require('events');
var utils = require('utils');
var jsonCrypto = require('jsonCrypto');
var processorQueueStack = require('./processorQueueStack.js');
var processorQueue = require('./processorQueue.js');
var processor = require('./processor.js');
var async = require('async');
var assert = require('assert');


var getAwaitingNotifyProcessor = function(onChange, writeCheckpoint, source_start_seq, checkpointDB, id){
  var p = processor(function(seq, change, mlog, callback){
    mlog('Notify processor, start at:' + source_start_seq + ' seq is ' + seq);
    if(source_start_seq <= seq)
    {
      mlog('writing checkpoint at: ' + seq);
      writeCheckpoint(checkpointDB, id, seq, mlog.wrap('writeCheckpoint'), utils.cb(callback, function(){
        onChange(change);
        callback();
      }));
      return;
    }
    onChange(change);
    callback();
  });
  return p;
};

var setupQueues = function(queues, that, checkpointDB, id, log){
  assert.ok(queues);
  assert.ok(that);
  assert.ok(checkpointDB);
  assert.ok(log);

  log('queues length: ' + queues.length);
  if(queues.length ===0)
  {
    throw new Error('you must pass a non zero length queues variable');
  }


  var onChangeDone = function(){
    that.changeDone.apply(null, arguments);
  };

  var notifyQueue = processorQueue(getAwaitingNotifyProcessor(onChangeDone, writeCheckpoint, that.source_seq, checkpointDB, id));

  var newQueue = [];
  newQueue = newQueue.concat(queues).concat([notifyQueue]);

  that.queueStack = processorQueueStack(newQueue);

  log('total processorQueues: ' + newQueue.length);

  var stackLog = utils.log(that).wrap('queueStack');
  utils.log.emitterToLog(that.queueStack, stackLog);

  that.queueStack.on('offline', function(offline){
    that.offline = offline;
  });
};

var fetchCheckpoint = function(checkpointDB, id, log, callback) {
    log('getting checkpoint');
    checkpointDB.get('_local/' + id, function(err, doc) {
      if (err && err.status === 404) {
        log('could not get checkpoint with id: ' + id);
        callback(null, 0);
      } else {
        log('got checkpoint at:' + doc.last_seq);
        callback(null, doc.last_seq);
      }
    });
  };

var writeCheckpoint = function(checkpointDB, id, seq, log, callback) {
    var check = {
      _id: '_local/' + id,
      last_seq: seq
    };
    log('checking for existing checkpoint: ' + seq);
    checkpointDB.get(check._id, function(err, doc) {
      if (doc && doc._rev) {
        check._rev = doc._rev;
        log('existing checkpoint at : ' + doc.last_seq);
        if(doc.last_seq === seq)
        {
          callback();
          return;
        }
      }
      else
      {
        log('no existing checkpoint');
      }
      checkpointDB.put(check, function(err, doc) {
        log('wrote checkpoint: ' + seq);
        callback();
      });
    });
};

module.exports  = function (id, srcDB, checkpointDB, queues, opts, initLog)
{
  opts.retries = opts.retries || 0;
  opts.filter = opts.filter || null;
  opts.reset = opts.reset || false;
  opts.continuous = opts.continuous || false;

  var that = new events.EventEmitter();

  var log = utils.log(that);
  that.cancelled = false;
  that.total_changes =0;
  that.outstanding_changes =0;
  that.offline = true;

  that.sEmit = function(a, b, c, d){
    try
    {
      that.emit(a, b, c, d);
    }
    catch(error)
    {
      that.emit('error', error);
    }
  };

  var initialReplicateComplete = function(seq){
    log('initialReplicateComplete');
    that.sEmit('initialReplicateComplete', seq);
  };

  var upToDate = function(seq){
    log('upToDate');
    that.sEmit('upToDate', seq);
  };

  var setupComplete = function(error){
    if(error)
    {
      log('error setting up');
      if(retries !== 0)
      {
        log('failed to setup, retrying in 0.5 seconds');
        retries--;
        setTimeout(function(){
          if(!that.cancelled)
          {
            setup(setupComplete);
          }
        }, opts.retryInterval);
      }
      else
      {
        that.emit('error', error);
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
    srcDB.info(utils.cb(callback, function(info){
      that.source_seq = info.update_seq;
      log('sourceDB at ' + that.source_seq);
      log('gettting checkpoint');
      fetchCheckpoint(checkpointDB, id, log.wrap('getting checkpoint'), utils.cb(callback, function(checkpoint) {
        if(that.cancelled)
        {
          return;
        }
        if(opts.reset)
        {
          checkpoint = 0;
        }
        that.target_at_seq = checkpoint;
        log('targetDB at ' + that.target_at_seq);

        setupQueues(queues, that,checkpointDB, id, initLog.wrap('setupQueues'));



        that.changeDone = function(change){
          if(that.cancelled === true)
          {
            return;
          }
          that.outstanding_changes--; // = awaitingNotify.queued + awaitingSave.queued + awaitingGet.queued + awaitingDiff.queued;
          if(change.seq >= that.source_seq)
          {
            that.source_seq = change.seq;
          }
          that.sEmit('changeDone', change);

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


        var incomingChange = function(change){
          log('incoming change: ' + change.seq);
          that.total_changes++;
          that.outstanding_changes++; // = awaitingNotify.queued + awaitingSave.queued + awaitingGet.queued + awaitingDiff.queued;
          that.queueStack.enqueue(change.seq, change);
          that.sEmit('changeQueued', change);
        };

        var repOpts = {
          continuous: opts.continuous,
          since: that.target_at_seq,
          style: 'all_docs',
          onChange: incomingChange,
          include_docs: true
        };


        //if (opts.query_params) {
        //  repOpts.query_params = opts.query_params;
       // }

        var emitLog = function(name){
          var loge = function(message){
            log(name + ": " + message);
          };
          return loge;
        };

        changes = srcDB.changes(repOpts);
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
    if(changes && opts.continuous)
    {
          changes.cancel();
    }
    if(that.queueStack)
    {
          that.queueStack.cancel();
    }
  };

  that.on('error', function(){
    that.cancel();
  });

  setup(setupComplete);

  return that;
};