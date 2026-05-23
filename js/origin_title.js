(() => {
    const originTitle = document.title;
    let titleTimer = null;

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            document.title = '👀跑哪里去了~';
            clearTimeout(titleTimer);
            return;
        }

        document.title = '🐖抓到你啦～';
        titleTimer = setTimeout(() => {
            document.title = originTitle;
        }, 2000);
    });
})();
