
/*global exports */
/*global module */
/*global EDITORS_ARRAY */
/*global CONTRIBUTORS_ARRAY */
/*global REQUIRED_FIELDS */
/*global ALLOWED_TYPES */
var utils = require('utils');
var async = require('async');
var events = require('events');
var assert = require('assert');
var browserify = require('browserify');
var fs = require('fs');
var path = require('path');



module.exports = function(fqPathToValidationModule, realtivePath, typeSpecs, trustedCerts, log, callback){
	assert.ok(typeSpecs);
	assert.ok(trustedCerts);

	var b = browserify();
	b.ignore('domain');
	b.require(fqPathToValidationModule);

	var validateDocBuff = b.bundle({});
	assert.ok(validateDocBuff);

		var wrapperF = function(newDoc, oldDoc, userCtx){
			try
			{
				DOC_CODE
				var typeSpecs=TYPE_SPECS;
				var trustedCerts=TRUSTED_CERTS;
				var validator = require('REQUIRE_PATH');
				return validator(newDoc, oldDoc, userCtx, typeSpecs, trustedCerts);
			}
			catch(error)
			{
				if(typeof error.forbidden === 'undefined' && typeof error.unauthorized === 'undefined')
				{
					var e = {forbidden: 'Unhandled error: ' + JSON.stringify(error)};
					throw e;
				}
				else{
					throw error;
				}
			}
		};;
		var wrapper = wrapperF.toString();
		var validateDoc = wrapper.replace('DOC_CODE', validateDocBuff.toString('utf8'));
		validateDoc = validateDoc.replace('REQUIRE_PATH', realtivePath);
		validateDoc = validateDoc.replace('TYPE_SPECS', JSON.stringify(typeSpecs));
		validateDoc = validateDoc.replace('TRUSTED_CERTS', JSON.stringify(trustedCerts));

		var designDoc = {
			_id: "_design/master",
			validate_doc_update: validateDoc,
			trustedCerts:trustedCerts,
			typeSpecs:typeSpecs
		};

		callback(null, designDoc);
};
