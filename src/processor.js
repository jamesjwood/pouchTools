
var events = require('events');
var utils = require('utils');
var async = require('async');
var assert = require('assert');

module.exports = function(processItem){

  var state = {cancelled: false};
  var that = function(queue, itemProcessed, log, callback){
    assert.ok(queue);
    assert.ok(itemProcessed);
    assert.ok(log);
    assert.ok(callback);
    async.forEachSeries(Object.keys(queue), function(seq, cbk){
      assert.ok(seq);
      if(that.cancelled)
      {
        return;
      }

      log('item: ' + seq);
      var onDone = function(error, payload){
        if(that.cancelled)
        {
          return;
        }
        if(error)
        {
          var e = new Error('error processing seq: ' + seq);
          e.inner = error;
          cbk(e);
          return;
        }
        log('done ' + seq);
        itemProcessed.apply(null,[seq, payload]);
        delete queue[seq];
        cbk();
      };
      var item = queue[seq];
      utils.safe(onDone, processItem)(seq, item, state, log.wrap('seq: ' + seq), onDone);
    }, callback);
  };
  that.cancelled = false;
  that.cancel = function(){
    that.cancelled = true;
    state.cancelled = true;
  };
  return that;
};