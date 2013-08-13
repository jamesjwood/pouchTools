/**
 * Created with JetBrains WebStorm.
 * User: jameswood
 * Date: 31/10/2012
 * Time: 09:42
 * To change this template use File | Settings | File Templates.
 */

 /*jslint node: true */
 /*global describe */
 /*global it */
 /*global before */
 /*global after */



 var assert = require('assert');
 var utils = require('utils');
 var events = require('events');

 var masterLog = utils.log().wrap('processor');
 var lib = require('../src/processor.js');
 var nano = require('nano');
 var async = require('async');


 describe('processor', function () {
  'use strict';

  it('1: processor should call ', function (done) {
   var mylog = masterLog.wrap('1');
   var onDone = function (error) {
    if (error) {
      mylog.error(error);
    }
    done(error);
  };

  var changes = {test: 1};
  var queueProcessor = lib(function(id, data, log, callback){
    assert.equal('test', id);
    callback();
  });
  queueProcessor(changes, function(){}, mylog.wrap('processor'), function(error){
    assert.equal('undefined', typeof changes.test);
    onDone(error);
  });
});


  it('2: processor should call each', function (done) {
   var mylog = masterLog.wrap('2');
   var onDone = function (error) {
    if (error) {
      mylog.error(error);
    }
    done(error);
  };
  var changes = {test: 1, test2: 2};
  var count = 0;
  var queueProcessor = lib(function(id, data, log, callback){
    count++;
    callback();
  });
  queueProcessor(changes, function(){}, mylog.wrap('processor'), function(error){
    assert.equal('undefined', typeof changes.test);
    assert.equal('undefined', typeof changes.test2);
    assert.equal(2, count);
    onDone();
  });
});

  it('3: processor should raise processed events', function (done) {
   var mylog = masterLog.wrap('3');
   var onDone = function (error) {
    if (error) {
      mylog.error(error);
    }
    done(error);
  };
  var changes = {test: 1, test2: 2};

  var queueProcessor = lib(function(id, data, log, callback){
    callback(null, 1, 2, 3, 4, 5, 6);
  });

  var total =0;

  var itemProcessed = function(seq, a, b, c, d, e, f){
    assert.equal(a, 1);
    assert.equal(b, 2);
    assert.equal(c, 3);
    assert.equal(d, 4);
    assert.equal(e, 5);
    assert.equal(f, 6);
    total = total  +1;
  };

  queueProcessor(changes, itemProcessed, mylog.wrap('processor'), function(error){
    assert.equal(2, total);
    onDone();
  });
});
});