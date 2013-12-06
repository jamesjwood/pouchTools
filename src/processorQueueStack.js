var events = require('events');
var utils = require('utils');
var async = require('async');
var assert = require('assert');

module.exports = function(queues) {
    assert.ok(queues);
    var that = new events.EventEmitter();
    that.cancelled = false;

    var log = utils.log(that);

    that.offline = true;

    var getQueF = function(i) {
        var f = function() {
            queues[i + 1].enqueue.apply(null, arguments);
        };
        return f;
    };

    for (var i = 0; i < queues.length - 1; i++) {
        var f = getQueF(i);
        queues[i].on('itemProcessed', f);
    }

    var updateOffline = function() {
        if (!that.cancelled) {
            var off = false;
            for (var i = 0; i < queues.length; i++) {
                if (queues[i].offline) {
                    off = true;
                }
            }
            if (that.offline !== off) {
                that.offline = off;
                that.emit('offline', that.offline);
            }
        }
    };

    for (var j = 0; j < queues.length; j++) {
        var currentQueue = queues[j];
        currentQueue.addListener('offline', updateOffline);
        utils.log.emitterToLog(currentQueue, log.wrap('queue: ' + j));
    }

    that.cancel = function() {
        that.cancelled = true;
        for (var i = 0; i < queues.length; i++) {
            queues[i].cancel();
        }
    };

    that.enqueue = function() {
        queues[0].enqueue.apply(null, arguments);
    };
    return that;
};
