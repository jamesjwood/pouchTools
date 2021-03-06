/*jslint node: true */
/*global describe */
/*global it */
/*global before */
/*global after */

var assert = require('assert');
var utils = require('tsuju-utils');
var events = require('events');
var sinon = require('sinon');



var async = require('async');
var lib = require('../src/designDoc.js');
var validateDoc = require('../src/validateDoc.js');
var pouch = require('tsuju-pouchdb');
var jsonCrypto = require('tsuju-jsoncrypto');


var masterLog = utils.log().wrap('designDoc');
var serverURL = 'http://admin:password@localhost:5985';



var EXPONENT = 65537;
var MODULUS = 512;

var rootKeyBufferPair = jsonCrypto.generateKeyPEMBufferPair(MODULUS, EXPONENT);
var rootCert = jsonCrypto.createCert(rootKeyBufferPair.publicPEM);
assert.ok(rootCert, "rootCert not returned");

var userKeyBufferPair = jsonCrypto.generateKeyPEMBufferPair(MODULUS, EXPONENT);
var userCert = jsonCrypto.createCert(userKeyBufferPair.publicPEM);

var signedUserCert = jsonCrypto.signObject(userCert, rootKeyBufferPair.privatePEM, rootCert, true, masterLog);


var user2KeyBufferPair = jsonCrypto.generateKeyPEMBufferPair(MODULUS, EXPONENT);
var user2Cert = jsonCrypto.createCert(user2KeyBufferPair.publicPEM);

var signedUser2Cert = jsonCrypto.signObject(user2Cert, rootKeyBufferPair.privatePEM, rootCert, true, masterLog);


var VALIDATE_PATH = __dirname + '/../src/validateDoc.js';
var RELATIVE_PATH = '/src/validateDoc.js';

describe('designDoc', function() {
    'use strict';

    var cleanDB = function(done) {

        async.forEachSeries(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], function(name, cbk) {

            pouch.destroy(serverURL + '/test_designdoc_' + name, function(error, body) {
                cbk();
            });
        }, function(error) {
            done(error);
        });
    };


    before(function(done) {
        cleanDB(function() {
            assert.ok(rootCert, 'rootCert not returned');
            assert.ok(signedUserCert);
            done();
        });
    });

    it('1: should return a doc', function(done) {

        this.timeout(10000);
        assert.ok(rootCert, 'rootCert not returned');
        assert.ok(signedUserCert);
        var log = masterLog.wrap('1');
        var onDone = function(error) {
            if (error) {
                log.error(error);
            }
            done(error);
        };
        var typeSpecs = [{
            type: 'user',
            editors: [],
            contributors: []
        }];
        lib(typeSpecs, log.wrap('genrating design doc'), utils.cb(onDone, function(designDoc) {
            assert.ok(designDoc);
            onDone();
        }));


    });

    it('2: should check for type', function(done) {
        var log = masterLog.wrap('2');


        this.timeout(10000);
        var onDone = function(error) {
            if (error) {
                log.error(error);
            }
            done(error);
        };

        var typeSpecs = [{
            type: 'user',
            editors: ['*'],
            contributors: []
        }];
        lib(typeSpecs, log.wrap('genrating design doc'), utils.cb(onDone, function(designDoc) {
            var testDoc = {
                _id: 'testDoc_1',
                creator: signedUserCert.id
            };
            testDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, userCert, true, log);

            pouch(serverURL + '/test_designdoc_2', utils.cb(onDone, function(db) {
                log('putting design');
                db.put(designDoc, utils.cb(onDone, function() {
                    log('puting doc');

                    db.put(testDoc, utils.safe(onDone, function(error) {
                        assert.ok(error);
                        assert.equal(0, error.message.indexOf('Must have a type'));
                        done();
                    }));
                }));
            }));
        }));
    });


    it('3: should check for signature', function(done) {
        var log = masterLog.wrap('3');

        this.timeout(10000);
        var onDone = function(error) {
            if (error) {
                log.error(error);
            }
            done(error);
        };

        var typeSpecs = [{
            type: 'user',
            editors: ['*'],
            contributors: []
        }];
        lib(typeSpecs, log.wrap('genrating design doc'), utils.cb(onDone, function(designDoc) {
            var testDoc = {
                _id: 'user_3',
                creator: 'user_1'
            };


            pouch(serverURL + 'test_designdoc_3', utils.cb(onDone, function(db) {
                db.put(designDoc, utils.cb(onDone, function() {
                    db.put(testDoc, utils.safe(onDone, function(error) {
                        assert.ok(error);
                        assert.equal(0, error.message.indexOf('Must have a signature'));
                        done();
                    }));
                }));
            }));
        }));
    });

    it('4: should check for valid type', function(done) {
        var log = masterLog.wrap('4');
        this.timeout(10000);

        var onDone = function(error) {
            if (error) {
                log.error(error);
            }
            done(error);
        };

        var typeSpecs = [{
            type: 'user',
            editors: ['*'],
            contributors: []
        }];
        lib(typeSpecs, log.wrap('genrating design doc'), utils.cb(onDone, function(designDoc) {
            var testDoc = {
                _id: 'user_4',
                type: 'notuser',
                creator: signedUserCert.id
            };
            testDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, signedUserCert, true, log);


            pouch(serverURL + 'test_designdoc_4', utils.cb(onDone, function(db) {
                db.put(designDoc, utils.cb(onDone, function() {
                    db.put(testDoc, utils.safe(onDone, function(error) {
                        assert.ok(error);
                        assert.equal(0, error.message.indexOf('type not allowed'));
                        done();
                    }));
                }));
            }));
        }));


    });

    it('5: should deny if user is not in contributors or editors', function(done) {
        var log = masterLog.wrap('5');

        this.timeout(10000);
        var onDone = function(error) {
            if (error) {
                log.error(error);
            }
            done(error);
        };

        var typeSpecs = [{
            type: 'user',
            editors: [],
            contributors: []
        }];

        lib(typeSpecs, log.wrap('genrating design doc'), utils.cb(onDone, function(designDoc) {
            var testDoc = {
                _id: 'user_5',
                type: 'user',
                creator: signedUserCert.id
            };
            testDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, signedUserCert, true, log);


            pouch(serverURL + 'test_designdoc_5', utils.cb(onDone, function(db) {
                db.put(designDoc, utils.cb(onDone, function() {
                    db.put(testDoc, utils.safe(onDone, function(error) {
                        assert.equal('the user ' + signedUserCert.id + ' is not an editor or contributor', error.message);
                        assert.ok(error);
                        done();
                    }));
                }));
            }));
        }));
    });

    it('6: should allow if user is in contributors', function(done) {
        var log = masterLog.wrap('6');

        this.timeout(10000);
        var onDone = function(error) {
            if (error) {
                log.error(error);
            }
            done(error);
        };

        var typeSpecs = [{
            type: 'user',
            editors: [],
            contributors: [signedUserCert.id]
        }];

        lib(typeSpecs, log.wrap('genrating design doc'), utils.cb(onDone, function(designDoc) {
            var testDoc = {
                _id: 'user_6',
                type: 'user',
                creator: signedUserCert.id
            };
            testDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, signedUserCert, true, log);

            log(JSON.stringify(testDoc));
            pouch(serverURL + 'test_designdoc_6', utils.cb(onDone, function(db) {
                db.put(designDoc, utils.cb(onDone, function() {
                    db.put(testDoc, utils.safe(onDone, function(error) {
                        assert.ifError(error);
                        done();
                    }));
                }));
            }));
        }));
    });

    it('7: should allow if user is in editors', function(done) {
        var log = masterLog.wrap('7');

        this.timeout(10000);
        var onDone = function(error) {
            if (error) {
                log.error(error);
            }
            done(error);
        };

        var typeSpecs = [{
            type: 'user',
            editors: [signedUserCert.id],
            contributors: []
        }];

        lib(typeSpecs, log.wrap('genrating design doc'), utils.cb(onDone, function(designDoc) {
            var testDoc = {
                _id: 'user_7',
                type: 'user',
                creator: signedUserCert.id
            };
            testDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, signedUserCert, true, log);



            pouch(serverURL + 'test_designdoc_7', utils.cb(onDone, function(db) {
                db.put(designDoc, utils.cb(onDone, function() {
                    db.put(testDoc, utils.safe(onDone, function(error) {
                        assert.ifError(error);
                        done();
                    }));
                }));
            }));
        }));


    });

    it('8: should only allow updates to the contributor', function(done) {
        var log = masterLog.wrap('8');

        this.timeout(10000);
        var onDone = function(error) {
            if (error) {
                log.error(error);
            }
            done(error);
        };

        var typeSpecs = [{
            type: 'user',
            editors: [],
            contributors: [signedUserCert.id, signedUser2Cert.id]
        }];

        lib(typeSpecs, log.wrap('genrating design doc'), utils.cb(onDone, function(designDoc) {
            var testDoc = {
                _id: 'user_8',
                type: 'user',
                creator: signedUserCert.id
            };
            var newDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, signedUserCert, true, log);
            testDoc.updated = 'updated';
            testDoc.editor = signedUser2Cert.id;
            var updatedDoc = jsonCrypto.signObject(testDoc, user2KeyBufferPair.privatePEM, signedUser2Cert, true, log);

            log.dir(updatedDoc);
            pouch(serverURL + 'test_designdoc_8', utils.cb(onDone, function(db) {
                db.put(designDoc, utils.cb(onDone, function() {
                    log('saved design doc');
                    db.put(newDoc, utils.safe(onDone, function(error, response) {
                        assert.ifError(error, 'error saving initial test doc');
                        log('saved initial test doc');
                        updatedDoc._rev = response.rev;
                        db.put(updatedDoc, utils.safe(onDone, function(error2) {
                            assert.ok(error2, 'should have errored when updating doc');
                            assert.equal('the user ' + signedUser2Cert.id + ' can only update their own records', error2.message);
                            done();
                        }));
                    }));
                }));
            }));
        }));
    });

    it('9: should allow updates to contributors', function(done) {
        var log = masterLog.wrap('9');

        this.timeout(10000);
        var onDone = function(error) {
            if (error) {
                log.error(error);
            }
            done(error);
        };

        var typeSpecs = [{
            type: 'user',
            editors: [],
            contributors: [signedUserCert.id]
        }];
        lib(typeSpecs, log.wrap('genrating design doc'), utils.cb(onDone, function(designDoc) {
            var testDoc = {
                _id: 'user_9',
                type: 'user',
                creator: signedUserCert.id
            };
            var newDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, signedUserCert, true, log);

            testDoc.updated = '2';
            testDoc.editor = signedUserCert.id;

            var updatedDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, signedUserCert, true, log);

            pouch(serverURL + 'test_designdoc_9', utils.cb(onDone, function(db) {
                db.put(designDoc, utils.cb(onDone, function() {
                    db.put(newDoc, utils.safe(onDone, function(error, response) {
                        assert.ifError(error);
                        updatedDoc._rev = response.rev;
                        db.put(updatedDoc, utils.safe(onDone, function(error) {
                            assert.ifError(error);
                            done();
                        }));
                    }));
                }));
            }));
        }));
    });

    it('10: should allow updates to editors', function(done) {
        var log = masterLog.wrap('10');

        this.timeout(10000);
        var onDone = function(error) {
            if (error) {
                log.error(error);
            }
            done(error);
        };

        var typeSpecs = [{
            type: 'user',
            editors: [signedUser2Cert.id],
            contributors: [signedUserCert.id]
        }];
        lib(typeSpecs, log.wrap('genrating design doc'), utils.cb(onDone, function(designDoc) {
            var testDoc = {
                _id: 'user_10',
                type: 'user',
                creator: signedUserCert.id
            };
            var newDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, signedUserCert, true, log);
            testDoc.editor = signedUser2Cert.id;
            var updatedDoc = jsonCrypto.signObject(testDoc, user2KeyBufferPair.privatePEM, signedUser2Cert, true, log);

            pouch(serverURL + 'test_designdoc_10', utils.cb(onDone, function(db) {
                db.put(designDoc, utils.cb(onDone, function() {
                    db.put(newDoc, utils.safe(onDone, function(error, response) {
                        assert.ifError(error);
                        updatedDoc._rev = response.rev;
                        db.put(updatedDoc, utils.safe(onDone, function(error) {
                            assert.ifError(error);
                            done();
                        }));
                    }));
                }));
            }));
        }));


    });

    it('11: should allow user certificates', function(done) {
        var log = masterLog.wrap('11');

        this.timeout(10000);
        var onDone = function(error) {
            if (error) {
                log.error(error);
            }
            done(error);
        };

        var typeSpecs = [{
            type: 'user',
            editors: [signedUserCert.id],
            contributors: []
        }];

        lib(typeSpecs, log.wrap('genrating design doc'), utils.cb(onDone, function(designDoc) {
            var testDoc = {
                _id: 'user_11',
                type: 'user',
                creator: signedUserCert.id
            };
            testDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, signedUserCert, true, log);


            log.dir(testDoc);
            pouch(serverURL + 'test_designdoc_11', utils.cb(onDone, function(db) {
                db.put(designDoc, utils.cb(onDone, function() {
                    db.put(testDoc, utils.safe(onDone, function(error) {
                        assert.ifError(error);
                        done();
                    }));
                }));
            }));
        }));
    });

    it('12: should check the doc size', function(done) {
        var log = masterLog.wrap('12');

        this.timeout(10000);
        var onDone = function(error) {
            if (error) {
                log.error(error);
            }
            done(error);
        };

        var testDoc = {
            _id: 'user_12',
            type: 'user',
            creator: signedUserCert.id
        };


        var typeSpecs = [{
            type: 'user',
            editors: [],
            contributors: [signedUserCert.id],
            maximumSize: JSON.stringify(testDoc).length - 1
        }];

        lib(typeSpecs, log.wrap('generating design doc'), utils.cb(onDone, function(designDoc) {
            testDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, signedUserCert, true, log);
            pouch(serverURL + 'test_designdoc_12', utils.cb(onDone, function(db) {
                db.put(designDoc, utils.cb(onDone, function() {
                    db.put(testDoc, utils.safe(onDone, function(error) {
                        assert.ok(error);
                        done();
                    }));
                }));
            }));
        }));
    });
    /*
	it('12: should run custom check', function (done) {
		var log = masterLog.wrap('12');

		var onDone = function(error){
			if(error)
			{
				log.error(error);
			}
			done(error);
		};

		var typeSpecs = [
		{
			type: 'user',
			editors: ['user_1'],
			contributors: []
		}
		];

		var designDoc = lib(typeSpecs, [signedUserCert], function(){
			throw({forbidden: 'test'});
		});

		var testDoc = {
			_id: 'user_12',
			type: 'user',
			creator: 'user_1'
		};

		testDoc = jsonCrypto.signObject(testDoc, userKeyBufferPair.privatePEM, signedUserCert, true, log);

		pouch(serverURL + 'test_designdoc_12', utils.cb(onDone, function(db){
			db.put(designDoc, utils.cb(onDone, function(){
				db.put(testDoc, utils.safe(onDone, function(error){
					assert.ok(error,'should error from customCheck');
					assert.equal(error.reason, 'test');

					done();
				}));
			}));
		}));
	});
*/
});
