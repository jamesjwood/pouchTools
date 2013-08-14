
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

    assert.equal('hello', queue[1].id);
    var item =  queue[1];
    delete queue[1];
    itemProcessed(item.id, item);
    callback();
  };

  var queue = lib(queueProcessor);
  queue.on('error', function(error){
    onDone(error);
  });
  queue.on('log', function(message){
   mylog(message);
 });

  var payload = {id: 'hello'};
  queue.on('itemProcessed', function(seq, pay){
     assert.equal('hello', seq);
     assert.equal(payload, pay);
     onDone();

  });
  queue.enqueue(1, payload);
});
});