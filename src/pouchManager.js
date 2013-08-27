/*global Pouch */
var utils = require('utils');
var url = require('url');
var events= require('events');
var async= require('async');
var assert = require('assert');

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
	var database = offlinePouch(name, url, opts, setupLog.wrap('databases: ' + name));
	that.databases[name] = database;
	utils.log.emitterToLog(database, databasesLog.wrap(name));
	that.emit('newDatabase', name, database);
	return database;
};
that.newService =  function(name, databaseName, queues, opts, setupLog){
	setupLog('creating service: '+ name);
	assert.ok(name);
	assert.ok(queues);
	assert.ok(that.databases[databaseName]);
	assert.ok(setupLog);

	var service = pouchService(name, that.databases[databaseName], that.databases.services, queues, opts, setupLog.wrap('services: ' + name));
	that.services[name] = service;
	that.emit('newService', name, service);
	service.on('error', function(){
		alert('SERVICE ERROR');
	});
	utils.log.emitterToLog(service, servicesLog.wrap(name));
	return service;
};

that.cancelled = false;

that.cancel = function(){
	log('cancelling');
	that.cancelled = true;
	for(var sname in that.services)
	{
		that.services[sname].cancel();
	}
	for(var dname in that.databases)
	{
		that.databases[dname].close();
	}
	log('cancelled');
	that.emit('cancelled');
};

that.reset = function(){
	that.cancel();
	that.databases = {};
	that.services = {};
	that.newDatabase('services', 'services', {localOnly: true}, log);
};
that.on('error', function(){
	that.cancel();
});


that.newDatabase('services', 'services', {localOnly: true}, log);

module.exports = that;