
/*jslint node: true */
/*global describe */
/*global it */
/*global before */
/*global after */



var assert = require('assert');
var utils = require('utils');
var events = require('events');

var masterLog = utils.log().wrap('processorQueue');

var lib = require('../src/processorQueue.js');
var processor = require('../src/processor.js');

var async = require('async');



describe('processorQueue', function () {
  'use strict';

  it('1: should raise state event', function (done) {
   var mylog = masterLog.wrap('1');
   var onDone = function (error) {
    if (error) {
      mylog.error(error);
    }
    done(error);
  };

  var queueProcessor = function(queue, itemProcessed, log, callback){
    assert.ok(queue);
    assert.ok(itemProcessed);
    assert.ok(log);
    assert.ok(callback);

    assert.equal('hello', queue[1].id);
    var item =  queue[1];
    delete queue[1];
    itemProcessed(item);
    callback();
  };

  var queue = lib(queueProcessor);
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
  it('2: should raise processed events', function (done) {
   var mylog = masterLog.wrap('2');
   var onDone = function (error) {
    if (error) {
      mylog.error(error);
    }
    done(error);
  };

  var queueProcessor = function(queue, itemProcessed, log, callback){
    assert.ok(queue);
    assert.ok(itemProcessed);
    assert.ok(log);
    assert.ok(callback);

    assert.equal('hello', queue['1']);

    itemProcessed('1', 'hello');
    delete queue['1'];
    callback();
  };

  var queue = lib(queueProcessor);
  queue.on('error', function(error){
    onDone(error);
  });
  queue.on('log', function(message){
   mylog(message);
 });

  var payload = 'hello';

  queue.on('itemProcessed', function(seq, pay){
   assert.equal('1', seq);
   assert.equal('hello', pay);
   onDone();
 });
  queue.enqueue('1', payload);
});

  this.timeout(10000);
  it('3: should process items in order', function (done) {
   var mylog = masterLog.wrap('3');
   var onDone = function (error) {
    if (error) {
      mylog.error(error);
    }
    done(error);
  };
    var j=0;
    var t = false;

    var queueProcessor = processor(function(seq, pay, state,lg,cbk){
      mylog('processing ' + seq);
      assert.equal(j.toString(), seq);
      if(j >= 200)
      {
        onDone();
        return;
      }
      else
      {
        j++;
        setTimeout(cbk, 10);
      }
    });

    var queue = lib(queueProcessor);
    
    queue.on('error', onDone);
    utils.log.emitterToLog(queue, mylog.wrap('queue'));
 
    for(var i = 0; i <= 100; i ++)
    {
      mylog('queueing ' + i);
      queue.enqueue(i.toString(), {id: i});
    }

    var intervalID = setInterval(function(){
      if(i>200)
      {
        clearInterval(intervalID);
        return;
      }
      mylog('adding item ' + i.toString());
      queue.enqueue(i.toString(), {id: i});
      i++;
    }, 10);
  });
});