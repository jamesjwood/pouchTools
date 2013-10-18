var events = require('events');
var utils = require('utils');
var jsonCrypto = require('jsonCrypto');
var async = require('async');
var assert = require('assert');

module.exports =function(processor, retryInterval){
  var queue = {};
  retryInterval = retryInterval || 500;

  var that = new events.EventEmitter();
  var log = utils.log(that);
  var processorLog = log.wrap('processor');


  that.cancelled = false;
  that.cancel = function(){
    that.cancelled = true;
    if(processor && processor.cancel)
    {
      processor.cancel();
    }
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

  var allItemsProcesseed = function(orginalAsArray, updated, unprocessed){
    var all = true;
    if(Object.keys(updated).length !== 0)
    {
      orginalAsArray.map(function(key){
        if(typeof updated[key] !== undefined)
        {
          unprocessed.push(key);
          all = false;
        }
      });
    }
    return all;
  };

  that.doneProcessing = function(error){
    that.queued = Object.keys(queue).length;
    if(!that.cancelled)
    {
      if(error)
      {
        if(typeof error.critical === 'undefined' || error.critical === null || error.critical === true)
        {
          setOffline(true);
          log('error processing queue: '+ error.message);
          log.error(error);
          that.cancel();
          return;
        }
        else
        {
          log('items failed to process, scheduling a retry in ' + retryInterval/100 + ' seconds');
          setOffline(true);
          setTimeout(that.process, retryInterval);
          processing = false;
          that.emit('state', 'idle');
          return;
        }
      }
      that.emit('log', 'done processing');
      processing = false;
      setOffline(false);
      if(awaitingProcessing)
        {
          log('more added while processing');
          setTimeout(that.process, 0);
        }
        else
      {
          awaitingProcessing = false;
          that.emit('state', 'idle');
      }
    }
  };
  var itemProcessed = function(seq, payload){
    log('raising item processed event for ' + seq);
    that.emit('itemProcessed', seq, payload);
  };

  that.process = utils.safe.catchSyncronousErrors(that.doneProcessing, function(){
    if(!processing && !that.cancelled)
    {
      itemsBeingProcessed = Object.keys(queue);
      that.queued = itemsBeingProcessed.length;
      if(that.queued > 0)
      {
        that.emit('state', 'busy');
        log('initiating processing');
        awaitingProcessing = false;
        processing = true;
        log('calling process');
        utils.safe.catchSyncronousErrors(that.doneProcessing, processor)(queue, itemProcessed, processorLog, that.doneProcessing);
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
    log('change queued ' + seq);
    queue[seq]= payload;
    if(!that.cancelled)
    {
      that.process();
    }
  };

  return that;
};