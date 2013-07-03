
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


var validateDocBuff = fs.readFileSync('./lib/validator.js');

module.exports = function(typeSpecs, trustedCerts, customCheck){
	assert.ok(typeSpecs);
	assert.ok(trustedCerts);

	var wrapper = "function(newDoc, oldDoc, userCtx){DOC_CODE var customCheck=CUSTOM_CHECK; var typeSpecs=TYPE_SPECS; var trustedCerts=TRUSTED_CERTS; var validator = require('/src/validateDoc.js'); return validator(newDoc, oldDoc, userCtx, typeSpecs, trustedCerts, customCheck);};";
	var validateDoc = wrapper.replace('DOC_CODE', validateDocBuff.toString('utf8'));
	validateDoc = validateDoc.replace('TYPE_SPECS', JSON.stringify(typeSpecs));
	validateDoc = validateDoc.replace('TRUSTED_CERTS', JSON.stringify(trustedCerts));
	validateDoc = validateDoc.replace('CUSTOM_CHECK', customCheck.toString());

	console.log(validateDoc);
	var designDoc = {
		_id: "_design/master",
		validate_doc_update: validateDoc
	};

	return designDoc;
};
