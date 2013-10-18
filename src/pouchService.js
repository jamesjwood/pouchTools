var events = require('events');
var utils = require('utils');
var jsonCrypto = require('jsonCrypto');
var processorQueueStack = require('./processorQueueStack.js');
var processorQueue = require('./processorQueue.js');
var processor = require('./processor.js');
var async = require('async');
var assert = require('assert');


var getAwaitingNotifyProcessor = function(writeCheckpoint, target_at_seq, checkpointDB, id, hideCheckpoints){
  var p = processor(function(seq, payload, state, mlog, callback){
    if(state.cancelled)
    {
      return;
    }
    mlog('Notify processor, start at:' + target_at_seq + ' seq is ' + seq);
    if(target_at_seq <= seq)
    {
      mlog('writing checkpoint at: ' + seq + ' hidden=' + hideCheckpoints);
      writeCheckpoint(checkpointDB, id, seq, hideCheckpoints, mlog.wrap('writeCheckpoint'), utils.cb(callback, function(){
        if(state.cancelled)
        {
          return;
        }
        callback();
      }));
      return;
    }
    callback();
  });
  return p;
};

var setupQueues = function(queues, that, checkpointDB, id, hideCheckpoints, log){
  assert.ok(queues);
  assert.ok(that);
  assert.ok(checkpointDB);
  assert.ok(log);

  log('queues length: ' + queues.length);
  if(queues.length ===0)
  {
    throw new Error('you must pass a non zero length queues variable');
  }
  var notifyQueue = processorQueue(getAwaitingNotifyProcessor(writeCheckpoint, that.target_at_seq, checkpointDB, id, hideCheckpoints));


  notifyQueue.on('itemProcessed', function(seq){
    that.changeDone.apply(null, [seq]);
  });

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

var fetchCheckpoint = function(checkpointDB, id, hideCheckpoints, log, callback) {
  log('getting checkpoint');

  var cid = id;
  if(hideCheckpoints)
  {
    cid = '_local/' + cid;
  }


  checkpointDB.get(cid, function(err, doc) {
    if (err && err.status === 404) {
      log('could not get checkpoint with id: ' + cid);
      callback(null, 0);
    } else {
      log('got checkpoint at:' + doc.last_seq);
      callback(null, doc.last_seq);
    }
  });
};

var writeCheckpoint = function(checkpointDB, id, seq, hideCheckpoints, log, callback) {
  assert.ok(checkpointDB, 'must have a checkpointdb');
  assert.ok(id, 'must have a id');
  assert.ok(seq, 'must have a seq');
  var check = {
    _id: id,
    last_seq: seq
  };
  if(hideCheckpoints)
  {
    check._id = '_local/' + check._id;
  }
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
  assert.ok(id);
  assert.ok(srcDB);
  assert.ok(checkpointDB);
  assert.ok(queues);
  assert.ok(opts);
  assert.ok(initLog);

  var retries = opts.retries || 0;
  opts.filter = opts.filter || null;
  opts.reset = opts.reset || false;
  opts.continuous = opts.continuous || false;
  if(opts.hideCheckpoints === null)
  {
    opts.hideCheckpoints =  false;
  }
  

  var that = new events.EventEmitter();

  var log = utils.log(that);
  that.cancelled = false;
  that.total_changes =0;
  that.outstanding_changes =0;
  that.offline = true;

  that.sEmit = function(){
    try
    {
      that.emit.apply(that, arguments);
    }
    catch(error)
    {
      console.log('Error emitting');
      console.error(error);
    }
  };

  var initialReplicateComplete = function(seq){
    log('initialComplete');
    that.sEmit('initialReplicateComplete', seq);
  };

  var upToDate = function(seq){
    log('upToDate');
    that.sEmit('upToDate', seq);
  };

  var setupComplete = function(error){
    log('setupComplete');
    if(error)
    {
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
        log('error setting up, emitting error');
        that.sEmit('error', error);
      }
      return;
    }
    if(that.cancelled)
    {
      return;
    }
    log('setup complete, target at ' + that.target_at_seq + ' source is at ' + that.source_seq);
    that.emit('setupComplete');
    if(that.target_at_seq >= that.source_seq)
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

  var setup = utils.safe(setupComplete, function(){
    if(that.cancelled)
    {
      return;
    }
    log('getting sourceDB info');
    srcDB.info(utils.cb(setupComplete, function(info){
      that.source_seq = info.update_seq;
      log('sourceDB at ' + that.source_seq);
      log('gettting checkpoint');
      fetchCheckpoint(checkpointDB, id, opts.hideCheckpoints, log.wrap('getting checkpoint'), utils.cb(setupComplete, function(checkpoint) {
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

        setupQueues(queues, that,checkpointDB, id, opts.hideCheckpoints, initLog.wrap('setupQueues'));



        that.changeDone = function(seq){
          assert.ok(seq);
          log('change done: ' + seq);
          if(that.cancelled === true)
          {
            return;
          }
          that.outstanding_changes--; // = awaitingNotify.queued + awaitingSave.queued + awaitingGet.queued + awaitingDiff.queued;
          if(seq >= that.source_seq)
          {
            that.source_seq = seq;
          }
          that.sEmit('changeDone', seq);

          if(seq == info.update_seq)
          {
            initialReplicateComplete(seq);
          }
          else
          {
            log('not initial complete, at '  + seq + ' initial seq is ' + info.update_seq);
          }

          if(seq == that.source_seq)
          {
            upToDate(seq);
          }
          else
          {
            log('not up to date, at ' + seq + ' sourcs is at ' + that.source_seq);
          }
        };


        var incomingChange = function(change){
          if(!that.cancelled)
          {
            log('incoming change: ' + change.seq);
            that.total_changes++;
            that.outstanding_changes++; // = awaitingNotify.queued + awaitingSave.queued + awaitingGet.queued + awaitingDiff.queued;
            that.queueStack.enqueue(change.seq, change);
            that.sEmit('changeQueued', change);
          }
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
      setupComplete();
    }));
}));
});

var changes;
that.cancel = function(){
  log('cancelling');
  that.cancelled = true;
  that.sEmit('cancelled');
  if(changes && opts.continuous)
  {
    changes.cancel();
  }
  if(that.queueStack)
  {
    that.queueStack.cancel();
  }
  log('cancelled');
};

that.on('error', function(){
  try
  {
    that.cancel();
  }
  catch(e)
  {
    log('Could not cancel');
  }
});

setup();


return that;
};