var falafel = require('falafel');

var scopeTypes = ['FunctionDeclaration', 'FunctionExpression'];

module.exports = function(code) {
    var idCount = 0;

    try {
        return falafel(code, {loc:true}, function(node) {
            if (scopeTypes.indexOf(node.type) !== -1) {
                var body = node.body.body[0];
                if (body) {
                    var fnName = node.id && node.id.name;
                    var pKey = node.parent && node.parent.key || {};

                    // If anonymous and defined as object property "myFn: function()..."
                    if (!fnName && pKey.type === 'Identifier' && pKey.name) {
                        fnName = pKey.name;
                    }

                    var id = idCount + '_' + (fnName || '');

                    idCount++;
                    body.update('eval();window.tracr.traceCall("' + id +
                                '", arguments, this, ' + node.loc.start.line + ');' + body.source());
                }
            }
        }).toString();
    }
    catch (e) {
        console.error('Error instrumenting', e);
        return code;
    }
};

//console.log( module.exports(require('fs').readFileSync('todomvc.jquery.app.js').toString()) );
