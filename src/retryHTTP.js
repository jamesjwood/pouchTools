//Function that retries on failed HTTP requests



var errorCodes = [0, 401, 402, 408, 407, 500, 501, 503, 504, 505];

var isError = function(status){
	var found = false;
	errorCodes.map(function(code){
		if(code ===status)
		{
			found = true;
		}
	});
	return found;
};

module.exports = function(toWrap, inTimeout){
	var timeout = inTimeout || 5000;
	var that = function(){
		var argsArray = [];
		for(var i =0; i < arguments.length; i++)
		{
			argsArray.push(arguments[i]);
		}
		var oldCallback = argsArray.pop();
		var newCallback = function(error){
			if(error && typeof error.status !== 'undefined' && isError(error.status))
			{
				//HTTP connection error, schedule a retry
				setTimeout(function(){
					toWrap.apply(null, argsArray);
				}, timeout);
				return;
			}
			return oldCallback.apply(this, arguments);
		};

		argsArray.push(newCallback);
		toWrap.apply(null, argsArray);
	};

	return that;
};