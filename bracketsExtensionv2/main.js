/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, window */

define(function(require, exports, module) {
    'use strict';

    require('./node_modules/underscore/underscore-min');
    require('./node_modules/jsonview/dist/jquery.jsonview');
    require('./dist/templates');

    var PREVIEW_MAX_LENGTH = 100;
    var ExtensionUtils = brackets.getModule('utils/ExtensionUtils');
    var EditorManager = brackets.getModule('editor/EditorManager');

    ExtensionUtils.loadStyleSheet(module, './node_modules/jsonview/dist/jquery.jsonview.css');
    ExtensionUtils.loadStyleSheet(module, './dist/css/tracr.css');

    var templates = window.tracr.templates;
    var tracr = require('./tracr');
    var codeMirror;
    var blockLiveEdit;
    var $preview = $(
        '<div id="tracrPreview" class="popover bottom">' +
        '<div class="arrow"></div>' +
        '<div class="popover-content">' +
        '</div>' +
        '</div>'
    ).appendTo('body');
    var $liveEditActive = $('<div id="tracrLiveEditActive">Stop live edit</div>').on('click', function() {
        blockLiveEdit = true;
        $(this).hide();
        $('.tracrResult').remove();
    }).appendTo('body');
    var $tracr = $('<div id="tracr" class="popover bottom" />');

    tracr.initSocket();
    tracr.onEvalResult(function(data) {
        var preview = 'undefined';

        if (data.result) {
            preview = data.result.description || data.result.value;
        }

        if (preview === '') {
            preview = '\'\'';
        }

        try {
            preview = preview.toString();
        }
        catch (e) {
            preview = 'undefined';
        }

        if (preview.length > PREVIEW_MAX_LENGTH) {
            data.result.preview = preview;
            preview = preview.substring(0, PREVIEW_MAX_LENGTH) + '...';
        }

        // Which line the result should be appended to
        var lineNumber = data.ast.loc.end.line;
        var lineNumberEl = _.find(
            $('.CodeMirror:visible .CodeMirror-lines:first .CodeMirror-linenumber'),
            function(el) {
                return el.innerHTML === lineNumber + '';
            }
        );
        var $line = $(lineNumberEl).parent().parent();

        $line.find('.tracrResult').remove();

        var $result = $('<span class="tracrResult" />').text(preview);
        if (data.result && data.result.preview) {
            $result.addClass('hasPreview').data('result', data.result);
        }
        $line.find('pre').append($result);
    });

    // Set event listeners
    $('body').on('mousedown', '.tracrResult.hasPreview', function(e) {
        var $el = $(this);
        $preview.find('.popover-content').JSONView($el.data('result'));
        var position = {
            left: ($el.offset().left + $el.width() / 2) - ($preview.width() / 2),
            top: $el.offset().top + $el.height()
        };

        // Check if not enough room under $el -> show instead above
        if (position.top + $preview.height() > $(window).height()) {
            $preview.removeClass('bottom').addClass('top');
            position.top = $el.offset().top - $preview.height();
        }
        else {
            $preview.removeClass('top').addClass('bottom');
        }

        $preview.css({
            display: 'block',
            left: position.left + 'px',
            top: position.top + 'px'
        });
    })
    .on('click', '#tracr button.next', function() {
        $tracr.trigger('showTrace', $tracr.data('currentIndex') + 1);
    })
    .on('click', '#tracr button.prev', function() {
        $tracr.trigger('showTrace', $tracr.data('currentIndex') - 1);
    })
    .on('click', '#tracr #liveEdit', function() {
        var trace = getTrace().trace;
        $tracr.addClass('liveEditLoading');
        tracr.initLiveEdit(trace.id, $tracr.data('editorLineNumber')).then(function() {
            blockLiveEdit = false;
            $liveEditActive.show();
            $tracr.removeClass('liveEditLoading').hide();
            console.log('Tracr: live edit ready');
            initCodeMirror();
        }).fail(function() {
            $tracr.removeClass('liveEditLoading');
            alert('Error when starting live edit');
        });
    })
    .on('showTrace', '#tracr', function(e, index) {
        var traceData = getTrace(index);
        var trace = traceData.trace;

        if (!trace) {
            throw Error('Tracr: no matching trace found');
        }
        console.log('Tracr show trace', trace);

        $tracr.html(templates.mainWindow($.extend({
            index: traceData.index + 1,
            total: ($tracr.data('traces') || []).length
        }, trace)))
        .find('#arguments')
        .JSONView(trace['arguments'], {collapsed: true})
        .JSONView('expand', 1);
        $tracr.find('.arrow').css('left', $tracr.data('arrowPosLeft'));
    });

    document.body.addEventListener('mousedown', function(e) {
        var target = $(e.target);

        // If mousedown on a function definition
        if (
            (isFnDeclaration(target) && !target.next().hasClass('cm-variable')) ||
            (target.is('.cm-variable, .cm-def') && isFnDeclaration(target.prev()))
        ) {
            var pre = target.parents('pre:first');
            var lineNumber = parseInt(pre.prev().find('.CodeMirror-linenumber').text());
            var lineContents = pre.text();

            var matches = lineContents.match(/.*\s*function(.*)\(([^\)]*)\)/);

            // TODO: fix cases where function definition is on multiple lines
            if (!matches) {
                console.log('Mousedown, but was not function declaration, aborting');
                return;
            }

            var $attachTo = $('.CodeMirror:visible .CodeMirror-lines');
            $tracr.appendTo($attachTo);

            var offset = target.offset();
            var position = target.position();
            var targetPos = {
                left: position.left + (target.width() / 2) - ($tracr.width() / 2),
                top: offset.top
            };
            var targetHeight = target.height();
            if (targetPos.left < 0) {
                $tracr.data('arrowPosLeft', position.left + (target.width() / 2) + 'px');
                targetPos.left = 0;
            }
            else {
                $tracr.data('arrowPosLeft', '50%');
            }

            // Brackets resets offset when scrolling? Need to wait for editor
            // before getting offset top... TODO: fix this in a better way
            var showTimeout = setTimeout(function() {
                $tracr.css({
                    left: targetPos.left + 'px',
                    top: targetPos.top - $attachTo.offset().top + targetHeight + 'px',
                    display: 'block'
                });
            }, 200);

            $tracr.find('#arguments').html('Loading...');

            var fnName = matches[1].trim();
            var prevNode = findPrevNode(target);
            if (!fnName && target.prev().hasClass('cm-property') && typeof prevNode === 'string'
                    && prevNode.trim() === ':') {
                fnName = target.prev().text();
            }

            // Used for matching argument names in recorded traces
            var argString = matches[2];

            blockLiveEdit = true;
            $liveEditActive.hide();
            tracr.getTraces(fnName, $('.title-wrapper .title').text(), lineNumber, argString)
            .then(function(traces) {
                if (traces.length === 0) {
                    clearTimeout(showTimeout);
                    $tracr.hide();
                    return;
                }
                $tracr.data('editorLineNumber', lineNumber);
                $tracr.data('traces', traces).trigger('showTrace', 0);
            })
            .fail(function() {
                clearTimeout(showTimeout);
                $tracr.hide();
            });
        }

        // If already visible and mousedown outside Tracr popup -> hide Tracr or $preview
        else if (!target.is('#tracr')
                && target.parents('#tracr').length === 0
                && !target.is('#tracrPreview')
                && target.parents('#tracrPreview').length === 0) {
            $tracr.hide();
            $preview.hide();
        }
    }, true);

    // TODO: combine the functions below to a helper etc..
    function initCodeMirror() {
        codeMirror = EditorManager.getActiveEditor()._codeMirror;
        if (codeMirror.tracrAttached) {
            return;
        }
        var timeout;
        codeMirror.on('update', function() {
            codeMirror.tracrAttached = true;
            console.log('block live', blockLiveEdit);
            if (blockLiveEdit) {
                return;
            }
            if (timeout) {
                clearTimeout(timeout);
            }
            timeout = setTimeout(function() {
                console.log('Tracr evaluate');
                tracr.evaluate(codeMirror.getValue(), $tracr.data('editorLineNumber'));
            }, 50);
        });
    }

    function getTrace(index) {
        var traces = $tracr.data('traces') || [];
        if (index === undefined) {
            index = $tracr.data('currentIndex');
        }
        index = index % traces.length;
        if (index < 0) {
            index = traces.length - 1;
        }
        $tracr.data('currentIndex', index);
        return {
            trace: traces[index],
            index: index
        };
    }

    function isFnDeclaration(el) {
        return el.hasClass('cm-keyword') && el.html() === 'function';
    }

    function findPrevNode($el) {
        var tmpPrevNode;
        var prevNode;
        $el.parent().contents().each(function(i, node) {
            if (node === $el.get(0)) {
                prevNode = tmpPrevNode;
            }
            tmpPrevNode = node;
        });
        return prevNode;
    }

});
