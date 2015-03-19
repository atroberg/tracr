jQuery.noConflict();
(function($) {
    var tracr;
    var events = [
        'click',
        'keydown'
    ];

    if (!window.tracrReplayMode) {
        document.addEventListener('DOMContentLoaded', function () {
            events.forEach(function (event) {
                window.addEventListener(event, window.tracr.captureEvent, true);
            });
        });
    }

    tracr = {

        cssSelector: new CssSelectorGenerator,

        hashCode: function(str) {
            var char;
            var hash = 0;
            if (str.length == 0) return hash;
            for (var i = 0; i < str.length; i++) {
                char = str.charCodeAt(i);
                hash = ((hash<<5)-hash)+char;
                hash = hash & hash; // Convert to 32bit integer
            }
            return hash;
        },

        hashMap: {},

        traceCall: function (id, arguments, thisVar, lineNumber) {
            if (window.tracrReplayMode) return;
            var locationHash = window.location.hash ? '#' + window.location.hash : '';
            var data = {
                windowLocation: window.location.href + locationHash,
                arguments: arguments,
                thisVar: thisVar,
                lineNumber: lineNumber
            };

            var json = tracr.toJson(data);
            var hash = tracr.hashCode(json);
            if (tracr.hashMap[hash] && false) {
                return;
            }
            tracr.hashMap[hash] = true;
            json = '{"timestamp":' + Date.now() + ',' + json.substring(1);
            console.trace(json);
        },

        toJson: function (data) {
            return JSON.prune(data, 6, 100);
        },

        captureEvent: function captureEvent(rawEvent) {
            var e = {
                altKey: rawEvent.altKey,
                shiftKey: rawEvent.shiftKey,
                ctrlKey: rawEvent.ctrlKey,
                type: rawEvent.type,
                cancelable: rawEvent.cancelable,
                bubbles: rawEvent.bubbles,
                target: {
                    outerHtml: rawEvent.target.outerHTML,
                    selector: tracr.cssSelector.getSelector(rawEvent.target),
                    value: rawEvent.target.value
                },
                timestamp: Date.now()
            };
            if (rawEvent instanceof KeyboardEvent) {
                e.handler = 'KeyboardEvent';
                e.keyCode = rawEvent.keyCode;
            }
            else if (rawEvent instanceof MouseEvent) {
                e.handler = 'MouseEvent';
            }
            else {
                e.handler = 'Event';
            }
            console.log(JSON.stringify(e));
        },

        getCoordinates: function(selector) {
            var $el = $(selector);
            var topLeft = $el.offset();
            return {
                top: topLeft.top + ($el.height() / 2),
                left: topLeft.left + ($el.width() / 2)
            };
        },

        dispatchMouseEvent: function(type, selector) {
            var el = $(selector).get(0);
            if (!el) {
                return 'notFound';
            }
            var e = new MouseEvent(type, {
                view: window,
                bubbles: true,
                cancelable: true
            });
            el.dispatchEvent(e);
        }
    };

    window.tracr = tracr;
})(jQuery);
