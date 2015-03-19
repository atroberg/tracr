var _ = require('lodash');
var astUtils = require('esprima-ast-utils');
var Q = require('q');
var $ = require('cheerio');
var esprima = require('esprima');
var escodegen = require('escodegen');

var utils = {
    // TODO: create separate config file
    settings: {
        port: 9224
    },

    isBlacklisted: function(url) {
        var blacklist = ['/tracrClientLib/', 'jquery.js', 'jquery.min.js', /\/bower_components\//, /\/node_modules\//,
            'underscore.js', 'backbone.js', 'backbone.localStorage.js', '/ga.js', /\/lib\//];

        return _.find(blacklist, function(item) {
            if (typeof item === 'string') {
                return url.indexOf(item) !== -1;
            }
            else {
                return item.test(url);
            }
        }) !== undefined;
    },

    findFn: function(code, lineNumber, functionName) {
        var ast;
        try {
            ast = esprima.parse(code, {loc: true});
        }
        catch (e) {
            console.error('Failed parsing code', e);
            return;
        }
        // TODO: more advanced search logic, so that line number doesn't
        // have to be exact
        var matches = astUtils.filter(ast, function(node) {
            return node.loc.start.line === lineNumber
                && _.contains(['FunctionExpression', 'FunctionDeclaration'], node.type);
        });
        return matches[0];
    },

    getEvalStatements: function(ast) {
        var statements = [];
        function add(ast) {
            statements.push(ast);
        }
        var handlers = {
            VariableDeclaration: add,
            FunctionDeclaration: add,
            ExpressionStatement: add,
            ForStatement: add,
            WhileStatement: add,
            ForInStatement: add,
            DoWhileStatement: add,
            BlockStatement: function(ast) {
                ast.body.forEach(function(b) {
                    handleItem(b);
                });
            },
            IfStatement: function(ast) {
                if (ast.test) {
                    statements.push(ast.test);
                }

                ast.consequent.body.forEach(function(b) {
                    handleItem(b);
                });

                // Recursively add all else if / else
                if (ast.alternate) {
                    handleItem(ast.alternate);
                }
            },
            ReturnStatement: function(ast) {
                if (ast.argument) {
                    statements.push(ast.argument);
                }
            },
            SwitchStatement: function(ast) {
                statements.push(ast.discriminant);
                ast.cases.forEach(function(c) {
                    c.consequent.forEach(function(b) {
                        handleItem(b);
                    });
                });
            }
        };

        function handleItem(item) {
            var handler = handlers[item.type] || _.noop;
            try {
                handler(item);
            }
            catch (e) {
                console.error('Exception getting statements', e);
            }
        }

        ast.body.body.forEach(handleItem);

        return statements;
    },

    getRows: function(connection, query, opts) {
        opts = opts || {};
        var jsonCols = [
            'arguments',
            'thisVar',
            'events',
            'stackTrace',
            'asyncStackTrace'
        ];
        var deferred = Q.defer();
        connection.query(query, function(err, rows) {
            _.each(rows, function(row, i) {
                _.each(row, function(val, key) {
                    if (_.contains(jsonCols, key)) {
                        val = JSON.parse(val);
                    }
                    row[key] = val;
                });
                row.events = utils.getEventListForUi(row.events, opts.reverseEvents);
            });
            deferred.resolve(rows);
        });
        return deferred.promise;
    },

    /**
     * Return the visible event list that is displayed in the IDE
     */
    getEventListForUi: function(rawEvents, reverse) {
        var events = [];
        var prevEvent = {};
        var handlers = {
            MouseEvent: function(e) {
                return _.assign({}, e, {
                    description: e.type + ' <span>' + e.target.selector + '</span> ' +
                                    '<span class="text">' + e.text + '</span>'
                });
            },
            KeyboardEvent: function(e, nextEvent) {
                if (e.keyCode === 13) {
                    var thisEvent = _.assign({}, e, {
                        description: 'input <span>' + e.target.selector + '</span> ' +
                                        '<span>{enter}</span>'
                    });
                    if (prevEvent.handler === 'KeyboardEvent') {
                        return [prevEvent, thisEvent];
                    }
                    return thisEvent;
                }
                var char = String.fromCharCode(e.keyCode).toLowerCase();
                if (char && !e.charAppended) {
                    e.target.value += char;
                    e.charAppended = true;
                }
                _.assign(e, {
                    description: 'input <span>' + e.target.selector + '</span> ' +
                                    '<span>' + e.target.value + '</span>'
                });
                if (!nextEvent || nextEvent.handler !== 'KeyboardEvent') {
                    return e;
                }
            }
        };
        rawEvents.forEach(function(e, index) {
            e.text = $(e.target.outerHtml).text().trim().substring(0, 70);
            var fn = handlers[e.handler] || _.noop;
            var res = fn(e, rawEvents[index + 1]);
            if (res) {
                if (Array.isArray(res)) {
                    events.push.apply(events, res);
                }
                else {
                    events.push(res);
                }
            }
            prevEvent = e;
        });
        if (reverse) {
            events.reverse();
        }
        return events;
    }
};

module.exports = utils;
