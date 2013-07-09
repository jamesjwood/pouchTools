var jsonCrypto = require('jsonCrypto');
var utils = require('utils');

module.exports = function(newDoc, oldDoc, userCtx, typeSpecs, trustedCerts){
	var log = utils.log();
	if(!typeSpecs)
	{
		throw({forbidden: 'no typeSpecs supplied'});
	}
	if(!trustedCerts)
	{
		throw({forbidden: 'no trustedCerts supplied'});
	}





	var validateSignature = function(doc){
		module.exports.requireOn(newDoc, 'signature');
		if (jsonCrypto.verifyObject(doc, trustedCerts, log) !== 1)
		{
			throw ({forbidden: 'the signature is not valid'});
		}
	};
	validateSignature(newDoc);

	var newSigner = jsonCrypto.getTrustedCert(newDoc.signature.signer,trustedCerts) || newDoc.signature.signer;

		//check the type is allowed
		module.exports.requireOn(newDoc, 'type');
		var specs = [];

		typeSpecs.map(function(spec){
			if (spec.type === newDoc.type || spec.type === '*')
			{
				specs.push(spec);
			}
		});
		if(specs.length === 0)
		{
			throw({forbidden: 'type not allowed'});
		}

		specs.map(function(spec){
			module.exports.requireOn(spec, 'editors');
			module.exports.requireOn(spec, 'contributors');

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
			var isEditor = checkRoles(newSigner.name, spec.editors);
			var isContributor = checkRoles(newSigner.name, spec.contributors);
			if(!oldDoc)
			{
				//insert
				module.exports.requireOn(newDoc, 'creator');
				if(newDoc.creator !== newSigner.name)
				{
					throw({forbidden: 'the creator must be equal to the certificate name'});
				}
				if(!isEditor && !isContributor)
				{
					throw({forbidden: 'the user ' + newSigner.name + ' is not an editor or contributor'});
				}
			}
			else
			{
				//update
				module.exports.requireOn(newDoc, 'editor');
				if(newDoc.editor !== newSigner.name)
				{
					throw({forbidden: 'the editor must be equal to the certificate name'});
				}

				var oldSigner = jsonCrypto.getTrustedCert(oldDoc.signature.signer,trustedCerts) || oldDoc.signature.signer;

				module.exports.unchanged(newDoc, oldDoc, 'creator');

				if(!isEditor)
				{
					if(isContributor)
					{
						if(newDoc.editor !== oldDoc.creator)
						{
							throw({forbidden: 'the user ' + newSigner.name + ' can only update their own records'});
						}
					}
					else
					{
						throw({forbidden: 'the user ' + newSigner.name + ' is not an editor or contributor'});
					}
				}
			}
		});
};

module.exports.requireOn = function (object, field, message) {
	message = message || "Must have a " + field + ': ' + JSON.stringify(object);
	if(typeof object[field] === 'undefined')
	{
		throw({forbidden : message});
	}
	else
	{
		if (!object[field]) throw({forbidden : message});
	}
};
module.exports.unchanged = function (newDoc, oldDox, field) {
	if (oldDoc && toJSON(oldDoc[field]) !== toJSON(newDoc[field]))
		throw({forbidden : "Field can't be changed: " + field});
};
