(() => {
    const configScript = document.querySelector('script[data-dynamic-subtitle]');

    if (!configScript) {
        return;
    }

    const targetSelector = configScript.getAttribute('data-target') || '#subtitle';
    const separator = configScript.getAttribute('split') || '-';
    const phrases = (configScript.getAttribute('texts') || 'Hi.')
        .split(separator)
        .map(text => text.trim())
        .filter(Boolean);
    const colors = [
        '#6e40aa', '#963db3', '#bf3caf', '#e4419d', '#fe4b83',
        '#ff5e63', '#ff7847', '#fb9633', '#e2b72f', '#c6d63c',
        '#7ff658', '#30ef82', '#1ddfa3', '#23abd8', '#4c6edb'
    ];
    const frameDelay = 75;
    const fullTextHoldFrames = 12;
    const replayHoldFrames = 12;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer = null;
    let runId = 0;

    const stop = () => {
        runId += 1;
        window.clearTimeout(timer);
        timer = null;
    };

    const appendScramble = (element, count) => {
        const fragment = document.createDocumentFragment();

        for (let index = 0; index < count; index += 1) {
            const character = document.createElement('span');
            character.textContent = String.fromCharCode(Math.floor(Math.random() * 94) + 33);
            character.style.color = colors[Math.floor(Math.random() * colors.length)];
            fragment.appendChild(character);
        }

        element.appendChild(fragment);
    };

    const start = () => {
        stop();

        const element = document.querySelector(targetSelector);
        if (!element || !phrases.length) {
            return;
        }

        if (reduceMotion.matches) {
            element.textContent = phrases[0];
            return;
        }

        const currentRunId = runId;
        let phraseIndex = 0;
        let characterIndex = 0;
        let direction = 1;
        let holdFrames = 0;
        let waitingForReplay = false;

        const render = () => {
            if (currentRunId !== runId || !element.isConnected || document.hidden) {
                return;
            }

            const phrase = phrases[phraseIndex];

            if (holdFrames > 0) {
                holdFrames -= 1;
            } else {
                waitingForReplay = false;

                if (direction > 0) {
                    characterIndex += 1;

                    if (characterIndex >= phrase.length) {
                        characterIndex = phrase.length;
                        direction = -1;
                        holdFrames = fullTextHoldFrames;
                    }
                } else {
                    characterIndex -= 1;

                    if (characterIndex <= 0) {
                        characterIndex = 0;
                        direction = 1;
                        phraseIndex = (phraseIndex + 1) % phrases.length;
                        holdFrames = replayHoldFrames;
                        waitingForReplay = true;
                    }
                }
            }

            element.textContent = phrase.slice(0, characterIndex);

            if (!waitingForReplay) {
                appendScramble(element, Math.min(5, Math.max(0, phrase.length - characterIndex)));
            }

            timer = window.setTimeout(render, frameDelay);
        };

        render();
    };

    const handleVisibilityChange = () => {
        if (document.hidden) {
            stop();
        } else {
            start();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }

    if (window.btf?.addGlobalFn) {
        btf.addGlobalFn('pjaxSend', stop, 'szoxidySubtitleStop');
        btf.addGlobalFn('pjaxComplete', start, 'szoxidySubtitleStart');
    } else {
        document.addEventListener('pjax:send', stop);
        document.addEventListener('pjax:complete', start);
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (typeof reduceMotion.addEventListener === 'function') {
        reduceMotion.addEventListener('change', start);
    } else {
        reduceMotion.addListener(start);
    }
})();
