

var utils = require('utils');


module.exports = function(grunt) {
  "use strict";
  // Project configuration.
  grunt.initConfig({
    watch: {
      options: {
        interrupt: true,
      files: ['src/*.js', 'test/*.js'],
      tasks: ['test']
      }
    },
    jshint: {
      options: {
        browser: true,
        node: true
      },
      all: ['src/*.js', 'test/*.js']
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
      browserify:{
        command: 'browserify  -o ./stage/crypto.js -i domain -i loggly -i ga -i pouchdb -e ./test/crypto.js;',
        stdout: true,
        stderr: true,
        failOnError: true
      }
    }
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

grunt.registerTask('test', ['jshint', 'shell:makeStage', 'simplemocha']);
grunt.registerTask('default', ['test']);

};