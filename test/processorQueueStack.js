
/*jslint node: true */
/*global describe */
/*global it */
/*global before */
/*global after */



var assert = require('assert');
var utils = require('utils');
var events = require('events');

var masterLog = utils.log().wrap('processorQueueStack');

var queue = require('../src/processorQueue.js');
var processor = require('../src/processor.js');

var lib = require('../src/processorQueueStack.js');

var async = require('async');



describe('processorQueueStack', function () {
	'use strict';

	it('1: should pass through queues', function (done) {

		var mylog = masterLog.wrap('1');
		var onDone = function (error) {
			if (error) {
				mylog.error(error);
			}
			done(error);
		};


		var nothingF = function(seq, payload, log, callback){
			log('run');
			var newPayload = JSON.parse(JSON.stringify(payload));
			newPayload.count = newPayload.count +1;
			callback(null, newPayload);
		};

		var queue1 = queue(processor(nothingF));
		var queue2 = queue(processor(nothingF));
		var queue3 = queue(processor(nothingF));
		var queue4 = queue(processor(function(seq, payload, log, callback){
			log('run');
			assert.ok(payload);
			assert.equal(payload.count, 4);
			callback();
			onDone();
		}));
		var queues = [queue1, queue2, queue3, queue4];
		var stack = lib(queues);
		stack.on('error', onDone);
		utils.log.emitterToLog(stack, mylog);

		queue1.enqueue(1, {id: 'hello', count: 1});
	});
});