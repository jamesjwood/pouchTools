
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


var validateDocBuff = fs.readFileSync('./stage/validator.js');


module.exports = function(typeSpecs){
	assert.ok(typeSpecs);
	var designDoc = {
		_id: "_design/master",
		validate_doc_update: createDesignDocString(typeSpecs)
	};
	return designDoc;
};


var createDesignDocString = function(typeSpecs){
	var wrapper = "function(newDoc, oldDoc, userCtx){DOC_CODE var typeSpecs=TYPE_SPECS; var validator = require('/validateDoc.js'); return validator(newDoc, oldDoc, userCtx, typeSpecs);};";
	var validateDoc = wrapper.replace('DOC_CODE', validateDocBuff.toString('utf8'));
	validateDoc = validateDoc.replace('TYPE_SPECS', JSON.stringify(typeSpecs));
	return validateDoc
};
