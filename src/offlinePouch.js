var utils = require('tsuju-utils');
var async = require('async');
var events = require('events');
var replicator = require('./replicator.js');
var assert = require('assert');
var url = require('url');

var pouch = require('tsuju-pouchdb');

var jsonCrypto = require('tsuju-jsoncrypto');
var retryHTTP = require('./retryHTTP.js');


module.exports = function(name, url, opts, log) {
    utils.is.string(name, 'name');
    utils.is.

    function(log, 'log');
    opts = opts || {};
    opts.useDocLocations = opts.useDocLocations || false;
    if (opts.useDocLocations) {
        utils.is.object(opts.docLocationPrivatePEMBuffer, 'opts.docLocationPrivatePEMBuffer');
        utils.is.object(opts.docLocationCert, 'opts.docLocationCert');
    }

    var retryDelay = opts.retryDelay || 5000;
    if (typeof opts.wipeLocal === 'undefined') {
        opts.wipeLocal = false;
    }
    var waitForInitialReplicate = true;
    if (typeof opts.waitForInitialReplicate !== undefined) {
        waitForInitialReplicate = opts.waitForInitialReplicate;
    }

    var filter = opts.filter;

    var retries = -1; // infinate retries

    var activeDB;
    var serverDB;
    var localDB;

    var setActiveDB = function(db, location) {
        if (db !== activeDB) {
            activeDB = db;
            if (location === 'local') {
                module.exports.setLocalDBCreated(url);
            }
            setLocation(location);
        }

    };

    var that = new events.EventEmitter();


    var runLog = utils.log(that);

    that.setupComplete = false;


    var mapped = ['put', 'post', 'get', 'allDocs', 'changes', 'bulkDocs', 'info', 'query', 'remove'];

    mapped.map(function(name) {
        that[name] = function() {
            var myArgs = arguments;
            if (typeof myArgs[myArgs.length - 1] === 'function') {
                //async
                if (that.setupComplete) {
                    activeDB[name].apply(activeDB, myArgs);
                    return;
                }
                log('setup not yet complete, delaying ' + name);
                that.on('setupComplete', function() {
                    log('setup complete, executing delayed: ' + name);
                    utils.safe(myArgs[myArgs.length - 1], function() {
                        activeDB[name].apply(activeDB, myArgs);
                    })();
                });
            } else {
                if (that.setupComplete) {
                    return activeDB[name].apply(activeDB, myArgs);
                } else {
                    console.dir(myArgs);
                    throw new Error('setup was not complete');
                }
            }
        };
    });


    that.cancelled = false;
    that.dispose = function(callback) {
        if (that.cancelled) {
            callback();
        }
        that.cancelled = true;
        that.emit('disposed');
        that.removeAllListeners();
        if (that.localDocLocation) {
            that.localDocLocation.cancel();
        }
        if (that.upReplicator) {
            log('cancelling up replicator');
            that.upReplicator.cancel();
            that.upReplicator.removeAllListeners();
        }

        if (that.downReplicator) {
            log('cancelling up replicator');
            that.downReplicator.cancel();
            that.downReplicator.removeAllListeners();
        }

        var toClose = [];
        if (serverDB) {
            log('closing server db');
            toClose.push(serverDB);
        }
        if (localDB) {
            log('closing local db');
            toClose.push(localDB);
        }

        async.forEach(toClose, function(db, cbk) {
            db.close(cbk);
        }, utils.cb(callback, function() {
            callback();
        }));
    };


    that.wipeLocalAndDispose = function(slog, cbk) {
        slog('wipeLocal');
        that.dispose(utils.cb(cbk, function() {
            if (module.exports.offlineSupported() && !opts.serverOnly) {
                var localName = module.exports.getLocalDBName(name);
                pouch.destroy(localName, cbk);
                return;
            }
            cbk();
        }));
    };

    var getServerDb = utils.f(function getServerDb(url, retries, retryDelay, slog, callback) {
        utils.safe(callback, function() {
            if (that.cancelled) {
                return;
            }
            var ret = retries;
            slog('pouch get db: ' + url);
            retryHTTP(pouch, slog.wrap('retryHTTP'), {
                retryErrors: [404]
            })(url, utils.cb(callback, function(db) {
                if (that.cancelled) {
                    return;
                }
                slog('pouch found');
                loadOrCreateLocationId(db, slog.wrap('loadOrCreateLocationId'), utils.cb(callback, function(id) {
                    if (that.cancelled) {
                        return;
                    }
                    db.locationId = id;
                    callback(null, db);
                }));

            }));
        })();
    });

    var getLocalDb = utils.f(function getLocalDb(pouchdb, name, wipeLocal, slog, callback) {
        var localDBName = module.exports.getLocalDBName(name);
        slog('creating localdb at:' + localDBName);
        utils.safe(callback, function() {
            if (that.cancelled) {
                return;
            }
            slog('getting local db: ' + localDBName);
            var openDB = function() {
                if (that.cancelled) {
                    return;
                }
                pouchdb(localDBName, utils.cb(callback, function(db) {
                    if (that.cancelled) {
                        return;
                    }
                    loadOrCreateLocationId(db, slog.wrap('loadOrCreateLocationId'), utils.cb(callback, function(id) {
                        if (that.cancelled) {
                            return;
                        }
                        db.locationId = id;
                        callback(null, db);
                    }));
                }));
            };
            if (wipeLocal) {
                slog('wiping existing if exists');
                pouchdb.destroy(localDBName, utils.safe(callback, function(err) {
                    openDB();
                }));
            } else {
                openDB();
            }

        })();
    });


    var setupComplete = function(error) {
        if (that.cancelled) {
            return;
        }
        if (error) {
            log('setup error');
            log.error(error);
            return;
        }
        createDocLocService();
        that.setupComplete = true;
        that.emit('setupComplete');
    };



    var revLocation = function(doc) {
        var that = {
            _id: doc._id + '_locations',
            type: revLocationTypeName
        };
        return that;
    };
    var revLocationTypeName = 'docLocation';
    var handleChange = function(change, sourcedb, onFail) {
        if (that.cancelled) {
            return;
        }
        var docLocLog = runLog.wrap('docLoc');
        utils.is.object(change);
        utils.is.object(sourcedb);
        var doc = change.doc;
        if (change.doc.type !== revLocationTypeName && ("_design/" !== doc._id.substr(0, 8)) && opts.useDocLocations) {
            docLocLog('is doc that needs a docLocation');
            var newRevLocation = revLocation(change.doc);
            docLocLog('checking for existing ' + newRevLocation._id);
            localDB.get(newRevLocation._id, utils.safe(onFail, function(error, existing) {
                if (that.cancelled) {
                    return;
                }
                if (error) {
                    if (error.message !== 'missing') {
                        onFail(error);
                        return;
                    }
                }
                if (existing) {
                    newRevLocation = existing;
                }
                newRevLocation[sourcedb.locationId] = doc._rev;

                if (!newRevLocation.creator) {
                    newRevLocation.creator = opts.docLocationCert.id;
                    newRevLocation.created = new Date();
                }

                runLog('signing the object');
                newRevLocation.editor = opts.docLocationCert.id;
                newRevLocation.edited = new Date();

                var signedDocLocation = jsonCrypto.signObject(newRevLocation, opts.docLocationPrivatePEMBuffer, opts.docLocationCert, true, runLog.wrap('jsonCrypto.signObject'));
                localDB.bulkDocs({
                    docs: [signedDocLocation]
                }, {}, utils.cb(onFail, function() {

                }));
            }));
        }
    };

    var createDocLocService = function() {
        if (that.cancelled) {
            return;
        }
        var onFail = function(error) {
            runLog.error(error);
        };
        that.on('upChangeDone', utils.safe(onFail, function(seq, change) {
            if (that.cancelled) {
                return;
            }
            handleChange(change, serverDB, onFail);
        }));
    };

    that.location = '';
    that.status = 'initializing';
    var setLocation = function(location) {
        if (that.location !== location) {
            that.location = location;
            that.emit('locationChanged', location);
        }
    };

    if (!module.exports.offlineSupported() || opts.serverOnly) {
        if (opts.localOnly) {
            throw new Error('localOnly requested but offline is not supported');
        }
        retries = 0;
        log('no browser support for local data, or serverOnly specified,  returning serverdb');
        getServerDb(url, retries, retryDelay, log.wrap('getting serverdb'), utils.cb(setupComplete, function(sdb) {
            if (that.cancelled) {
                return;
            }
            log('got server db');
            serverDB = sdb;
            setActiveDB(serverDB, 'server');
            setupComplete();
        }));
        return that;
    }

    log('browser supports local data');


    var setReplicator = function(upOrDown, replicator) {
        if (that.cancelled) {
            return;
        }
        var replicatorLog = runLog.wrap(upOrDown + 'Replicator');
        if (that[upOrDown + 'Replicator']) {
            that[upOrDown + 'Replicator'].removeAllListeners();
        }
        that[upOrDown + 'Replicator'] = replicator;
        utils.log.emitterToLog(replicator, replicatorLog);

        replicator.on('upToDate', function() {
            that.emit(upOrDown + 'UpToDate');
        });
        replicator.on('initialComplete', function() {
            that.emit(upOrDown + 'InitialComplete');
        });
        replicator.on('changeDone', function(seq, change) {
            that.emit(upOrDown + 'ChangeDone', seq, change);
        });

        replicator.on('Error', function(error) {
            that.emit('Error', error);
            that.dispose();
        });
    };



    that.goOnline = function(serverurl, rlog, cbk) {
        if (that.cancelled) {
            return;
        }
        retries = -1;
        rlog('getting serverdb');
        getServerDb(serverurl, retries, retryDelay, rlog.wrap('getting serverdb'), utils.cb(cbk, function(sdb) {
            rlog('init replication');
            if (that.cancelled) {
                return;
            }
            serverDB = sdb;
            //if there is no active db then use the server, better than nothing
            if (!activeDB) {
                setActiveDB(serverDB, 'server');
            }
            if (!waitForInitialReplicate) {
                cbk();
            }

            var repOpts = {
                filter: filter,
                continuous: true,
                retries: -1,
                retryInterval: 5000
            };
            if (opts.checkpointDb) {
                repOpts.checkpointDb = opts.checkpointDb;
            }
            //repOpts.reset = true;

            var upReplicator = replicator(localDB, serverDB, repOpts, rlog.wrap('init up replicator'));
            setReplicator('up', upReplicator);
            var downReplicator = replicator(serverDB, localDB, repOpts, rlog.wrap('init down replicator'));
            setReplicator('down', downReplicator);

            downReplicator.on('initialComplete', function() {
                if (that.cancelled) {
                    return;
                }
                setActiveDB(localDB, 'local');
                if (waitForInitialReplicate) {
                    cbk();
                }
            });
        }));
    };

    getLocalDb(pouch, name, opts.wipeLocal, log.wrap('get local db'), utils.cb(setupComplete, function(ldb) {
        if (that.cancelled) {
            return;
        }
        localDB = ldb;

        var onFail = function(error) {
            runLog.error(error);
        };

        if (!opts.localOnly) {
            that.localDocLocation = localDB.changes({
                continuous: true,
                include_docs: true,
                onChange: utils.safe(onFail, function(change) {
                    handleChange(change, localDB, onFail);
                })
            });
        }



        if (opts.localOnly) {
            log('local db only');
            setActiveDB(localDB, 'local');
            setupComplete();
            return;
        }
        if (module.exports.localDBAlreadyCreated(url) === true) {
            log('local data already created');
            setActiveDB(localDB, 'local');
            that.goOnline(url, runLog.wrap('going online'), function(error) {
                if (error) {
                    runLog.error(error);
                }
            });
            setupComplete();
        } else {
            log('local data not already created');
            if (waitForInitialReplicate === true) {
                log('waiting for initial replication');
                retries = -1;
                that.goOnline(url, log.wrap('going online'), utils.cb(setupComplete, function() {
                    setupComplete();
                }));

            } else {
                log('not waiting for initial replication, db ready to use');
                setActiveDB(localDB, 'local');
                that.goOnline(url, runLog.wrap('going online'), function(error) {
                    if (error) {
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

var setLocationId = function(id, p, lg, cbk) {
    retryHTTP(p.put, lg.wrap('retryHTTP'))({
        _id: '_local/_locationId',
        value: id
    }, utils.cb(cbk, function() {
        cbk(null, id);
    }));
};

var loadOrCreateLocationId = function(p, lg, cbk) {
    var get = p.get;
    var fLog = lg.wrap('retryHTTP');
    get('_local/_locationId',
        utils.safe(cbk, function(error, doc) {
            if (error) {
                if (error.message === 'missing') {
                    var newUuid = utils.uuid();
                    setLocationId(newUuid, p, lg.wrap('setLocationId'), cbk);
                    return;
                }
            }
            cbk(error, doc.value);
        }));
};





module.exports.getLocalDBName = function(name) {
    var localDBName;

    if (typeof window === 'undefined') {
        localDBName = 'stage/' + name;
    } else {
        localDBName = name;
    }
    return localDBName;
};



module.exports.offlineSupported = function() {
    if (typeof window === 'undefined') {
        //node, use levelDB
        return true;
    }
    if (window.indexedDB || window.openDatabase) {
        return true;
    } else {
        return false;
    }
};

module.exports.setLocalDBCreated = function(url) {};
module.exports.localDBAlreadyCreated = function(url) {
    return false;
};
