var WebSocketServer = require('ws').Server;
var events = require('events');
var util = require('util');

function BracketsClient() {
    var self = this;
    self.wss = new WebSocketServer({port: 10001});
    self.wss.on('connection', function(wsInstance) {
        self.ws = wsInstance;
        self.ws.on('message', function(msg) {
            self.emit('messageReceived', JSON.parse(msg));
        });
    });

    self.send = function(msg) {
        self.ws.send(JSON.stringify(msg));
    };
}

util.inherits(BracketsClient, events.EventEmitter);

module.exports = BracketsClient;