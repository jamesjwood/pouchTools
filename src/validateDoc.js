var utils = require('./simple.js');

module.exports = function(newDoc, oldDoc, userCtx, typeSpecs){
	
	function requireOn(object, field, message) {
		message = message || "Must have a " + field;
		if (!object[field]) throw({forbidden : message});
	};

	var validateSignature = function(){
		requireOn(newDoc, 'signature');
	};
	validateSignature();


	//check the type is allowed
	requireOn(newDoc, 'type');
	var specs = [];

	typeSpecs.map(function(spec){
		if (spec.type === newDoc.type || spec.type === '*')
		{
			specs.push(spec);
		}
	});
	if(specs.length === 0)
	{
		throw({forbidden: 'type not allowed'})
	}
	specs.map(function(spec){
		requireOn(spec, 'editors');
		requireOn(spec, 'contributors');

		var checkRoles = function(name, list){
			var inRole = false;
			list.map(function(allowed){
				if(allowed === '*' || allowed === name)
				{
					inRole = true;
				}
			});
			return inRole;
		};
		var isEditor = checkRoles(newDoc.signature.id, spec.editors);
		var isContributor = checkRoles(newDoc.signature.id, spec.contributors);
		if(!oldDoc)
		{
			//insert
			if(!isEditor && !isContributor)
			{
				throw {forbidden: 'you must be an editor or contributor to create new record'};
			}
		}
		else
		{
			//update
			if(!isEditor)
			{
				if(isContributor)
				{
					if(newDoc.signature.id !== oldDoc.signature.id)
					{
						throw {forbidden: 'contributors can only update their own records'};
					}
				}
				else
				{
					throw {forbidden: 'you must be an editor or contributor to update records'};
				}
			}
		}
	});
};
