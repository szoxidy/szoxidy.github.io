(() => {
    'use strict';

    const figureSelector = '#article-container figure.highlight';
    const copyToastDuration = 5000;
    const copyButtonFeedbackDuration = 1200;
    const copyButtonFeedbackTimers = new WeakMap();
    const heightLimitRefreshers = new WeakMap();
    let resizeFrame = null;
    let copyToastTimer = null;
    let copyToastRemovalTimer = null;
    let activeFullpage = null;

    const removeCopyToast = toast => {
        if (!toast) {
            return;
        }

        window.clearTimeout(copyToastTimer);
        window.clearTimeout(copyToastRemovalTimer);
        toast.classList.remove('is-visible');
        toast.classList.add('is-leaving');
        copyToastRemovalTimer = window.setTimeout(() => toast.remove(), 220);
    };

    const showCopyToast = isSuccess => {
        const previousToast = document.querySelector('.code-copy-toast');

        if (previousToast) {
            previousToast.remove();
        }

        window.clearTimeout(copyToastTimer);
        window.clearTimeout(copyToastRemovalTimer);

        const toast = document.createElement('div');
        toast.className = `code-copy-toast ${isSuccess ? 'is-success' : 'is-error'}`;
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');

        const statusIcon = document.createElement('i');
        statusIcon.className = `fas ${isSuccess ? 'fa-check' : 'fa-exclamation-triangle'} code-copy-toast__icon`;

        const content = document.createElement('div');
        content.className = 'code-copy-toast__content';

        const title = document.createElement('strong');
        title.textContent = isSuccess ? '复制成功' : '复制失败';

        const description = document.createElement('span');
        description.textContent = isSuccess ? '代码已复制到剪贴板' : '请手动选择代码复制';

        const closeButton = document.createElement('button');
        closeButton.className = 'code-copy-toast__close';
        closeButton.type = 'button';
        closeButton.setAttribute('aria-label', '关闭提示');
        closeButton.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
        closeButton.addEventListener('click', () => removeCopyToast(toast));

        const progress = document.createElement('div');
        progress.className = 'code-copy-toast__progress';
        progress.setAttribute('aria-hidden', 'true');

        content.append(title, description);
        toast.style.setProperty('--code-copy-toast-duration', `${copyToastDuration}ms`);
        toast.append(statusIcon, content, closeButton, progress);
        document.body.appendChild(toast);

        window.requestAnimationFrame(() => toast.classList.add('is-visible'));
        copyToastTimer = window.setTimeout(() => removeCopyToast(toast), copyToastDuration);
    };

    const writeClipboard = async text => {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();

        const silenceLegacyCopyNotice = event => event.stopImmediatePropagation();
        document.addEventListener('copy', silenceLegacyCopyNotice, true);
        let copied = false;

        try {
            copied = document.execCommand('copy');
        } finally {
            document.removeEventListener('copy', silenceLegacyCopyNotice, true);
            textarea.remove();
        }

        if (!copied) {
            throw new Error('Copy command failed');
        }
    };

    const showCopyButtonFeedback = (button, isSuccess) => {
        const previousTimer = copyButtonFeedbackTimers.get(button);

        if (previousTimer) {
            window.clearTimeout(previousTimer);
        }

        button.classList.remove(
            'fa-paste',
            'fa-check',
            'fa-exclamation-triangle',
            'is-copy-success',
            'is-copy-error'
        );

        // Force a fresh animation when the button is clicked repeatedly.
        void button.offsetWidth;
        button.classList.add(
            isSuccess ? 'fa-check' : 'fa-exclamation-triangle',
            isSuccess ? 'is-copy-success' : 'is-copy-error'
        );
        setTooltip(button, isSuccess ? '已复制' : '复制失败');

        const timer = window.setTimeout(() => {
            button.classList.remove(
                'fa-check',
                'fa-exclamation-triangle',
                'is-copy-success',
                'is-copy-error'
            );
            button.classList.add('fa-paste');
            setTooltip(button, '复制代码');
            copyButtonFeedbackTimers.delete(button);
        }, copyButtonFeedbackDuration);

        copyButtonFeedbackTimers.set(button, timer);
    };

    const handleCodeCopy = event => {
        const copyButton = event.target instanceof Element
            ? event.target.closest(`${figureSelector} .copy-button`)
            : null;

        if (!copyButton) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const figure = copyButton.closest('figure.highlight');
        const codeElement = figure?.querySelector('table .code pre');

        if (!codeElement) {
            showCopyButtonFeedback(copyButton, false);
            showCopyToast(false);
            return;
        }

        writeClipboard(codeElement.innerText)
            .then(() => {
                showCopyButtonFeedback(copyButton, true);
                showCopyToast(true);
            })
            .catch(error => {
                console.error('Failed to copy code:', error);
                showCopyButtonFeedback(copyButton, false);
                showCopyToast(false);
            });
    };

    const setTooltip = (button, text) => {
        if (!button) {
            return;
        }

        button.dataset.codeTooltip = text;
        button.setAttribute('aria-label', text);
    };

    const makeButton = (className, tooltip) => {
        const button = document.createElement('i');
        button.className = `fa-solid ${className} code-toolbar-button`;
        button.setAttribute('role', 'button');
        button.setAttribute('tabindex', '0');
        setTooltip(button, tooltip);
        return button;
    };

    const makeKeyboardAccessible = button => {
        if (!button || button.dataset.codeKeyboardReady === 'true') {
            return;
        }

        button.dataset.codeKeyboardReady = 'true';
        button.setAttribute('role', 'button');
        button.setAttribute('tabindex', '0');
        button.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }

            event.preventDefault();
            button.click();
        });
    };

    const resetLineHeights = figure => {
        figure.querySelectorAll('.gutter .line').forEach(line => {
            line.style.removeProperty('height');
        });
    };

    const rememberGutterWidth = figure => {
        const gutter = figure.querySelector('.gutter');

        if (!gutter || figure.classList.contains('code-lines-hidden')) {
            return;
        }

        const gutterWidth = gutter.getBoundingClientRect().width;

        if (gutterWidth > 0) {
            figure.style.setProperty('--code-gutter-width', `${Math.ceil(gutterWidth)}px`);
        }
    };

    const syncLineHeights = figure => {
        // Transformed rectangles during fullscreen motion aren't layout line heights.
        if (activeFullpage?.figure === figure && activeFullpage.animation?.playState === 'running') return;
        resetLineHeights(figure);

        if (!figure.classList.contains('code-wrap-enabled') || figure.classList.contains('code-lines-hidden')) {
            heightLimitRefreshers.get(figure)?.();
            return;
        }

        const codeLines = figure.querySelectorAll('.code .line');
        const numberLines = figure.querySelectorAll('.gutter .line');

        codeLines.forEach((line, index) => {
            const numberLine = numberLines[index];

            if (numberLine) {
                numberLine.style.height = `${Math.ceil(line.getBoundingClientRect().height)}px`;
            }
        });
        heightLimitRefreshers.get(figure)?.();
    };

    const scheduleLineSync = figure => {
        window.requestAnimationFrame(() => syncLineHeights(figure));
        window.setTimeout(() => syncLineHeights(figure), 300);
    };

    const wrapCodeContent = (figure, toolbar) => {
        const existingShell = figure.querySelector(':scope > .code-collapse-shell');

        if (existingShell) {
            return existingShell.querySelector(':scope > .code-collapse-body');
        }

        const shell = document.createElement('div');
        const body = document.createElement('div');
        shell.className = 'code-collapse-shell';
        body.className = 'code-collapse-body';

        while (toolbar.nextSibling) {
            body.appendChild(toolbar.nextSibling);
        }

        shell.appendChild(body);
        figure.appendChild(shell);
        return body;
    };

    const prepareHeightLimit = (figure, body) => {
        const expandButton = body?.querySelector(':scope > .code-expand-btn');
        const codePanel = body?.querySelector(':scope > table, :scope > pre');

        if (!expandButton || !codePanel) {
            return;
        }

        const renderedLimit = parseFloat(window.getComputedStyle(codePanel).height) || 230;
        const codeLines = [...codePanel.querySelectorAll('.code .line, code .line')];
        // Cut at the next row's top, including pre padding and wrapped lines.
        // A fixed pixel height can leave half a line number above the footer.
        const measureLimit = () => {
            const panelTop = codePanel.getBoundingClientRect().top;
            const boundaries = codeLines.slice(1).map(line => line.getBoundingClientRect().top - panelTop);
            const lastBoundary = boundaries.filter(height => height > 0 && height <= renderedLimit).at(-1);
            return Math.floor(lastBoundary || boundaries.find(height => height > 0) || renderedLimit);
        };
        let collapsedHeight = measureLimit();
        const fullHeight = codePanel.scrollHeight;

        if (fullHeight <= collapsedHeight) {
            expandButton.remove();
            return;
        }

        figure.classList.add('code-height-limited');
        figure.style.setProperty('--code-collapsed-height', `${collapsedHeight}px`);
        body.appendChild(expandButton);
        heightLimitRefreshers.set(figure, () => {
            if (figure.classList.contains('code-fullpage') || figure.querySelector('.highlight-tools.closed')) return;
            collapsedHeight = measureLimit();
            figure.style.setProperty('--code-collapsed-height', `${collapsedHeight}px`);
            if (!figure.classList.contains('code-height-expanded')) codePanel.style.maxHeight = `${collapsedHeight}px`;
        });

        const updateButtonState = () => {
            const isExpanded = expandButton.classList.contains('expand-done');
            expandButton.setAttribute('aria-expanded', String(isExpanded));
            expandButton.setAttribute('aria-label', isExpanded ? '收起长代码' : '展开全部代码');
        };

        const animateHeight = () => {
            if (figure.classList.contains('code-fullpage')) return;
            const isExpanded = expandButton.classList.contains('expand-done');
            const startHeight = codePanel.getBoundingClientRect().height;
            const transitionToken = `${Date.now()}-${Math.random()}`;

            codePanel.dataset.codeHeightTransition = transitionToken;
            codePanel.style.maxHeight = `${Math.ceil(startHeight)}px`;
            void codePanel.offsetHeight;
            figure.classList.toggle('code-height-expanded', isExpanded);

            window.requestAnimationFrame(() => {
                if (figure.classList.contains('code-fullpage')) return;
                const targetHeight = isExpanded ? codePanel.scrollHeight : collapsedHeight;
                codePanel.style.maxHeight = `${Math.ceil(targetHeight)}px`;
            });

            window.setTimeout(() => {
                if (
                    isExpanded &&
                    figure.classList.contains('code-height-expanded') &&
                    codePanel.dataset.codeHeightTransition === transitionToken
                ) {
                    codePanel.style.maxHeight = 'none';
                }
            }, 440);

            updateButtonState();
        };

        figure.classList.toggle('code-height-expanded', expandButton.classList.contains('expand-done'));
        codePanel.style.maxHeight = expandButton.classList.contains('expand-done')
            ? 'none'
            : `${collapsedHeight}px`;
        makeKeyboardAccessible(expandButton);
        updateButtonState();
        expandButton.addEventListener('click', () => window.requestAnimationFrame(animateHeight));
    };

    const setFullpageControls = (figure, toolbar, fullpageButton, isFullpage) => {
        fullpageButton.classList.toggle('fa-down-left-and-up-right-to-center', isFullpage);
        fullpageButton.classList.toggle('fa-up-right-and-down-left-from-center', !isFullpage);
        fullpageButton.setAttribute('aria-pressed', String(isFullpage));
        setTooltip(fullpageButton, isFullpage ? '退出全屏' : '全屏显示');
        const collapseButton = toolbar.querySelector('.expand');
        setTooltip(collapseButton, toolbar.classList.contains('closed') ? '展开代码' : '收起代码');
        collapseButton?.setAttribute('aria-expanded', String(!toolbar.classList.contains('closed')));
        const expandButton = figure.querySelector('.code-expand-btn');
        if (expandButton) {
            const expanded = expandButton.classList.contains('expand-done');
            expandButton.setAttribute('aria-expanded', String(expanded));
            expandButton.setAttribute('aria-label', expanded ? '收起长代码' : '展开全部代码');
        }
    };

    const finishFullpage = (state, restorePosition) => {
        state.animation?.cancel();
        const { figure, toolbar, button, panel, placeholder, wasClosed, wasExpanded,
            maxHeight, scrollX, scrollY, bodyOverflow, scrollbarGutter } = state;
        activeFullpage = null;
        figure.classList.remove('code-fullpage');
        toolbar.classList.toggle('closed', wasClosed);
        figure.classList.toggle('code-height-expanded', wasExpanded);
        figure.querySelector('.code-expand-btn')?.classList.toggle('expand-done', wasExpanded);
        if (panel) panel.style.maxHeight = maxHeight;
        placeholder.remove();
        document.body.style.overflow = bodyOverflow;
        document.documentElement.style.scrollbarGutter = scrollbarGutter;
        setFullpageControls(figure, toolbar, button, false);
        if (restorePosition && figure.isConnected) {
            window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' });
            button.focus({ preventScroll: true });
            scheduleLineSync(figure);
        }
    };

    const fullpageTransform = (rect, fullRect) =>
        `translate(${rect.left - fullRect.left}px, ${rect.top - fullRect.top}px) scale(${rect.width / fullRect.width}, ${rect.height / fullRect.height})`;

    const exitFullpage = (restorePosition = true, animate = true) => {
        const state = activeFullpage;
        if (!state) return;
        if (!restorePosition || !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            finishFullpage(state, restorePosition);
            return;
        }
        if (state.exiting) return;
        state.exiting = true;
        const { figure, placeholder } = state;
        // Capture an interrupted entrance before cancelling it, so Escape never snaps.
        const startTransform = window.getComputedStyle(figure).transform;
        state.animation?.cancel();
        const fullRect = figure.getBoundingClientRect();
        state.animation = figure.animate([
            { transform: startTransform, borderRadius: '0px' },
            { transform: fullpageTransform(placeholder.getBoundingClientRect(), fullRect), borderRadius: state.borderRadius },
        ], { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' });
        state.animation.onfinish = () => {
            if (activeFullpage === state) finishFullpage(state, true);
        };
    };

    const enterFullpage = (figure, toolbar, button) => {
        if (activeFullpage) exitFullpage(true, false);
        const rect = figure.getBoundingClientRect();
        const style = window.getComputedStyle(figure);
        const borderRadius = style.borderRadius;
        const panel = figure.querySelector('.code-collapse-body > table, .code-collapse-body > pre');
        const placeholder = document.createElement('div');
        placeholder.className = 'code-fullpage-placeholder';
        placeholder.style.height = `${rect.height}px`;
        placeholder.style.marginTop = style.marginTop;
        placeholder.style.marginBottom = style.marginBottom;
        placeholder.setAttribute('aria-hidden', 'true');
        activeFullpage = {
            figure, toolbar, button, panel, placeholder, borderRadius,
            wasClosed: toolbar.classList.contains('closed'),
            wasExpanded: figure.classList.contains('code-height-expanded'),
            maxHeight: panel?.style.maxHeight || '',
            scrollX: window.scrollX, scrollY: window.scrollY,
            bodyOverflow: document.body.style.overflow,
            scrollbarGutter: document.documentElement.style.scrollbarGutter,
        };
        figure.before(placeholder);
        document.documentElement.style.scrollbarGutter = 'stable';
        document.body.style.overflow = 'hidden';
        toolbar.classList.remove('closed');
        if (figure.querySelector('.code-expand-btn')) {
            figure.classList.add('code-height-expanded');
            figure.querySelector('.code-expand-btn').classList.add('expand-done');
        }
        if (panel) panel.style.maxHeight = 'none';
        figure.classList.add('code-fullpage');
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            activeFullpage.animation = figure.animate([
                { transform: fullpageTransform(rect, figure.getBoundingClientRect()), borderRadius },
                { transform: 'none', borderRadius: '0px' },
            ], { duration: 360, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
            activeFullpage.animation.onfinish = () => scheduleLineSync(figure);
        }
        setFullpageControls(figure, toolbar, button, true);
        scheduleLineSync(figure);
    };

    const enhanceFigure = figure => {
        const toolbar = figure.querySelector(':scope > .highlight-tools');

        if (!toolbar || toolbar.dataset.codeToolsEnhanced === 'true') {
            return;
        }

        toolbar.dataset.codeToolsEnhanced = 'true';
        rememberGutterWidth(figure);
        figure.classList.add('code-tools-enhanced');
        const codeBody = wrapCodeContent(figure, toolbar);
        prepareHeightLimit(figure, codeBody);

        const copyButton = toolbar.querySelector('.copy-button');
        const fullpageButton = toolbar.querySelector('.fullpage-button');
        const collapseButton = toolbar.querySelector('.expand');
        const canCollapse = figure.classList.contains('code-height-limited');

        figure.classList.toggle('code-collapse-available', canCollapse);

        if (!canCollapse) {
            toolbar.classList.remove('closed');
        }

        const insertBefore = copyButton || fullpageButton || collapseButton;
        const lineNumberButton = makeButton('fa-list-ol code-line-number-button', '隐藏行号');
        const wrapButton = makeButton('fa-align-left code-wrap-button', '开启折行');

        toolbar.insertBefore(lineNumberButton, insertBefore);
        toolbar.insertBefore(wrapButton, insertBefore);

        const updateLineNumberState = () => {
            const isHidden = figure.classList.contains('code-lines-hidden');
            const gutter = figure.querySelector('.gutter');
            setTooltip(lineNumberButton, isHidden ? '显示行号' : '隐藏行号');
            lineNumberButton.setAttribute('aria-pressed', String(isHidden));
            gutter?.setAttribute('aria-hidden', String(isHidden));
        };

        const updateWrapState = () => {
            const isWrapped = figure.classList.contains('code-wrap-enabled');
            setTooltip(wrapButton, isWrapped ? '关闭折行' : '开启折行');
            wrapButton.setAttribute('aria-pressed', String(isWrapped));
        };

        lineNumberButton.addEventListener('click', () => {
            rememberGutterWidth(figure);
            figure.classList.toggle('code-lines-hidden');
            updateLineNumberState();
            scheduleLineSync(figure);
        });

        wrapButton.addEventListener('click', () => {
            rememberGutterWidth(figure);
            figure.classList.toggle('code-wrap-enabled');
            updateWrapState();
            scheduleLineSync(figure);
        });

        makeKeyboardAccessible(lineNumberButton);
        makeKeyboardAccessible(wrapButton);
        updateLineNumberState();
        updateWrapState();

        if (copyButton) {
            setTooltip(copyButton, '复制代码');
            makeKeyboardAccessible(copyButton);
        }

        if (fullpageButton) {
            setTooltip(fullpageButton, '全屏显示');
            fullpageButton.setAttribute('aria-pressed', 'false');
            makeKeyboardAccessible(fullpageButton);
            fullpageButton.addEventListener('click', event => {
                // Own this transition instead of also invoking the theme's bubbling toggle.
                event.preventDefault();
                event.stopPropagation();
                if (figure.classList.contains('code-fullpage')) exitFullpage();
                else enterFullpage(figure, toolbar, fullpageButton);
            });
        }

        if (collapseButton && canCollapse) {
            const updateCollapseState = () => {
                setTooltip(
                    collapseButton,
                    toolbar.classList.contains('closed') ? '展开代码' : '收起代码'
                );
                collapseButton.setAttribute('aria-expanded', String(!toolbar.classList.contains('closed')));
            };

            updateCollapseState();
            makeKeyboardAccessible(collapseButton);
            collapseButton.addEventListener('click', () => {
                window.requestAnimationFrame(() => {
                    updateCollapseState();
                    const expandButton = figure.querySelector('.code-expand-btn');
                    if (!toolbar.classList.contains('closed') && expandButton && !expandButton.classList.contains('expand-done')) {
                        expandButton.click();
                    }
                    scheduleLineSync(figure);
                });
            });
        }
    };

    const enhanceCodeBlocks = () => {
        document.querySelectorAll(figureSelector).forEach(enhanceFigure);
    };

    const scheduleEnhance = () => {
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(enhanceCodeBlocks);
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleEnhance, { once: true });
    } else {
        scheduleEnhance();
    }

    document.addEventListener('pjax:send', () => exitFullpage(false));
    document.addEventListener('pjax:complete', () => {
        if (activeFullpage && !activeFullpage.figure.isConnected) exitFullpage(false);
        scheduleEnhance();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && activeFullpage) {
            event.preventDefault();
            exitFullpage();
        }
    });
    document.addEventListener('click', handleCodeCopy, true);
    window.addEventListener('resize', () => {
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(() => {
            document.querySelectorAll(figureSelector).forEach(syncLineHeights);
        });
    });
})();
