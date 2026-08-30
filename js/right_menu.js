(() => {
    const supportsCustomContextMenu = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const postPathPattern = /^\/posts\/[^/]+(?:\/(?:index\.html)?)?$/;
    const archivePathPattern = /^\/archives(?:\/page\/\d+)?\/?$/;
    let postUrlCache = null;

    const readStorage = (key, fallback) => {
        try {
            return localStorage.getItem(key) || fallback;
        } catch (error) {
            return fallback;
        }
    };

    const writeStorage = (key, value) => {
        try {
            localStorage.setItem(key, value);
        } catch (error) {
            // Storage can be unavailable in strict privacy modes.
        }
    };

    const state = {
        bound: false,
        mouseMode: readStorage('mouse', 'on')
    };

    writeStorage('mouse', state.mouseMode);

    const rmf = {};
    window.rmf = rmf;

    const query = (selector, root = document) => root.querySelector(selector);
    const queryAll = (selector, root = document) => Array.from(root.querySelectorAll(selector));

    const getElement = (target) => {
        return target && target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
    };

    const showMessage = (text, position = 'top-left') => {
        if (window.siteNotify) {
            window.siteNotify({
                title: '提示',
                message: text,
                type: 'info',
                key: `right-menu-${position}`
            });
            return;
        }

        if (window.Snackbar) {
            Snackbar.show({
                text,
                pos: position,
                showAction: false
            });
            return;
        }

        alert(text);
    };

    const copyText = async (text) => {
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(text);

                if (window.copyNotify) {
                    window.copyNotify();
                } else {
                    showMessage('复制成功');
                }
                return true;
            } catch (error) {
                // Fall through to the textarea-based compatibility path.
            }
        }

        const txa = document.createElement('textarea');
        txa.value = text;
        txa.setAttribute('readonly', '');
        txa.style.position = 'fixed';
        txa.style.opacity = '0';
        document.body.appendChild(txa);
        txa.select();
        const copied = document.execCommand('copy');
        txa.remove();

        if (copied) {
            if (window.copyNotify) {
                window.copyNotify();
            } else {
                showMessage('复制成功');
            }
            return true;
        }

        showMessage('复制失败，请手动复制');
        return false;
    };

    const normalizePostUrl = (url) => {
        const parsed = new URL(url, location.origin);
        parsed.hash = '';
        parsed.search = '';
        parsed.pathname = parsed.pathname.replace(/index\.html$/, '').replace(/\/?$/, '/');
        return parsed.href;
    };

    const collectPostUrls = (root = document) => {
        const urls = new Set();

        queryAll('a[href]', root).forEach((link) => {
            const href = link.getAttribute('href');

            if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
                return;
            }

            try {
                const url = new URL(href, location.origin);

                if (url.origin === location.origin && postPathPattern.test(url.pathname)) {
                    urls.add(normalizePostUrl(url.href));
                }
            } catch (error) {
                // Ignore malformed hrefs from third-party widgets.
            }
        });

        return Array.from(urls);
    };

    const collectArchiveUrls = (root) => {
        return queryAll('a[href]', root).reduce((urls, link) => {
            try {
                const url = new URL(link.getAttribute('href'), location.origin);

                if (url.origin === location.origin && archivePathPattern.test(url.pathname)) {
                    urls.add(url.pathname);
                }
            } catch (error) {
                // Ignore malformed hrefs from third-party widgets.
            }

            return urls;
        }, new Set());
    };

    const loadAllPostUrls = async () => {
        const urls = new Set(collectPostUrls(document));
        const archiveQueue = ['/archives/'];
        const visitedArchives = new Set();

        while (archiveQueue.length && visitedArchives.size < 100) {
            const archivePath = archiveQueue.shift();

            if (visitedArchives.has(archivePath)) {
                continue;
            }

            visitedArchives.add(archivePath);

            try {
                const response = await fetch(archivePath, { credentials: 'same-origin' });

                if (!response.ok) {
                    continue;
                }

                const html = await response.text();
                const archiveDoc = new DOMParser().parseFromString(html, 'text/html');
                collectPostUrls(archiveDoc).forEach(url => urls.add(url));
                collectArchiveUrls(archiveDoc).forEach(path => {
                    if (!visitedArchives.has(path)) {
                        archiveQueue.push(path);
                    }
                });
            } catch (error) {
                console.debug('Archive page could not be read:', archivePath, error);
            }
        }

        return Array.from(urls);
    };

    const getAllPostUrls = () => {
        if (!postUrlCache) {
            postUrlCache = loadAllPostUrls();
        }

        return postUrlCache;
    };

    const navigateTo = (url) => {
        const parsed = new URL(url, location.origin);

        if (parsed.origin === location.origin && window.pjax) {
            window.pjax.loadUrl(`${parsed.pathname}${parsed.search}${parsed.hash}`);
            return;
        }

        window.location.href = parsed.href;
    };

    const setGroupVisible = (id, visible) => {
        const group = document.getElementById(id);

        if (group) {
            group.style.display = visible ? 'block' : 'none';
        }
    };

    const hideDynamicGroups = () => {
        queryAll('.rightMenu-group.hide').forEach(group => {
            group.style.display = 'none';
        });
    };

    const hideMask = () => {
        const mask = query('.rmMask');

        if (mask) {
            mask.style.display = 'none';
        }
    };

    const ensureMask = () => {
        let mask = query('.rmMask');

        if (mask) {
            return mask;
        }

        mask = document.createElement('div');
        mask.className = 'rmMask';
        document.body.appendChild(mask);
        mask.addEventListener('click', hideMask);
        return mask;
    };

    const createRightMenuMarkup = () => {
        return `
<div id="rightMenu">
    <div class="rightMenu-group rightMenu-small">
        <button class="rightMenu-item" type="button" data-rmf-action="historyBack" title="后退" aria-label="后退"><i class="fa-solid fa-arrow-left"></i></button>
        <button class="rightMenu-item" type="button" data-rmf-action="historyForward" title="前进" aria-label="前进"><i class="fa-solid fa-arrow-right"></i></button>
        <button class="rightMenu-item" type="button" data-rmf-action="reloadPage" title="刷新" aria-label="刷新"><i class="fa-solid fa-rotate-right"></i></button>
        <button class="rightMenu-item" type="button" data-rmf-action="scrollToTop" title="回到顶部" aria-label="回到顶部"><i class="fa-solid fa-arrow-up"></i></button>
    </div>
    <div class="rightMenu-group rightMenu-line hide" id="menu-text">
        <button class="rightMenu-item" type="button" data-rmf-action="copySelect"><i class="fa-solid fa-copy"></i><span>复制</span></button>
        <button class="rightMenu-item" type="button" data-rmf-action="searchSelect"><i class="fa-solid fa-magnifying-glass"></i><span>百度搜索</span></button>
    </div>
    <div class="rightMenu-group rightMenu-line hide" id="menu-too">
        <button class="rightMenu-item" type="button" data-rmf-action="openSelect"><i class="fa-solid fa-link"></i><span>转到链接</span></button>
    </div>
    <div class="rightMenu-group rightMenu-line hide" id="menu-paste">
        <button class="rightMenu-item" type="button" data-rmf-action="paste"><i class="fa-solid fa-paste"></i><span>粘贴</span></button>
    </div>
    <div class="rightMenu-group rightMenu-line hide" id="menu-post">
        <a class="rightMenu-item" data-menu-comment href="#post-comment"><i class="fa-solid fa-comments"></i><span>空降评论</span></a>
        <button class="rightMenu-item" type="button" data-rmf-action="copyWordsLink"><i class="fa-solid fa-link"></i><span>复制本文地址</span></button>
        <button class="rightMenu-item" type="button" data-rmf-action="switchReadMode"><i class="fa-solid fa-book-open"></i><span>阅读模式</span></button>
    </div>
    <div class="rightMenu-group rightMenu-line hide" id="menu-to">
        <button class="rightMenu-item" type="button" data-rmf-action="openWithNewTab"><i class="fa-solid fa-up-right-from-square"></i><span>新窗口打开</span></button>
        <button class="rightMenu-item" type="button" data-rmf-action="open"><i class="fa-solid fa-link"></i><span>转到链接</span></button>
        <button class="rightMenu-item" type="button" data-rmf-action="copyLink"><i class="fa-solid fa-copy"></i><span>复制链接</span></button>
    </div>
    <div class="rightMenu-group rightMenu-line hide" id="menu-img">
        <button class="rightMenu-item" type="button" data-rmf-action="saveAs"><i class="fa-solid fa-download"></i><span>保存图片</span></button>
        <button class="rightMenu-item" type="button" data-rmf-action="openWithNewTab"><i class="fa-solid fa-up-right-from-square"></i><span>在新窗口打开</span></button>
        <button class="rightMenu-item" type="button" data-rmf-action="copyLink"><i class="fa-solid fa-copy"></i><span>复制图片链接</span></button>
    </div>
    <div class="rightMenu-group rightMenu-line">
        <button class="rightMenu-item" type="button" data-rmf-action="randomPost"><i class="fa-solid fa-paper-plane"></i><span>随便逛逛</span></button>
        <button class="rightMenu-item" type="button" data-rmf-action="activateThemeMode"><i class="fa-solid fa-circle-half-stroke"></i><span>昼夜切换</span></button>
        <a class="rightMenu-item" href="/about/"><i class="fa-solid fa-circle-info"></i><span>关于博客</span></a>
        <button class="rightMenu-item" type="button" data-rmf-action="fullScreen"><i class="fa-solid fa-expand"></i><span>切换全屏</span></button>
        <button class="rightMenu-item" type="button" data-rmf-action="printPage"><i class="fa-solid fa-print"></i><span>打印页面</span></button>
    </div>
</div>`;
    };

    const ensureRightMenuMarkup = () => {
        if (!document.getElementById('rightMenu')) {
            document.body.insertAdjacentHTML('beforeend', createRightMenuMarkup());
        }

        const rightMenu = document.getElementById('rightMenu');

        if (rightMenu) {
            rightMenu.style.zIndex = 19198;

            queryAll('a[href]', rightMenu).forEach((link) => {
                link.setAttribute('data-no-instant', '');
            });
        }
    };

    const ensureRightsideCustomButtons = () => {
        const hidePanel = document.getElementById('rightside-config-hide');
        const showPanel = document.getElementById('rightside-config-show');

        if (hidePanel && !document.getElementById('mouse-mode-toggle')) {
            const mouseModeButton = document.createElement('button');
            mouseModeButton.id = 'mouse-mode-toggle';
            mouseModeButton.className = 'share';
            mouseModeButton.type = 'button';
            mouseModeButton.title = '右键模式';
            mouseModeButton.innerHTML = '<i class="fa-solid fa-arrow-pointer"></i>';
            mouseModeButton.addEventListener('click', changeMouseMode);
            hidePanel.appendChild(mouseModeButton);
        }

        if (showPanel && !document.getElementById('go-down')) {
            const goDownButton = document.createElement('button');
            goDownButton.id = 'go-down';
            goDownButton.type = 'button';
            goDownButton.title = '直达底部';
            goDownButton.innerHTML = '<i class="fa-solid fa-arrow-down"></i>';
            goDownButton.addEventListener('click', () => {
                if (window.btf) {
                    btf.scrollToDest(document.body.scrollHeight, 500);
                } else {
                    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                }
            });
            showPanel.appendChild(goDownButton);
        }
    };

    rmf.showRightMenu = (visible, top = 0, left = 0) => {
        const rightMenu = document.getElementById('rightMenu');

        if (!rightMenu) {
            return;
        }

        rightMenu.style.top = `${top}px`;
        rightMenu.style.left = `${left}px`;
        rightMenu.style.display = visible ? 'block' : 'none';
    };

    rmf.historyBack = () => window.history.back();
    rmf.historyForward = () => window.history.forward();
    rmf.reloadPage = () => window.location.reload();
    rmf.printPage = () => window.print();

    rmf.copyWordsLink = () => {
        const canonical = document.querySelector('link[rel="canonical"]');
        copyText(canonical ? canonical.href : normalizePostUrl(window.location.href));
    };

    rmf.switchReadMode = () => {
        const body = document.body;
        let exitButton = query('.exit-readmode');

        body.classList.add('read-mode');

        if (exitButton) {
            return;
        }

        exitButton = document.createElement('button');
        exitButton.type = 'button';
        exitButton.className = 'exit-readmode';
        exitButton.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i>';

        const exitReadMode = () => {
            body.classList.remove('read-mode');
            exitButton.remove();
            exitButton.removeEventListener('click', exitReadMode);
        };

        exitButton.addEventListener('click', exitReadMode);
        body.appendChild(exitButton);
    };

    rmf.randomPost = async () => {
        const urls = await getAllPostUrls();
        const currentUrl = normalizePostUrl(window.location.href);
        const candidates = urls.filter(url => url !== currentUrl);
        const pool = candidates.length ? candidates : urls;

        if (!pool.length) {
            navigateTo('/archives/');
            return;
        }

        navigateTo(pool[Math.floor(Math.random() * pool.length)]);
    };

    rmf.copySelect = () => {
        const text = window.getSelection().toString();

        if (text) {
            copyText(text);
            return;
        }

        showMessage('请先选中要复制的文字');
    };

    rmf.searchSelect = () => {
        const text = window.getSelection().toString().trim();

        if (text) {
            window.open(`https://www.baidu.com/s?wd=${encodeURIComponent(text)}`, '_blank', 'noopener');
        }
    };

    rmf.openSelect = () => {
        const text = window.getSelection().toString().trim();

        if (!text) {
            return;
        }

        const href = /^https?:\/\//i.test(text) ? text : `https://${text}`;
        window.open(href, '_blank', 'noopener');
    };

    rmf.scrollToTop = () => {
        if (window.btf) {
            btf.scrollToDest(0, 500);
            return;
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    rmf.activateThemeMode = () => {
        const darkmodeButton = document.getElementById('darkmode');

        if (darkmodeButton) {
            darkmodeButton.click();
            return;
        }

        const willChangeMode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        const themeColor = query('meta[name="theme-color"]');

        document.documentElement.setAttribute('data-theme', willChangeMode);

        if (themeColor) {
            themeColor.setAttribute('content', willChangeMode === 'dark' ? '#0d0d0d' : '#ffffff');
        }

        if (window.btf && btf.saveToLocal) {
            btf.saveToLocal.set('theme', willChangeMode, 2);
        }
    };

    rmf.fullScreen = async () => {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                await document.documentElement.requestFullscreen();
            }
        } catch (error) {
            showMessage('当前浏览器无法切换全屏模式');
        }
    };

    const handleLinkTarget = (link) => {
        rmf.open = () => {
            const parsed = new URL(link.href, location.origin);

            if (parsed.origin === location.origin && window.pjax) {
                window.pjax.loadUrl(`${parsed.pathname}${parsed.search}${parsed.hash}`);
                return;
            }

            window.location.href = parsed.href;
        };

        rmf.openWithNewTab = () => {
            window.open(link.href, '_blank', 'noopener');
        };

        rmf.copyLink = () => {
            copyText(link.href);
        };
    };

    const handleImageTarget = (image) => {
        rmf.openWithNewTab = () => {
            window.open(image.currentSrc || image.src, '_blank', 'noopener');
        };

        rmf.copyLink = () => {
            copyText(image.currentSrc || image.src);
        };

        rmf.saveAs = async () => {
            const src = image.currentSrc || image.src;

            try {
                const response = await fetch(src, { mode: 'cors' });

                if (!response.ok) {
                    throw new Error(`Image request failed with ${response.status}`);
                }

                const blob = await response.blob();
                const objectUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                const pathName = new URL(src, location.origin).pathname;
                let filename = pathName.split('/').filter(Boolean).pop() || 'image';

                if (!filename.includes('.') && blob.type.startsWith('image/')) {
                    const extension = blob.type.split('/')[1].replace('jpeg', 'jpg');
                    filename = `${filename}.${extension}`;
                }

                link.href = objectUrl;
                link.download = filename;
                link.rel = 'noopener';
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
            } catch (error) {
                window.open(src, '_blank', 'noopener');
                showMessage('图片已在新窗口打开，可使用浏览器保存');
            }
        };
    };

    const handleInputTarget = (input) => {
        rmf.paste = async () => {
            try {
                const text = await navigator.clipboard.readText();

                if (typeof input.selectionStart === 'number') {
                    const start = input.selectionStart;
                    const end = input.selectionEnd;
                    const restoreTop = input.scrollTop;
                    input.value = input.value.slice(0, start) + text + input.value.slice(end);
                    input.selectionStart = start + text.length;
                    input.selectionEnd = start + text.length;
                    input.scrollTop = restoreTop;
                } else {
                    input.value += text;
                }

                input.focus();
                input.dispatchEvent(new Event('input', { bubbles: true }));
            } catch (error) {
                showMessage('请允许读取剪贴板！', 'top-center');
            }
        };
    };

    const handleContextMenu = (event) => {
        if (state.mouseMode === 'off') {
            return;
        }

        const target = getElement(event.target);
        const rightMenu = document.getElementById('rightMenu');

        if (!rightMenu || !target) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        hideDynamicGroups();

        const selection = window.getSelection().toString().trim();
        const selectedTextIsUrl = /^(?:https?:\/\/)?[\w.-]+(?:\.[\w.-]+)+[\w\-._~:/?#[\]@!$&'()*+,;=.]+$/i.test(selection);
        const link = target.closest('a');
        const image = target.closest('img');
        const input = target.closest('textarea,input');

        setGroupVisible('menu-text', Boolean(selection));
        setGroupVisible('menu-too', Boolean(selectedTextIsUrl && !link));
        setGroupVisible('menu-post', Boolean(document.getElementById('post') || document.getElementById('page')));

        const commentItem = query('[data-menu-comment]', rightMenu);
        if (commentItem) {
            commentItem.style.display = document.getElementById('post-comment') ? '' : 'none';
        }

        if (link) {
            setGroupVisible('menu-to', true);
            handleLinkTarget(link);
        } else if (image) {
            setGroupVisible('menu-img', true);
            handleImageTarget(image);
        } else if (input) {
            setGroupVisible('menu-paste', true);
            handleInputTarget(input);
        }

        rightMenu.style.display = 'block';

        const pageX = Math.max(8, Math.min(event.clientX + 10, window.innerWidth - rightMenu.offsetWidth - 8));
        const pageY = Math.max(8, Math.min(event.clientY, window.innerHeight - rightMenu.offsetHeight - 8));
        const mask = ensureMask();

        rmf.showRightMenu(true, pageY, pageX);
        mask.style.display = 'flex';
    };

    const bindRightMenuEvents = () => {
        if (state.bound) {
            return;
        }

        state.bound = true;

        document.addEventListener('click', (event) => {
            const actionButton = event.target.closest('#rightMenu [data-rmf-action]');

            if (actionButton) {
                const action = rmf[actionButton.dataset.rmfAction];

                if (typeof action === 'function') {
                    action();
                }
            }

            if (event.target.closest('#rightMenu .rightMenu-item')) {
                hideMask();
            }

            rmf.showRightMenu(false);
        });

        const handleResize = () => {
            rmf.showRightMenu(false);
            hideMask();
        };
        const resizeHandler = window.btf?.rafThrottle
            ? btf.rafThrottle(handleResize)
            : handleResize;

        window.addEventListener('resize', resizeHandler, { passive: true });

        if (supportsCustomContextMenu) {
            document.addEventListener('contextmenu', handleContextMenu);
        }
    };

    const initRightMenuUi = () => {
        ensureRightMenuMarkup();
        ensureRightsideCustomButtons();
        bindRightMenuEvents();
    };

    const changeMouseMode = () => {
        state.mouseMode = state.mouseMode === 'on' ? 'off' : 'on';
        writeStorage('mouse', state.mouseMode);

        const message = state.mouseMode === 'on'
            ? '当前鼠标右键已更换为网站指定样式！'
            : '当前鼠标右键已恢复为系统默认！';

        showMessage(message);
    };

    window.changeMouseMode = changeMouseMode;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRightMenuUi, { once: true });
    } else {
        initRightMenuUi();
    }

    if (window.btf?.addGlobalFn) {
        btf.addGlobalFn('pjaxComplete', initRightMenuUi, 'szoxidyRightMenu');
    } else {
        document.addEventListener('pjax:complete', initRightMenuUi);
    }
})();
