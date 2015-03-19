define(function(require, exports, module) {
    var self = {
        evalEl: $('<span />'),

        initSocket: function initSocket() {
            self.ws = new WebSocket('ws://localhost:10001');
            self.ws.onclose = function(error) {
                // Retry every 0,5s
                setTimeout(function() {
                    self.initSocket();
                }, 500);
            };
            self.ws.onmessage = self.onMessage;
            console.log('Tracr: init socket');
        },

        onMessage: function onMessage(e) {
            var msg = JSON.parse(e.data);

            console.log('Received', msg);

            if (msg.action === 'evalResult') {
                self.evalEl.trigger('evalResult', msg);
                return;
            }

            var promise = self.lastSent;

            if (!promise) {
                throw Error('Tracr: WS message received, but no handler found!');
            }

            promise.resolve(msg);
        },

        send: function send(msg) {
            var deferred = new jQuery.Deferred();
            if (self.ws.readyState !== self.ws.OPEN) {
                deferred.reject();
                return deferred.promise();
            }
            self.ws.send(JSON.stringify(msg));
            console.log('Tracr send', msg);
            if (msg.action !== 'evaluate') {
                self.lastSent = deferred;
                return deferred.promise();
            }
        },

        getTraces: function getTraces(fnName, path, lineNumber, argString) {
            var deferred = new jQuery.Deferred();
            var editorArgs = [];

            if (argString) {
                editorArgs = argString.replace(/\s*/g, '').split(',');
            }

            self.send({
                action: 'getTraces',
                path: path,
                fnName: fnName,
                lineNumber: lineNumber
            }).then(function(traces) {
                console.log('Tracr: received traces from server', traces);
                deferred.resolve(
                    $.map(traces, function(trace) {
                        return self.handleTrace(trace, editorArgs);
                    })
                );
            }).fail(deferred.reject);

            return deferred.promise();
        },

        handleTrace: function handleTrace(trace, editorArgs) {
            var args = {};
            _.each(trace.arguments, function(val, index) {
                var argName = editorArgs[index] || '_' + index;
                args[argName] = val;
            });
            // If fn has more args specified than it actually received => fill with undefined
            for (var i = _.keys(args).length; i < editorArgs.length; i ++) {
                args[editorArgs[i]] = '{undefined}';
            }
            args.this = trace.thisVar;
            trace.arguments = args;

            trace.asyncStackTrace = trace.asyncStackTrace || {};

            _.chain(trace.stackTrace)
            .union(trace.asyncStackTrace.callFrames)
            .each(function(frame) {
                frame.filename = frame.url.substring(frame.url.lastIndexOf('/') + 1);
            });

            if (trace.events && Array.isArray(trace.events) && trace.events.length) {
                var origoTimestamp = _.first(trace.events).timestamp;
                _.each(trace.events, function(event) {
                    event.timeInSeconds = self.getSeconds(event.timestamp, origoTimestamp);
                });
            }
            return trace;
        },

        initLiveEdit: function initLiveEdit(id, lineNumber) {
            var deferred = new jQuery.Deferred();
            self.send({
                action: 'initLiveEdit',
                id: id,
                lineNumber: lineNumber
            }).then(function() {
                deferred.resolve();
            }).fail(deferred.reject);
            return deferred.promise();
        },

        evaluate: function evaluate(jsCode, lineNumber) {
            self.send({
                action: 'evaluate',
                code: jsCode,
                lineNumber: lineNumber
            });
        },

        onEvalResult: function(cb) {
            self.evalEl.on('evalResult', function(e, data) {
                cb(data);
            });
        },

        getSeconds: function(timestamp, origo) {
            var diff = timestamp - origo;
            var inSeconds = diff / 1000;
            return Math.round(inSeconds * 10) / 10;
        }
    };

    module.exports = self;
});
