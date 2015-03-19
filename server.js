var tracrUtils = require('./utils');
var _ = require('lodash');
var BracketsClient = require('./clients/brackets');
var ChromeUtils = require('./chromeUtils');
var mysql = require('mysql');

var bracketsClient = new BracketsClient();
var chromeUtils = new ChromeUtils();
chromeUtils.on('evalResult', function(data) {
    console.log('sent eval results to client');
    bracketsClient.send({
        action: 'evalResult',
        result: data.result,
        ast: data.ast
    });
});
chromeUtils.on('liveEditReady', function(response) {
    bracketsClient.send(response);
});

var stateData = {};
var connection = mysql.createConnection({
    host     : 'localhost',
    user     : 'root',
    password : 'root',
    database: 'tracr'
});
connection.connect();

bracketsClient.on('messageReceived', function(message) {
    var actions = {
        getTraces: function() {
            var fnName = '%' + message.fnName;
            var path = '%' + message.path + '%';
            var lineNumber = parseInt(message.lineNumber);
            var q = 'SELECT *, ABS(line - \'' + lineNumber + '\') as distance FROM traces' +
            ' WHERE functionName LIKE ' + connection.escape(fnName) +
            ' AND filepath LIKE ' + connection.escape(path) +
            ' AND ABS(line - \'' + lineNumber + '\') < 1' +
            ' ORDER BY distance ASC, id DESC LIMIT 10';
            tracrUtils.getRows(connection, q, {reverseEvents: true}).then(function(rows) {
                bracketsClient.send(rows);
            });
        },
        evaluate: function() {
            var fn = tracrUtils.findFn(message.code, message.lineNumber);

            if (!fn) {
                return;
            }

            // TODO: don't execute identical code..
            if (false && JSON.stringify(stateData.prevBlock) === JSON.stringify(fn)) {
                console.log('contents identical to prev evaluation, skip evaluation');
                return;
            }
            stateData.prevBlock = fn;

            _.each(tracrUtils.getEvalStatements(fn), function(statement) {
                chromeUtils.addToFrameEvalQueue(statement);
            });
            chromeUtils.evalAllFrames();
        },
        initLiveEdit: function() {
            tracrUtils.getRows(connection, 'SELECT * FROM traces WHERE id = ' + connection.escape(message.id))
            .then(function(rows) {
                chromeUtils.initLiveEdit(rows[0], message.lineNumber);
            });
        }
    };

    var fn = actions[message.action] || function() {console.error('Unrecognized msg', message);};
    fn();
});
