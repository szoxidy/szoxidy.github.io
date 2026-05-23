(() => {
    const isMobile = /(phone|pad|pod|iPhone|iPod|ios|iPad|Android|Mobile|BlackBerry|IEMobile|MQQBrowser|JUC|Fennec|wOSBrowser|BrowserNG|WebOS|Symbian|Windows Phone)/i.test(navigator.userAgent);
    const postPathPattern = /^\/\d{4}\/\d{2}\/\d{2}\/.+\/?$/;
    const state = {
        bound: false,
        mouseMode: localStorage.getItem('mouse') || 'on'
    };

    if (!localStorage.getItem('mouse')) {
        localStorage.setItem('mouse', state.mouseMode);
    }

    const rmf = {};
    window.rmf = rmf;

    const query = (selector, root = document) => root.querySelector(selector);
    const queryAll = (selector, root = document) => Array.from(root.querySelectorAll(selector));

    const getElement = (target) => {
        return target && target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
    };

    const showMessage = (text, position = 'top-left') => {
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
            await navigator.clipboard.writeText(text);
            if (window.copyNotify) {
                window.copyNotify();
            } else {
                showMessage('复制成功');
            }
            return;
        }

        const txa = document.createElement('textarea');
        txa.value = text;
        txa.setAttribute('readonly', '');
        txa.style.position = 'fixed';
        txa.style.opacity = '0';
        document.body.appendChild(txa);
        txa.select();
        document.execCommand('copy');
        txa.remove();
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

    const getAllPostUrls = async () => {
        const urls = new Set(collectPostUrls(document));

        try {
            const response = await fetch('/archives/', { credentials: 'same-origin' });

            if (response.ok) {
                const html = await response.text();
                const archiveDoc = new DOMParser().parseFromString(html, 'text/html');
                collectPostUrls(archiveDoc).forEach(url => urls.add(url));
            }
        } catch (error) {
            console.error(error);
        }

        return Array.from(urls);
    };

    const navigateTo = (url) => {
        const parsed = new URL(url, location.origin);

        if (parsed.origin === location.origin && window.pjax) {
            window.pjax.loadUrl(parsed.pathname);
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
        Object.assign(mask.style, {
            display: 'none',
            width: '100vw',
            height: '100vh',
            background: '#fff',
            opacity: '0',
            position: 'fixed',
            top: '0',
            left: '0',
            zIndex: 998
        });
        document.body.appendChild(mask);
        mask.addEventListener('click', hideMask);
        return mask;
    };

    const createRightMenuMarkup = () => {
        const isContentPage = document.getElementById('post') || document.getElementById('page');
        const readModeItem = isContentPage ? `
    <a class="rightMenu-item" href="javascript:rmf.switchReadMode()">
        <i class="fa-solid fa-book-open"></i>
        <span>阅读模式</span>
    </a>` : '';

        return `
<div id="rightMenu" class="js-pjax">
    <div class="rightMenu-group rightMenu-small">
        <a class="rightMenu-item" href="javascript:window.history.back();"><i class="fa-solid fa-arrow-left"></i></a>
        <a class="rightMenu-item" href="javascript:window.history.forward();"><i class="fa-solid fa-arrow-right"></i></a>
        <a class="rightMenu-item" href="javascript:window.location.reload();"><i class="fa-solid fa-rotate-right"></i></a>
        <a class="rightMenu-item" href="javascript:rmf.scrollToTop();"><span class="scroll-percent"></span><i class="fa-solid fa-arrow-up"></i></a>
    </div>
    <div class="rightMenu-group rightMenu-line hide" id="menu-text">
        <a class="rightMenu-item" href="javascript:rmf.copySelect();"><i class="fa-solid fa-copy"></i><span>复制</span></a>
        <a class="rightMenu-item" href="javascript:rmf.searchSelect();"><i class="fa-solid fa-magnifying-glass"></i><span>百度搜索</span></a>
    </div>
    <div class="rightMenu-group rightMenu-line hide" id="menu-too">
        <a class="rightMenu-item" href="javascript:rmf.openSelect();"><i class="fa-solid fa-link"></i><span>转到链接</span></a>
    </div>
    <div class="rightMenu-group rightMenu-line hide" id="menu-paste">
        <a class="rightMenu-item" href="javascript:rmf.paste()"><i class="fa-solid fa-paste"></i><span>粘贴</span></a>
    </div>
    <div class="rightMenu-group rightMenu-line hide" id="menu-post">
        <a class="rightMenu-item" href="#post-comment"><i class="fa-solid fa-comments"></i><span>空降评论</span></a>
        <a class="rightMenu-item" href="javascript:rmf.copyWordsLink()"><i class="fa-solid fa-link"></i><span>复制本文地址</span></a>
    </div>
    <div class="rightMenu-group rightMenu-line hide" id="menu-to">
        <a class="rightMenu-item" href="javascript:rmf.openWithNewTab()"><i class="fa-solid fa-up-right-from-square"></i><span>新窗口打开</span></a>
        <a class="rightMenu-item" href="javascript:rmf.open()"><i class="fa-solid fa-link"></i><span>转到链接</span></a>
        <a class="rightMenu-item" href="javascript:rmf.copyLink()"><i class="fa-solid fa-copy"></i><span>复制链接</span></a>
    </div>
    <div class="rightMenu-group rightMenu-line hide" id="menu-img">
        <a class="rightMenu-item" href="javascript:rmf.saveAs()"><i class="fa-solid fa-download"></i><span>保存图片</span></a>
        <a class="rightMenu-item" href="javascript:rmf.openWithNewTab()"><i class="fa-solid fa-up-right-from-square"></i><span>在新窗口打开</span></a>
        <a class="rightMenu-item" href="javascript:rmf.copyLink()"><i class="fa-solid fa-copy"></i><span>复制图片链接</span></a>
    </div>
    <div class="rightMenu-group rightMenu-line">
        <a class="rightMenu-item" href="javascript:rmf.randomPost()"><i class="fa-solid fa-paper-plane"></i><span>随便逛逛</span></a>
        <a class="rightMenu-item" href="javascript:rmf.activateThemeMode()"><i class="fa-solid fa-circle-half-stroke"></i><span>昼夜切换</span></a>${readModeItem}
        <a class="rightMenu-item" href="/about/"><i class="fa-solid fa-circle-info"></i><span>关于博客</span></a>
        <a class="rightMenu-item" href="javascript:rmf.fullScreen();"><i class="fa-solid fa-expand"></i><span>切换全屏</span></a>
        <a class="rightMenu-item" href="javascript:window.print();"><i class="fa-solid fa-print"></i><span>打印页面</span></a>
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
        }
    };

    const ensureRightsideCustomButtons = () => {
        const hidePanel = document.getElementById('rightside-config-hide');
        const showPanel = document.getElementById('rightside-config-show');

        if (hidePanel && !document.getElementById('mouse-mode-toggle')) {
            hidePanel.insertAdjacentHTML('beforeend', '<button id="mouse-mode-toggle" class="share" type="button" title="右键模式" onclick="changeMouseMode()"><i class="fa-solid fa-arrow-pointer"></i></button>');
        }

        if (showPanel && !document.getElementById('go-down')) {
            showPanel.insertAdjacentHTML('beforeend', '<button id="go-down" type="button" title="直达底部" onclick="btf.scrollToDest(document.body.scrollHeight, 500)"><i class="fa-solid fa-arrow-down"></i></button>');
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

    rmf.copyWordsLink = () => {
        copyText(window.location.href);
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
        exitButton.innerHTML = '<i class="fas fa-sign-out-alt"></i>';

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

        document.execCommand('copy', false, null);
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

    rmf.fullScreen = () => {
        if (document.fullscreenElement) {
            document.exitFullscreen();
            return;
        }

        document.documentElement.requestFullscreen();
    };

    const handleLinkTarget = (link) => {
        rmf.open = () => {
            const parsed = new URL(link.href, location.origin);

            if (parsed.origin === location.origin && window.pjax) {
                window.pjax.loadUrl(parsed.pathname);
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

        rmf.saveAs = () => {
            const src = image.currentSrc || image.src;
            const link = document.createElement('a');
            const filename = new URL(src, location.origin).pathname.split('/').filter(Boolean).pop() || 'image';

            link.href = src;
            link.download = filename;
            link.rel = 'noopener';
            link.click();
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
            if (event.target.closest('#rightMenu .rightMenu-item')) {
                hideMask();
            }

            rmf.showRightMenu(false);
        });

        window.addEventListener('resize', () => {
            rmf.showRightMenu(false);
            hideMask();
        }, { passive: true });

        if (!isMobile) {
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
        localStorage.setItem('mouse', state.mouseMode);

        const message = state.mouseMode === 'on'
            ? '当前鼠标右键已更换为网站指定样式！'
            : '当前鼠标右键已恢复为系统默认！';

        if (window.debounce) {
            debounce(() => showMessage(message), 300);
            return;
        }

        showMessage(message);
    };

    window.changeMouseMode = changeMouseMode;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRightMenuUi, { once: true });
    } else {
        initRightMenuUi();
    }

    document.addEventListener('pjax:complete', initRightMenuUi);
})();
