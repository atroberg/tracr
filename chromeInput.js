var Q = require('q');
var _ = require('lodash');
var async = require('async');

function ChromeInput() {
    var self = this;

    self.init = function(chrome, contextId) {
        self.chrome = chrome;
        self.contextId = contextId;
    };

    self.eval = function(expression) {
        var deferred = Q.defer();
        self.chrome.Runtime.evaluate({
            expression: expression,
            objectGroup: 'console',
            includeCommandLineAPI: true,
            doNotPauseOnExceptionsAndMuteConsole: false,
            contextId: self.contextId,
            returnByValue: false,
            generatePreview: true
        }, function(err, response) {
            deferred.resolve(response);
        });
        return deferred.promise;
    };

    self.dblclick = function(selector) {
        return self.eval('window.tracr.dispatchMouseEvent("dblclick", "' + selector + '")');
    };

    self.click = function(selector) {
        return self.eval('window.tracr.dispatchMouseEvent("click", "' + selector + '")');
    };

    self.sendKeys = function(selector, input) {
        if (typeof input === 'number') {
            input = String.fromCharCode(input);
        }
        var deferred = Q.defer();
        var chars = input.split('');
        var queue = [];
        chars.forEach(function(char) {
            // Enter
            if (char === '\n' || char === '\r') {
                queue.push({type:'rawKeyDown', nativeVirtualKeyCode:13, unmodifiedText:'\r', text:'\r'});
                queue.push({type:'char', text:'\r'});
                return;
            }
            queue.push({type:'char', text:char});
        });
        async.eachSeries(queue, function(opts, done) {
            self.chrome.Input.dispatchKeyEvent(opts, function() {
                setTimeout(done, 10);
            })
        }, function allCompleted() {
            deferred.resolve();
        });
        return deferred.promise;
    };

    self.getElementCoordinates = function(selector) {
        var deferred = Q.defer();
        self.eval('window.tracr.getCoordinates(\'' + selector + '\')')
        .then(function(response) {
            var props = response.result.preview.properties;
            var top = props[0];
            var left = props[1];
            deferred.resolve({
                top: top.value,
                left: left.value
            });
        });
        return deferred.promise;
    };
}

module.exports = ChromeInput;
