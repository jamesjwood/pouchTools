

var utils = require('utils');


module.exports = function(grunt) {
  "use strict";
  // Project configuration.
  grunt.initConfig({
    watch: {
      options: {
        interrupt: true,
      files: ['index.js', 'test.js', 'src/*.js', 'test/*.js'],
      tasks: ['test']
      }
    },
    jshint: {
      options: {
        browser: true,
        node: true
      },
      all: ['index.js', 'test.js', 'src/*.js', 'test/*.js']
    },
    simplemocha: {
      options: {
        ui: 'bdd',
        reporter: 'tap'
      },
      all: { src: ['test.js'] }
    },
    shell: {
      makeStage: {
        command: 'rm -rf stage; mkdir stage',
        stdout: true,
        stderr: true,
        failOnError: true
      }
      ,
      makeLib: {
        command: 'rm -rf lib; mkdir lib',
        stdout: true,
        stderr: true,
        failOnError: true
      }
      ,
      browserify:{
        command: 'node ./node_modules/browserify/bin/cmd.js  --debug -o ./stage/test.js -i domain -i loggly -i ga -i pouchdb -e ./test.js;',
        stdout: true,
        stderr: true,
        failOnError: true
      }
       ,
      browserifyValidator:{
        command: 'node ./node_modules/browserify/bin/cmd.js  -o ./lib/validator.js -i domain -r ./src/validateDoc.js;',
        stdout: true,
        stderr: true,
        failOnError: true
      },
      buildPouchDBClient:{
        command: 'cd node_modules/pouchdb; npm install; grunt;',
        stdout: true,
        stderr: true,
        failOnError: true
      },
      copyPouch:{
        command: 'cp -av node_modules/pouchdb/dist/pouchdb-nightly.min.js lib/pouch.min.js; cp -av node_modules/pouchdb/dist/pouchdb-nightly.js lib/pouch.js;',
        stdout: true,
        stderr: true,
        failOnError: true
      },
      copyMocha:{
        command: 'cp -av node_modules/grunt-simple-mocha/node_modules/mocha/mocha.js lib/mocha.js; cp -av node_modules/grunt-simple-mocha/node_modules/mocha/mocha.css lib/mocha.css',
        stdout: true,
        stderr: true,
        failOnError: true
      }

    },
    karma: {
      local: {
        configFile: 'karma.conf.js',
        singleRun: true,
        browsers: ['Safari'] //, 'Firefox', 'Safari', 'Opera'
      },
      jenkins:
      {
        configFile: 'karma.conf.js',
        singleRun: true,
        browsers: ['Firefox']
      }
    },
  });


grunt.registerTask('bundleForge', function(){
  /* Bundle and minify Forge RSA and dependencies. */
  var fs = require('fs');
  var path = require('path');
  //var UglifyJS = require('uglify-js');

  // list dependencies in order
  var files = [
    'util.js',
    'md5.js',
    'sha1.js',
    'sha256.js',
    'aes.js',
    'prng.js',
    'random.js',
    'hmac.js',
    'jsbn.js',
    'oids.js',
    'asn1.js',
    'rsa.js',
    'pki.js'
  ];

  files = files.map(function(file) {
    return path.join(__dirname, 'node_modules/node-forge/js', file);
  });

  // bundle and minify JS
  console.log('Creating RSA bundle...');

  var bundle = path.join(__dirname, 'stage', 'forge.js');

  // FIXME: minification is turned off at the moment because it seems to have
  // negatively affected performance
  //fs.writeFileSync(bundle, UglifyJS.minify(files).code);
  var concat = '';
  files.forEach(function(file) {
    concat += fs.readFileSync(file);
  });
  fs.writeFileSync(bundle, concat);

  console.log('RSA bundle written to: ' + bundle);
});
grunt.loadNpmTasks('grunt-contrib');
grunt.loadNpmTasks('grunt-shell');
grunt.loadNpmTasks('grunt-simple-mocha');
grunt.loadNpmTasks('grunt-karma');

grunt.registerTask('install', ['shell:makeLib', 'shell:browserifyValidator', 'shell:buildPouchDBClient', 'shell:copyPouch']);
grunt.registerTask('default', ['install', 'jshint', 'shell:makeStage', 'simplemocha']);
grunt.registerTask('test', ['shell:browserify', 'karma:local']);

};