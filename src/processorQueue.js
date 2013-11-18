var events = require('events');
var utils = require('utils');
var jsonCrypto = require('jsonCrypto');
var async = require('async');
var assert = require('assert');

module.exports =function(processor, opts){
  var incomingQueue = {};
  var processingQueue= {};
  opts = opts || {};

  var retryInterval = opts.retryInterval || 0;
  var name = opts.name;


  var that = new events.EventEmitter();
  that.name = name;

  var log;
  if(name)
  {
    log = utils.log(that).wrap(name);
  }
  else
  {
    log = utils.log(that);
  }

  var processorLog = log.wrap('processor');


  that.cancelled = false;
  that.cancel = function(){
    if(!that.cancelled)
    {
      that.cancelled = true;
      if(processor && processor.cancel)
      {
        processor.cancel();
      }
      that.emit('cancelled');
      that.removeAllListeners();
    } 
  };

  var itemsBeingProcessed = [];
  var processing = false;
  that.offline = true;

  var setOffline= function(off){
    if(that.offline !== off)
    {
      that.offline = off;
      that.emit('offline', off);
    }
  };


  that.doneProcessing = function(error){
    var processingCount = Object.keys(processingQueue).length;
    var incomingCount = Object.keys(incomingQueue).length;
    var totalCount = processingCount  + incomingCount;

    if(!that.cancelled)
    {
      if(error)
      {
        setOffline(true);
        var e = new Error('error processing queue: '+ error.message);
        e.inner = error;
        log.error(e);
        that.cancel();
        return;
      }
      that.emit('log', 'done processing');
      
      if(totalCount>0)
      {
          log('new items added, processing immediately');
          setTimeout(function(){
            processing = false;
            that.checkToProcess();
          }, opts.retryInterval);
      }
      else
      {
          processing = false;
          that.emit('state', 'idle');
      }
    }
  };
  var itemProcessed = function(seq, payload){
    log('raising item processed event for ' + seq);
    that.emit('itemProcessed', seq, payload);
  };

  that.process = utils.safe.catchSyncronousErrors(that.doneProcessing, function(){
    that.emit('state', 'busy');
    log('initiating processing');
    processing = true;
    log('calling process');
    utils.safe.catchSyncronousErrors(that.doneProcessing, processor)(processingQueue, itemProcessed, processorLog, that.doneProcessing);
  });

  that.checkToProcess = utils.safe.catchSyncronousErrors(that.doneProcessing, function(){
    if(!processing && !that.cancelled)
    {
      log('not processing, going ahead');
      for(var seq in incomingQueue)
      {
        processingQueue[seq] = incomingQueue[seq];
        delete incomingQueue[seq];
      }
      var beingProcessed = Object.keys(processingQueue).length;
      if(beingProcessed > 0)
      {
        that.process();
      }
    }
    else
    {
      log('already processing');
    }
  });

  that.enqueue = function(seq, payload){
    log('change queued ' + seq);
    incomingQueue[seq]= payload;
    that.checkToProcess();
  };

  return that;
};