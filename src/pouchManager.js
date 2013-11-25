/*global Pouch */
var utils = require('utils');
var url = require('url');
var events= require('events');
var async= require('async');
var assert = require('assert');

var is = utils.is;
var that =  new events.EventEmitter();
var log = utils.log(that);
var databasesLog = log.wrap('databases');
var servicesLog = log.wrap('services');


var offlinePouch = require('./offlinePouch.js');
var pouchService = require('./pouchService.js');


that.databases = {};
that.services = {};

that.newDatabase = function(name, url, opts, setupLog){
	setupLog('creating database: '+ name);
	
	opts = opts || {};
	opts.checkpointDb = that.databases.services;
	if(that.databases[name])
	{
		throw new Error('database aready opened');
	}
	var database = offlinePouch(name, url, opts, setupLog);
	that.databases[name] = database;
	utils.log.emitterToLog(database, databasesLog.wrap(name));
	that.emit('newDatabase', name, database);
	return database;
};
that.newService =  function(name, databaseName, queues, opts, setupLog){
	setupLog('creating service: '+ name);
	is.string(name);
	is.string(databaseName);
	is.array(queues);
	is.function(setupLog);
	opts = opts || {};

	if(!that.databases.services)
	{
		log('services db not created, creating..');
		that.newDatabase('services', 'services', {localOnly: true}, log.wrap('newDatabase, services'));	
	}

	assert.ok(that.databases[databaseName], 'there was no database with the name: ' + databaseName);
	opts = opts || {};
	opts.hideCheckpoints = false;

	if(that.services[name])
	{
		throw new Error('service aleady started');
	}
	var service = pouchService(name, that.databases[databaseName], that.databases.services, queues, opts, setupLog);
	that.services[name] = service;
	that.emit('newService', name, service);
	utils.log.emitterToLog(service, servicesLog.wrap(name));
	return service;
};

that.cancelled = false;

that.close = utils.f(function close(callback){
	log('cancelling');
	that.cancelled = true;
	for(var sname in that.services)
	{
		that.services[sname].cancel();
	}
	async.forEach(that.databases, function(dname, cbk){
		that.databases[dname].close(cbk);
	}, utils.cb(callback, function(){
		log('cancelled');
		that.emit('cancelled');
		callback();
	}));
}, 'close');

that.wipeLocal = utils.f(function wipeLocal(slog, cbk){
	that.close(utils.cb(cbk, function(){
		async.forEachSeries(Object.keys(that.databases), function(name, cb){
			slog('wiping: ' + name);
			that.databases[name].wipeLocal(slog.wrap('wipe ' + name), cb);
		}, utils.cb(cbk, function(){
				slog('all wiped');
				that.databases = {};
				that.services = {};
				that.cancelled = false;
				cbk();
		}));
	}));
}, 'wipeLocal');


//that.on('error', function(){
	//that.cancel();
//});




module.exports = that;