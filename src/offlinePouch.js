
var utils = require('utils');
var async = require('async');
var events = require('events');
var replicator = require('./replicator.js');
var assert = require('assert');
var url = require('url');

var pouch = require('pouchdb');


var retryHTTP = require('./retryHTTP.js');


module.exports = function(name, url, opts, log){
	assert.ok('name');
	assert.ok('opts');
	assert.ok('log');

	var retryDelay = opts.retryDelay || 5000;
	if(typeof opts.wipeLocal === 'undefined')
	{
		opts.wipeLocal = false;
	}
	var waitForInitialReplicate = true;
	if(typeof opts.waitForInitialReplicate !== undefined)
	{
		waitForInitialReplicate = opts.waitForInitialReplicate;
	}

	var filter = opts.filter;

	var retries = -1; // infinate retries

	var activeDB;
	var serverDB;
	var localDB;

	var setActiveDB = function(db, location){
		if(db !== activeDB)
		{
			activeDB = db;
			if(location === 'local')
			{
				module.exports.setLocalDBCreated(url);
			}
			setLocation(location);
		}

	};

	var that = new events.EventEmitter();


	var runLog = utils.log(that);

	that.setupComplete = false;


	var mapped = ['put', 'post', 'get', 'allDocs', 'changes', 'bulkDocs', 'info', 'view', 'query', 'remove'];

	mapped.map(function(name){
		that[name] = function(){
			var myArgs = arguments;
			if(typeof myArgs[myArgs.length-1] === 'function')
			{
				//async
				if(that.setupComplete)
				{
					activeDB[name].apply(activeDB, myArgs);
					return;
				}
				log('setup not yet complete, delaying ' + name);
				that.on('setupComplete', function(){
					log('setup complete, executing delayed: ' + name);
					utils.safe(myArgs[myArgs.length-1], function(){
						activeDB[name].apply(activeDB, myArgs);
					})();	
				});	
			}
			else
			{
				activeDB[name].apply(activeDB, myArgs);
			}	
		};
	});

	that.close = function(){
		if(that.replicator)
		{
			log('cancelling replicator');
			that.replicator.cancel();
		}
		if(serverDB)
		{
			log('closing server db');
			serverDB.close();
		}
		if(localDB)
		{
			log('closing local db');
			localDB.close();
		}
		that.removeAllListeners();
	};

	that.wipeLocal = function(slog, cbk){
		slog('wipeLocal');
		that.close();
		if(module.exports.offlineSupported() && !opts.serverOnly)
		{
			var localName =	module.exports.getLocalDBName(name);
			pouch.destroy(localName, cbk);
		}
	};


	var setupComplete = function(error){
		if(error)
		{
			log('setup error');
			log.error(error);
			return;
		}
		that.setupComplete = true;
		that.emit('setupComplete');
	};


	that.location = '';
	that.status = 'initializing';
	var setLocation = function(location){
		if(that.location !== location)
		{
			that.location = location;
			that.emit('locationChanged', location);
		}
	};

	if(!module.exports.offlineSupported() || opts.serverOnly)
	{
		if (opts.localOnly)
		{
			throw new Error('localOnly requested but offline is not supported');
		}
		retries = 0;
		log('no browser support for local data, or serverOnly specified,  returning serverdb');
		module.exports.getServerDb(url, retries, retryDelay, log.wrap('getting serverdb'),  utils.cb(setupComplete, function(sdb){
			log('got server db');
			serverDB = sdb;
			setActiveDB(serverDB, 'server');
			setupComplete();
		}));
		return that;
	}

	log('browser supports local data');



	

	var setReplicator = function(opOrDown, replicator){		
		var replicatorLog = runLog.wrap(opOrDown + 'Replicator');
		if (that[opOrDown + 'Replicator'])
		{
			that[opOrDown + 'Replicator'].removeAllListeners();
		}
		that[opOrDown + 'Replicator'] = replicator;
		utils.log.emitterToLog(replicator, replicatorLog);

		replicator.on('upToDate', function(){
			that.emit(opOrDown + 'UpToDate');
		});
		replicator.on('initialReplicateComplete', function(){
			that.emit(opOrDown + 'InitialReplicateComplete');
		});
	};


	that.goOnline = function(serverurl, rlog, cbk){
		retries = -1;
		rlog('getting serverdb');
		module.exports.getServerDb(serverurl, retries, retryDelay,  rlog.wrap('getting serverdb'), utils.cb(cbk, function(sdb){
			rlog('init replication');
			serverDB= sdb;
			//if there is no active db then use the server, better than nothing
			if(!activeDB)
			{
				setActiveDB(serverDB, 'server');
			}
			if(!waitForInitialReplicate)
			{
				cbk();					
			}

			var repOpts = {filter: filter, continuous: true, retries: -1, retryInterval: 5000};
			if(opts.checkpointDb)
			{
				repOpts.checkpointDb = opts.checkpointDb;
			} 
			//repOpts.reset = true;

			var upReplicator = replicator(localDB, serverDB, repOpts, rlog.wrap('init up replicator'));
			setReplicator('up', upReplicator);
			var downReplicator = replicator(serverDB, localDB, repOpts, rlog.wrap('init down replicator'));
			setReplicator('down', downReplicator);

			downReplicator.on('initialReplicateComplete',  function(){
				setActiveDB(localDB, 'local');
				if(waitForInitialReplicate)
				{
					cbk();					
				}
			});
		}));
	};

	module.exports.getLocalDb(pouch, name, opts.wipeLocal, log.wrap('get local db'),utils.cb(setupComplete, function(ldb){
		localDB = ldb;

		if(opts.localOnly)
		{
			log('local db only');
			setActiveDB(localDB, 'local');
			setupComplete();
			return;
		}
		if(module.exports.localDBAlreadyCreated(url) === true)
		{
			log('local data already created');
			setActiveDB(localDB, 'local');
			that.goOnline(url, runLog.wrap('going online'), function(error){
				if(error){
					runLog.error(error);
				}
			});
			setupComplete();
		}
		else
		{
			log('local data not already created');
			if(waitForInitialReplicate === true)
			{
				log('waiting for initial replication');
				retries = -1;
				that.goOnline(url, log.wrap('going online'), utils.cb(setupComplete, function(){
					setupComplete();
				}));
				
			}
			else
			{
				log('not waiting for initial replication, db ready to use');
				setActiveDB(localDB, 'local');
				that.goOnline(url, runLog.wrap('going online'), function(error){
					if(error){
						console.dir(error);
						runLog.error(error);
					}
				});
				setupComplete();
			}
		}
	}));
	return that;
};


module.exports.getServerDb = function(url, retries, retryDelay, log, callback){
	utils.safe(callback, function(){
		var ret  = retries;
		log('pouch get db: ' + url);
		retryHTTP(pouch, log.wrap('retryHTTP'))(url, utils.cb(callback, function(db){
			log('pouch found');
			callback(null, db);
		}));
	})();
};

module.exports.getLocalDb = function(pouchdb, name, wipeLocal, log, callback){
	var localDBName = module.exports.getLocalDBName(name);
	log('creating localdb at:' + localDBName);
	utils.safe(callback, function(){
		log('getting local db: ' + localDBName);
		var openDB = function(){
			pouchdb(localDBName, utils.cb(callback, function(db){
				callback(null, db);
			}));
		};
		if(wipeLocal)
		{
			pouchdb.destroy(localDBName, utils.safe.catchSyncronousErrors(callback, function(){
				openDB();
			}));
		}
		else
		{
			openDB();
		}

	})();
};
module.exports.getLocalDBName = function(name){
	var localDBName;

	if(typeof window === 'undefined')
	{
		localDBName = 'stage/' + name;
	}
	else
	{
		localDBName = name;
	}
	return localDBName;
};



module.exports.offlineSupported = function(){
	if(typeof window === 'undefined')
	{
		//node, use levelDB
		return true;
	}
	if (window.indexedDB || window.openDatabase) {
		return true;
	}
	else
	{
		return false;
	}
};

module.exports.setLocalDBCreated = function(url){
};
module.exports.localDBAlreadyCreated = function(url){
	return false;
};