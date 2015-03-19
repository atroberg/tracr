var _ = require('lodash');
var Chrome = require('chrome-remote-interface');
var mysql = require('mysql');
var tracrUtils = require('./utils');
var exec = require('child_process').exec;

var events = [];
var connection = mysql.createConnection({
    host     : 'localhost',
    user     : 'root',
    password : 'root',
    database: 'tracr'
});
connection.connect();

function filterStackTraces(traces) {
    return _.filter(traces, function(trace) {
        return !tracrUtils.isBlacklisted(trace.url);
    });
}

function saveTrace(trace, events) {
    var tracrData = JSON.parse(trace.text);
    var currentFn = trace.stackTrace[1];
    if (!currentFn) {
        return;
    }

    if (trace.stackTrace) {
        trace.stackTrace.shift();
        trace.stackTrace = filterStackTraces(trace.stackTrace);
    }

    if (trace.asyncStackTrace) {
        trace.asyncStackTrace.callFrames = filterStackTraces(trace.asyncStackTrace.callFrames);
    }

    var data = {
        windowLocation: tracrData.windowLocation,
        filepath: currentFn.url,
        functionName: currentFn.functionName,
        line: tracrData.lineNumber,
        column: currentFn.columnNumber,
        arguments: JSON.stringify(tracrData.arguments),
        thisVar: JSON.stringify(tracrData.thisVar),
        events: JSON.stringify(events),
        stackTrace: JSON.stringify(trace.stackTrace),
        asyncStackTrace: JSON.stringify(trace.asyncStackTrace),
        timestamp: tracrData.timestamp
    };
    var keys = _.keys(data).join('`,`');
    var values = _.map(data, function(val) {
        return connection.escape(val);
    }).join(',');
    var sql = 'INSERT INTO traces (`' + keys + '`) VALUES (' + values + ')';
    connection.query(sql);
}

exec('google-chrome --user-data-dir="/tmp/lorem2" --incognito --remote-debugging-port=9225');

setTimeout(function() {
    Chrome({port: 9225}, function (chrome) {
        console.log('Connected to chrome');
        chrome.Console.enable();
        chrome.Debugger.enable();
        chrome.Debugger.setAsyncCallStackDepth({
            maxDepth: 4
        });
        chrome.on('Console.messageAdded', function (response) {
            var msg = response.message;
            if (msg.type === 'trace') {
                saveTrace(msg, events);
            }
            else if (msg.type === 'log' && msg.url.indexOf('/tracrCapture.js') !== -1) {
                try {
                    var event = JSON.parse(msg.text);
                    events.push(event);
                }
                catch (e) {
                    console.log('Received nonJSON data from Tracr', msg.text);
                }
            }
        });
    });
}, 1000);
