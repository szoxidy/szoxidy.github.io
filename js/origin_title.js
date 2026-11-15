(() => {
    let pageTitle = document.title;
    let titleTimer = null;
    let showingGreeting = false;

    const rememberPageTitle = () => {
        window.clearTimeout(titleTimer);
        titleTimer = null;
        pageTitle = document.title;
        showingGreeting = false;
    };

    document.addEventListener('visibilitychange', () => {
        window.clearTimeout(titleTimer);

        if (document.hidden) {
            if (!showingGreeting) pageTitle = document.title;
            showingGreeting = true;
            document.title = '👀跑哪里去了~';
            return;
        }

        showingGreeting = true;
        document.title = '🐖抓到你啦～';
        titleTimer = window.setTimeout(() => {
            document.title = pageTitle;
            titleTimer = null;
            showingGreeting = false;
        }, 2000);
    });

    if (window.btf?.addGlobalFn) {
        btf.addGlobalFn('pjaxComplete', rememberPageTitle, 'szoxidyOriginTitle');
    } else {
        document.addEventListener('pjax:complete', rememberPageTitle);
    }
})();
