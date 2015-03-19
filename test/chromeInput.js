var should = require('should');
var Chrome = require('chrome-remote-interface');
var ChromeInput = require('../chromeInput');
var chromeInput = new ChromeInput();
var exec = require('child_process').exec;
var proxyError;
var _ = require('lodash');

function initChrome(done) {
    exec('node /home/alexis/tracr/proxy.js 10000', function(err) {
        err = err.toString() || '';
        proxyError = err.indexOf('EADDRINUSE');
    });
    exec('google-chrome --user-data-dir="/tmp/lorem2" --incognito --remote-debugging-port=9223' +
         ' http://localhost/todomvc/examples/vanillajs/');
    setTimeout(function() {
        Chrome({port: 9223}, function (chrome) {
            chrome.Page.enable();
            chrome.Runtime.enable();
            chrome.on('Runtime.executionContextCreated', function(data) {
                if (data.context.isPageContext) {
                    chromeInput.init(chrome, data.context.id);
                    done();
                }
            });
        });
    }, 1000);
}

describe('chomeInput', function () {
    this.timeout(5000);

    before(initChrome);

    var $newTodo = {
        selector: '#new-todo'
    };

    it('should get element coordinates', function(done) {
        chromeInput.getElementCoordinates($newTodo.selector).then(function (coordinates) {
            coordinates.top.should.be.above(0);
            coordinates.left.should.be.above(0);
            done();
        });
    });

    it('should click input element', function(done) {
        chromeInput.click($newTodo.selector).then(function() {
            // TODO: figure out a better way of asserting the click
            true.should.equal(true);
            done();
        });
    });

    it('should input new todo item', function(done) {
        // App initializations can take time (because it fetches resources from the web!!)
        setTimeout(function() {
            chromeInput.sendKeys($newTodo.selector, 'Osta maitoa\n').then(function () {
                chromeInput.eval('jQuery("#todo-count").text().split(" ")[0]')
                    .then(function (response) {
                        parseInt(response.result.value).should.equal(1);
                        done();
                    });
            });
        }, 2000);
    });
});

// Kill chrome (and proxy if it was started by this process)
process.on('exit', function() {
    exec('kill `ps aux|grep \'remote-debugging-port=9223\'|awk \'{print $2}\'`');
    if (!proxyError) {
        exec('kill `ps aux|grep \'tracr/proxy.js\'|awk \'{print $2}\'`');
    }
});
