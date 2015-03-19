var async = require('async');
var events = require('events');
var util = require('util');
var tracrUtils = require('./utils');
var escodegen = require('escodegen');
var ChromeInput = require('./chromeInput');
var chromeInput = new ChromeInput();
var _ = require('lodash');
var exec = require('child_process').exec;
var Q = require('q');
var Chrome = require('chrome-remote-interface');

function ChromeUtils() {
    events.EventEmitter.call(this);

    var self = this;
    var chrome;
    var stateData = {
        frameEvalQueue: [],
        eventQueue: []
    };

    self.init = function() {
        var deferred = Q.defer();
        Chrome({port:tracrUtils.settings.port}, function(chrome) {
            self.setChrome(chrome);

            chrome.Page.enable();
            chrome.Debugger.enable();
            chrome.Runtime.enable();

            chrome.on('event', function(msg) {
                console.log('Received', msg.method);
            });

            chrome.on('Runtime.executionContextCreated', function(data) {
                if (data.context.isPageContext && stateData.currentUrl) {
                    self.replayEvents(data.id);
                }
            });

            chrome.on('Debugger.paused', function(data) {
                console.log('Stopped on breakpoint');
                var callFrame = data.callFrames[0];
                self.setCallFrame(callFrame.callFrameId);
                var getPropertiesId = callFrame.scopeChain[0].object.objectId;

                chrome.Runtime.getProperties({
                    objectId: getPropertiesId,
                    ownProperties:false,
                    accessorPropertiesOnly:false
                }, function(err, response) {
                    response.action = 'liveEditReady';
                    self.emit('liveEditReady', response);
                });
            });

            deferred.resolve();
        }).on('error', function() {
            console.error('Cannot connect to Chrome');
        });
        return deferred.promise;
    };

    self.setChrome = function(chromeInstance) {
        chrome = chromeInstance;
    };

    self.setCallFrame = function(frame) {
        stateData.callFrame = frame;
    };

    self.initLiveEdit = function(row, lineNumber) {
        stateData.liveEditRequested = true;

        var hashPos = row.windowLocation.indexOf('#');
        if (hashPos !== -1) {
            row.windowLocation = row.windowLocation.substring(0, hashPos);
        }

        // Trigger UI actions in order to get to the breakpoint
        if (row.events) {
            var tmpEvents = tracrUtils.getEventListForUi(row.events);
            stateData.eventQueue = _.map(tmpEvents, function(e, index) {
                e.prevEvent = tmpEvents[index - 1];
                return e;
            });
        }

        self.launchChrome().then(function() {
            chrome.Debugger.setBreakpointByUrl({
                lineNumber: lineNumber,
                url: row.filepath,
                columnNumber: 0,
                condition: ''
            }, function(err, response) {
                console.log('Breakpoint set: %s:%s', row.filepath, lineNumber);
                console.log('Navigate to', row.windowLocation);
                stateData.currentUrl = row.windowLocation;
                chrome.Page.navigate({url: row.windowLocation});
            });
        });
    };

    self.processEvalQueue = function(arr, fn) {
        async.eachSeries(arr, fn, function allCompleted() {
            arr.splice(0, arr.length);
        });
    };

    self.evalAllFrames = function() {
        self.processEvalQueue(stateData.frameEvalQueue, self.evalOnCallframe);
    };

    self.addToFrameEvalQueue = function(ast) {
        stateData.frameEvalQueue.push(ast);
    };

    self.documentReady = function(done) {
        chromeInput.eval('document.readyState').then(function(response) {
            console.log('Check readystate, got', response.result.value);
            if (response.result.value === 'complete') {
                done();
                return;
            }
            setTimeout(function() {
                self.documentReady(done);
            }, 500);
        });
    };

    self.replayEvents = function(contextId) {
        if (!stateData.liveEditRequested) {
            return;
        }
        chromeInput.init(chrome, contextId);
        chromeInput.eval('window.tracrReplayMode = true;');
        self.documentReady(function() {
            self.processEvalQueue(stateData.eventQueue, function(event, done) {
                var handlers = {
                    click: function(e, done) {
                        console.log('click', e.target.selector);
                        // Check for doubleclick
                        if (e.prevEvent && e.prevEvent.type === 'click'
                            && e.timestamp - e.prevEvent.timestamp <= 500) {
                            chromeInput.click(e.target.selector).then(function() {
                                console.log('dblclick', e.target.selector);
                                chromeInput.dblclick(e.target.selector).then(function() {
                                    done();
                                });
                            });
                            return;
                        }
                        chromeInput.click(e.target.selector).then(function() {
                            done();
                        });
                    },
                    keydown: function(e, done) {
                        var input = e.keyCode === 13 ? e.keyCode : e.target.value;
                        console.log('keydown', e.target.selector, input);
                        chromeInput.sendKeys(e.target.selector, input).then(done);
                    }
                };
                var handler = handlers[event.type];
                if (handler) {
                    setTimeout(function() {
                        handler(event, done)
                    }, 150);
                }
                else {
                    done();
                }
            });
        });
    };

    self.evalOnCallframe = function(nextAst, done) {
        if (!stateData.callFrame) {
            console.error('Tried to evaluate without a call frame reference!');
            return;
        }

        console.log('\n\nTried to generate', nextAst);
        var asJs = escodegen.generate(nextAst);

        if (nextAst.type === 'VariableDeclaration') {
            nextAst.declarations.forEach(function(declaration) {
                if (declaration.type === 'VariableDeclarator') {
                    asJs += ';' + declaration.id.name;
                }
            });
        }

        chrome.Debugger.evaluateOnCallFrame({
            callFrameId: stateData.callFrame,
            expression:asJs,
            objectGroup:'console',
            includeCommandLineAPI:true,
            doNotPauseOnExceptionsAndMuteConsole:false,
            returnByValue:false,
            generatePreview:true
        }, function(err, data) {
            console.log('Evaluated and received', asJs, data.result);
            self.emit('evalResult', {
                result: data.result,
                ast: nextAst
            });
            done();
        });
    };

    self.launchChrome = function() {
        console.log('Launching chrome');
        var deferred = Q.defer();
        // Kill prev chrome
        self.killChrome().then(function() {
            exec('xvfb-run google-chrome --user-data-dir="/tmp/lorem2" --incognito --remote-debugging-port='
            + tracrUtils.settings.port);
            stateData.currentUrl = null;
            setTimeout(function() {
                self.init().then(deferred.resolve);
            }, 1000); // Chrome init takes maybe 1s
        });
        return deferred.promise;
    };

    self.killChrome = function() {
        var deferred = Q.defer();
        exec('kill `ps aux|grep \'remote-debugging-port=' + tracrUtils.settings.port + '\'|awk \'{print $2}\'`');
        exec('kill `ps aux|grep \'xvfb.*Xauthority\'|awk \'{print $2}\'`');
        setTimeout(deferred.resolve, 100); // Need a short timeout, otherwise xvfb might not have been killed yet?
        return deferred.promise;
    };
}

// Kill chrome
process.on('exit', function() {
    new ChromeInput().killChrome();
});

util.inherits(ChromeUtils, events.EventEmitter);

module.exports = ChromeUtils;
