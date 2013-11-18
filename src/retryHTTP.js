//Function that retries on failed HTTP requests

var assert = require('assert');
var utils = require('utils');

var errorCodes = [0, 400, 401, 402, 408, 407, 500, 501, 503, 504, 505];

var isError = function(status, codes){
	var found = false;
	codes.map(function(code){
		if(code ===status)
		{
			found = true;
		}
	});
	return found;
};

module.exports = function(toWrap, log, opts){
	utils.is.function(toWrap);
	utils.is.function(log);

	opts = opts || {};
	if(typeof opts.retryErrors !== 'undefined')
	{
		utils.is.array(opts.retryErrors);
	}
	var timeout = opts.timeout || 5000;
	var retries = opts.retries || -1;
	var codes = errorCodes.slice(0);
	if(typeof opts.retryErrors !== 'undefined')
	{
		codes = codes.concat(opts.retryErrors);
	}

	codes.map(function(code){
		utils.is.number(code);
	});

	var that = function(){
		var argsArray = [];
		for(var i =0; i < arguments.length; i++)
		{
			argsArray.push(arguments[i]);
		}
		var newCallback;
		var wrapped = function(){
			try
			{
				toWrap.apply(null, argsArray);			
			}
			catch(e)
			{
				log('caught sync error');
				newCallback(e);
			}
		};

		var oldCallback = argsArray.pop();
		utils.is.function(oldCallback);
		newCallback = function(error){
			if(error && typeof error.status !== 'undefined' && isError(error.status, codes))
			{
				if(retries ===0)
				{
					return oldCallback.apply(this, arguments);
				}
				log('There was an error running the request of type: ' + error.status.toString() + ', retrying in: ' + timeout + ' milliseconds');
				//HTTP connection error, schedule a retry
				setTimeout(wrapped, timeout);
				retries--;
				return;
			}
			return oldCallback.apply(this, arguments);
		};

		argsArray.push(newCallback);
		wrapped();

	};

	return that;
};