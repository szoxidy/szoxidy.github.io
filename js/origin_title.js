(() => {
    let pageTitle = document.title;
    let titleTimer = null;

    const rememberPageTitle = () => {
        pageTitle = document.title;
    };

    document.addEventListener('visibilitychange', () => {
        window.clearTimeout(titleTimer);

        if (document.hidden) {
            rememberPageTitle();
            document.title = '👀跑哪里去了~';
            return;
        }

        document.title = '🐖抓到你啦～';
        titleTimer = window.setTimeout(() => {
            document.title = pageTitle;
        }, 2000);
    });

    if (window.btf?.addGlobalFn) {
        btf.addGlobalFn('pjaxComplete', rememberPageTitle, 'szoxidyOriginTitle');
    } else {
        document.addEventListener('pjax:complete', rememberPageTitle);
    }
})();
