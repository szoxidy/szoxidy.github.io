(() => {
    let debounceTimer = null;

    window.debounce = (fn, time) => {
        if (debounceTimer !== null) {
            clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(fn, time);
    };

    const snackbarNotify = ({ title, message, type }) => {
        if (!window.Snackbar) {
            return false;
        }

        Snackbar.show({
            text: `${title} ${message}`,
            pos: 'top-left',
            showAction: false,
            duration: 5000,
            backgroundColor: type === 'warning' ? '#ff7a18' : '#49b1f5',
            textColor: '#fff'
        });
        return true;
    };

    const elementNotify = ({ title, message, type }) => {
        if (!window.Vue || !Vue.prototype || typeof Vue.prototype.$notify !== 'function') {
            return false;
        }

        Vue.prototype.$notify({
            title,
            message,
            type,
            position: 'top-left',
            offset: 64,
            duration: 5000,
            showClose: true
        });
        return true;
    };

    const notify = (options) => {
        if (elementNotify(options)) {
            return;
        }

        snackbarNotify(options);
    };

    window.copyNotify = () => {
        window.debounce(() => {
            notify({
                title: '哎嘿！复制成功',
                message: '若要转载最好保留原文链接哦。',
                type: 'success'
            });
        }, 300);
    };

    document.addEventListener('copy', () => {
        window.copyNotify();
    });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'F12' || (event.ctrlKey && event.shiftKey && event.key === 'I')) {
            window.debounce(() => {
                notify({
                    title: '👀 你已被发现',
                    message: '小伙子，扒源记住要遵循 GPL 协议！',
                    type: 'warning'
                });
            }, 300);
        }
    });
})();
