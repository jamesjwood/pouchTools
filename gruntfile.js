

var utils = require('tsuju-utils');
var pkg = require('./package.json');

module.exports = function(grunt) {
  "use strict";
  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    bumpup: {
      options: {
        updateProps: {
          pkg: 'package.json'
        }
      },
      file: 'package.json'
    },
    jsbeautifier : {
      run: {
          src : ["src/**/*.js", "test/**/*.js"]
      },
      test: {
          src : ["src/**/*.js", "test/**/*.js"],
          options : {
              mode:"VERIFY_ONLY"
          }
      }
    },
   watch: { 
      local: {
        options: {
          debounceDelay: 5000,
          interrupt: true
        },
        files: ['*.js','src/**/*.js', 'test/**/*.js'],
        tasks: ['default']
      }
    },
    jshint: {
      options: {
        browser: true,
        node: true
      },
      all: ['package.json' ,'index.js', 'test.js', 'src/*.js', 'test/*.js']
    },
    simplemocha: {
      options: {
        ui: 'bdd',
        reporter: 'min'
      },
      all: { src: ['test.js'] }
    },
    browserify: {
      test: {
        files: {
          './stage/test.js': ['./test.js'],
        },
        options: {
          debug: true,
          ignore: ['domain', 'loggly', 'ga', 'universal-analytics']
        },
      }
    },
    shell: {
      makeStage: {
        command: 'rm -rf stage; mkdir stage',
        options:{
          stdout: true,
          stderr: true,
          failOnError: true
        }
      },
      makeBin: {
        command: 'rm -rf bin; mkdir bin',
        options:{
          stdout: true,
          stderr: true,
          failOnError: true
        }
      },
      browserify:{
        command: 'node ./node_modules/browserify/bin/cmd.js  --debug -o ./stage/test.js -i domain -i loggly -i ga -e ./test.js;',
        options:{
          stdout: true,
          stderr: true,
          failOnError: true
        }
      },
      browserifyValidator:{
        command: 'node ./node_modules/browserify/bin/cmd.js --debug -o ./bin/validator.js -i domain -r ./src/validateDoc.js;',
        options:{
          stdout: true,
          stderr: true,
          failOnError: true
        }
      },
      buildPouchDBClient:{
        command: 'cd node_modules/pouchdb; npm install; grunt;',
        options:{
          failOnError: true
        }
      },
      copyPouch:{
        command: 'cp -av node_modules/pouchdb/dist/pouchdb-nightly.min.js lib/pouch.min.js; cp -av node_modules/pouchdb/dist/pouchdb-nightly.js lib/pouch.js;',
        options:{
          failOnError: true
        }
      },
      copyMocha:{
        command: 'cp -av node_modules/grunt-simple-mocha/node_modules/mocha/mocha.js lib/mocha.js; cp -av node_modules/grunt-simple-mocha/node_modules/mocha/mocha.css lib/mocha.css',
        options:{
          failOnError: true
        }
      },
      publish:{
        command: 'npm publish;',
        stdout: true,
        stderr: true,
        failOnError: true
      }

    },
    karma: {
      local: {
        configFile: 'karma.conf.js',
        singleRun: true,
        browsers: ['Safari']
      },
      jenkins:
      {
        configFile: 'karma.conf.js',
        singleRun: true,
        browsers: ['Safari']
      }
    }
  });


require('matchdep').filterDev('grunt-*').forEach(grunt.loadNpmTasks);

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

grunt.registerTask('install', []);
grunt.registerTask('build', ['shell:makeBin', 'shell:browserifyValidator', 'shell:makeStage']);
grunt.registerTask('test', ['build', 'jshint', 'jsbeautifier:test','simplemocha', 'browserify:test', 'karma:local']);
grunt.registerTask('development', ['build']);
grunt.registerTask('production', ['build']);
  grunt.registerTask('publish', ['bumpup:patch', 'shell:publish']);

};