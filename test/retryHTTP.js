/*jslint node: true */
/*global describe */
/*global it */
/*global before */
/*global after */



var assert = require('assert');
var utils = require('utils');
var events = require('events');
var async = require('async');

var lib = require('../src/retryHTTP.js');
var testDelay = 50;

var masterLog = utils.log().wrap('processor');
describe('processor', function () {
	'use strict';
	it('1: should call function with correct aruments', function (done) {
		var mylog = masterLog.wrap('1');

		var onDone = function(error){
			if(error)
			{
				mylog.error(error);
			}
			done(error);
		};
		var myF = lib(function(a, b, cbk){
			assert.equal(a, 5);
			assert.equal(b, 'james');
			cbk(null, 7);
		});

		myF(5, 'james', utils.cb(onDone, function(c){
			assert.equal(c, 7);
			onDone();
		}));
	});

	it('2: should retry when HTTP fails', function (done) {
		this.timeout(testDelay*2);
		var mylog = masterLog.wrap('2');
		var onDone = function(error){
			if(error)
			{
				mylog.error(error);
			}
			done(error);
		};

		var j =0;
		var myF = lib(function(cbk){
			if(j===0)
			{
				j++;
				cbk({status:0});
			}
			else
			{
				cbk(null, 7);
			}
		}, testDelay);

		myF(utils.cb(onDone, function(c){
			assert.equal(c, 7);
			onDone();
		}));
	});
	it('3: should pass back other errors', function (done) {
		var mylog = masterLog.wrap('3');
		var onDone = function(error){
			if(error)
			{
				mylog.error(error);
			}
			done(error);
		};

		var myF = lib(function(cbk){
			cbk({status:12});
		}, testDelay);

		myF(utils.safe(onDone, function(err, c){
			assert.ok(err);
			onDone();
		}));
	});
});