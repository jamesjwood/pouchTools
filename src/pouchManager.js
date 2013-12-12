/*global Pouch */
var utils = require('utils');
var url = require('url');
var events = require('events');
var async = require('async');
var assert = require('assert');

var is = utils.is;
var that = new events.EventEmitter();
var log = utils.log(that);
var databasesLog = log.wrap('databases');
var servicesLog = log.wrap('services');


var offlinePouch = require('./offlinePouch.js');
var pouchService = require('./pouchService.js');

var processor = require('./processor.js');
var processorQueue = require('./processorQueue.js');

that.databases = {};
that.services = {};
that.views = {};
var pouch = require('pouchdb');



that.newDatabase = function(name, url, opts, setupLog) {
    setupLog('creating database: ' + name);
    opts = opts || {};
    opts.checkpointDb = that.databases.services;
    if (that.databases[name]) {
        throw new Error('database aready opened');
    }

    var database = offlinePouch(name, url, opts, setupLog);

    that.databases[name] = database;
    utils.log.emitterToLog(database, databasesLog.wrap(name));
    that.emit('newDatabase', name, database);
    return database;
};


that.newService = function(name, databaseName, queues, opts, setupLog) {
    setupLog('creating service: ' + name);
    is.string(name);
    is.string(databaseName);
    is.array(queues);
    is.

    function(setupLog);
    opts = opts || {};

    if (!that.databases.services) {
        log('services db not created, creating..');
        that.newDatabase('services', 'services', {
            localOnly: true
        }, log.wrap('newDatabase, services'));
    }

    assert.ok(that.databases[databaseName], 'there was no database with the name: ' + databaseName);
    opts = opts || {};
    opts.hideCheckpoints = false;

    if (that.services[name]) {
        throw new Error('service aleady started');
    }
    var service = pouchService(name, that.databases[databaseName], that.databases.services, queues, opts, setupLog);
    that.services[name] = service;
    that.emit('newService', name, service);
    utils.log.emitterToLog(service, servicesLog.wrap(name));
    return service;
};

that.newView = function(name, generatorPairs, opts, setupLog) {
    utils.is.string(name);
    utils.is.array(generatorPairs);
    var newView = {};

    var op = {
        localOnly: true
    };
    if (opts.wipeLocal) {
        op.wipeLocal = true;
    }
    var viewDB = that.newDatabase(name, null, op, setupLog);

    var pair = generatorPairs[0];
    var databaseName = pair.databaseName;
    var generatorFunction = pair.generatorFunction;
    utils.is.string(databaseName);
    utils.is.

    function(generatorFunction);

    var genProcessor = processor(function(seq, item, stage, log, cbk) {
        generatorFunction(viewDB, seq, item, stage, log, cbk);
    });

    var newService = that.newService(name + "_" + databaseName, databaseName, [processorQueue(genProcessor)], {}, setupLog.wrap('newService'));

    newView.db = viewDB;
    newView.services = {
        databaseName: newService
    };
    that.views[name] = newView;

    newView.dispose = function(cbk) {
        utils.is.

        function(cbk);
        for (var name in newView.services) {
            newView.services[name].dispose();
        }
        this.db.dispose(utils.cb(cbk, function() {
            cbk();
        }));
    };

    return newView;
};

that.cancelled = false;

that.dispose = utils.f(function dispose(callback) {
    log('cancelling');
    that.cancelled = true;
    for (var vname in that.views) {
        that.views[vname].dispose();
        delete that.views[vname];
    }
    for (var sname in that.services) {
        that.services[sname].dispose();
        delete that.services[sname];
    }
    async.forEach(Object.keys(that.databases), function(dname, cbk) {
        that.databases[dname].dispose(utils.cb(cbk, function() {
            delete that.databases[dname];
            cbk();
        }));
    }, utils.cb(callback, function() {
        log('cancelled');
        that.emit('cancelled');
        callback();
    }));
}, 'dispose');

that.wipeLocal = utils.f(function wipeLocal(slog, cbk) {
    that.dispose(utils.cb(cbk, function() {
        async.forEachSeries(Object.keys(that.databases), function(name, cb) {
            slog('wiping: ' + name);
            that.databases[name].wipeLocal(slog.wrap('wipe ' + name), cb);
        }, utils.cb(cbk, function() {
            slog('all wiped');
            var databaseList = Object.keys(that.databases).concat(["users", "lists", "shares", "services"]);
            async.forEachSeries(databaseList, function(name, cb) {
                pouch.destroy(name, utils.safe(cb, function() {
                    cb();
                }));
            }, utils.cb(cbk, function() {
                that.databases = {};
                that.services = {};
                that.cancelled = false;
                cbk();
            }));
        }));
    }));
}, 'wipeLocal');


//that.on('error', function(){
//that.cancel();
//});




module.exports = that;
