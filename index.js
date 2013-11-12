module.exports = {};
module.exports.offlinePouch = require('./src/offlinePouch.js');
module.exports.replicator = require('./src/replicator.js');
module.exports.pouchService = require('./src/pouchService.js');
module.exports.processor = require('./src/processor.js');
module.exports.processorQueue = require('./src/processorQueue.js');
module.exports.processorQueueStack = require('./src/processorQueueStack.js');
module.exports.pouchManager= require('./src/pouchManager.js');
module.exports.retryHTTP= require('./src/retryHTTP.js');


if(typeof window ==='undefined')
{
	module.exports.designDoc = require('./src/designDoc.js');
}

