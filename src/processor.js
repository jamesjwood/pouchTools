
var events = require('events');
var utils = require('utils');
var async = require('async');
var assert = require('assert');

module.exports = function(processItem){
  var that = function(queue, itemProcessed, log, callback){
    assert.ok(queue);
    assert.ok(itemProcessed);
    assert.ok(log);
    assert.ok(callback);
    async.forEachSeries(Object.keys(queue), function(seq, cbk){
      assert.ok(seq);
      log('item: ' + seq);
      var onDone = function(error, payload){
        if(error)
        {
          log('error processing seq: ' + seq);
          cbk(error);
          return;
        }
        log('done ' + seq);
        itemProcessed.apply(null,[seq, payload]);
        delete queue[seq];
        cbk();
      };
      var item = queue[seq];
      utils.safe(onDone, processItem)(seq, item, log.wrap('seq: ' + seq), onDone);
    }, callback);
  };
  return that;
};