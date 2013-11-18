
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



module.exports = utils.f(function(typeSpecs, log, callback){
	utils.is.object(typeSpecs);
	utils.is.function(log);

	var realtivePath =  './src/validateDoc.js';

	var validateDocBuff = fs.readFileSync(__dirname + '/../bin/validator.js');
	var forgeBuff = fs.readFileSync(__dirname + '/../lib/forge.min.js');

	assert.ok(validateDocBuff);	
	assert.ok(forgeBuff);	
		var wrapperF = function(newDoc, oldDoc, userCtx){
			try
			{
				var DOC_CODE;
				var FORGE_CODE;
				var typeSpecs= TYPE_SPECS;
				var validator = require('REQUIRE_PATH');
				return validator(newDoc, oldDoc, userCtx, typeSpecs);
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
		};
		var wrapper = wrapperF.toString();
		var validateDoc = wrapper.replace('var DOC_CODE;', validateDocBuff.toString());
		validateDoc = validateDoc.replace('var FORGE_CODE;', forgeBuff.toString());
		validateDoc = validateDoc.replace('REQUIRE_PATH', realtivePath);
		validateDoc = validateDoc.replace('TYPE_SPECS', JSON.stringify(typeSpecs));

		var designDoc = {
			_id: "_design/master",
			validate_doc_update: validateDoc,
			typeSpecs:typeSpecs
		};

		callback(null, designDoc);
});
