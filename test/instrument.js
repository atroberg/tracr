var should = require('should');
var instrument = require('../instrument');
var fs = require('fs');
var jsCode = fs.readFileSync(__dirname + '/mocks/todomvc.jquery.app.js').toString();

describe('instrument', function () {

    it('should instrument JS', function() {
        var newCode = instrument(jsCode);
        newCode.split('\n')[3].indexOf(
            'eval();window.tracr.traceCall("30_", arguments, this, 3);'
        ).should.not.equal(-1);
    });

});
