process.env.LOG = 'false';

module.exports = {};
module.exports.processor = require('./test/processor.js');
module.exports.processorQueue = require('./test/processorQueue.js');
module.exports.processorQueueStack = require('./test/processorQueueStack.js');
module.exports.pouchService = require('./test/pouchService.js');
module.exports.replicator = require('./test/replicator.js');
module.exports.offlinePouch = require('./test/offlinePouch.js');
module.exports.pouchManager= require('./src/pouchManager.js');
module.exports.retryHTTP= require('./src/retryHTTP.js');

if(typeof window === 'undefined')
{
	module.exports.designDoc= require('./src/designDoc.js');
}
