var should = require('should');
var tracrUtils = require('../utils');
var fs = require('fs');
var jsCode = fs.readFileSync(__dirname + '/mocks/todomvc.jquery.app.js').toString();
var sampleEvalStatements = fs.readFileSync(__dirname + '/mocks/sampleEvalStatements.txt').toString().trim();
var escodegen = require('escodegen');

describe('utils', function () {

    describe('isBlacklisted', function() {
        it('should blacklist by string', function () {
            tracrUtils.isBlacklisted('http://domain/tracrClientLib/lorem').should.equal(true);
        });
        it('should blacklist by regex', function () {
            tracrUtils.isBlacklisted('http://domain/node_modules/lorem').should.equal(true);
        });
        it('should not blacklist', function () {
            tracrUtils.isBlacklisted('http://domain/scripts/lorem').should.equal(false);
        });
    });

    describe('findFn', function() {
        it('should find function on specified line', function() {
            var fn = tracrUtils.findFn(jsCode, 111);
            fn.params[0].name.should.equal('getActivetODOS');
        });
    });

    describe('getEvalStatements', function() {
        it('should find eval statements', function() {
            var fn = tracrUtils.findFn(jsCode, 111);
            var statements = tracrUtils.getEvalStatements(fn);

            var asJs = '';

            statements.forEach(function(statement) {
                asJs += escodegen.generate(statement) + '\n';
            });

            asJs.trim().should.equal(sampleEvalStatements);
        });
    });

});
