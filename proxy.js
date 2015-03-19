var url = require('url');
var http = require('http');
var acceptor = http.createServer().listen(process.argv[2]);
var instrument = require('./instrument');
var _ = require('lodash');
var tracrUtils = require('./utils');

// Credits: http://stackoverflow.com/questions/13472024/simple-node-js-proxy-by-piping-http-server-to-http-request

acceptor.on('request', function(request, response) {
    console.log('request ' + request.url);
    request.pause();
    var options = url.parse(request.url);
    options.headers = request.headers;
    options.method = request.method;
    options.agent = false;

    // Don't accept gzipped content
    delete options.headers['accept-encoding'];

    var connector = http.request(options, function(serverResponse) {
        serverResponse.pause();
        response.writeHeader(serverResponse.statusCode, serverResponse.headers);

        var contentType = serverResponse.headers['content-type'] || '';
        var data = '';

        var handler = getHandler(contentType, request.url);

        if (handler) {
            serverResponse.on('data', function(chunk) {
                data += chunk;
            });
            serverResponse.on('end', function() {
                // Delete length, to avoid mismatch with actual length
                delete serverResponse.headers['content-length'];
                response.writeHead(serverResponse.statusCode, serverResponse.headers);
                response.end(handler(data));
            });
        }

        else {
            serverResponse.pipe(response);
        }

        serverResponse.resume();
    });
    request.pipe(connector);
    request.resume();
});

// Helpers
function getHandler(contentType, url) {
    if (tracrUtils.isBlacklisted(url)) {
        return;
    }
    if (contentType.indexOf('javascript') !== -1) {
        return handleJs;
    }
    else if (contentType.indexOf('text/html') !== -1) {
        return handleHtml;
    }
}

function handleHtml(data) {
    var jsTags = '';
    [
        'css-selector-generator.js',
        'jquery-2.1.3.min.js',
        'bililiteRange.js',
        'jquery.sendkeys.js',
        'JSON.prune.js',
        'tracrCapture.js'
    ].forEach(function(src) {
        jsTags += '<script src="http://localhost/tracr/tracrClientLib/' + src + '"></script>';
    });
    function replaceHeadTag(match) {
        return match + jsTags;
    }
    return data.replace(/<head[^>]*>/i, replaceHeadTag);
}

function handleJs(data) {
    return instrument(data);
}
