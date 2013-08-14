
var events = require('events');
var utils = require('utils');
var async = require('async');

module.exports = function(processItem){
  var that = function(queue, itemProcessed, log, callback){
    async.forEachSeries(Object.keys(queue), function(seq, cbk){
      log('item: ' + seq);
      var onDone = function(error){
        if(error)
        {
          log('error processing seq: ' + seq);
          cbk(error);
          return;
        }
        log('done ' + seq);

        var args = Array.prototype.slice.call(arguments, 0);
        args[0] = seq;
        itemProcessed.apply(null, args);
        delete queue[seq];
        cbk();
      };
      utils.safe(onDone, processItem)(seq, queue[seq], log, onDone);
    }, callback);
  };
  return that;
};