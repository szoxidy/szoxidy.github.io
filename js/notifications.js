(() => {
    const containerId = 'site-notifications';
    const activeNotifications = new Map();
    const iconClasses = {
        success: 'fa-solid fa-circle-check',
        warning: 'fa-solid fa-triangle-exclamation',
        error: 'fa-solid fa-circle-xmark',
        info: 'fa-solid fa-circle-info'
    };

    const ensureContainer = () => {
        let container = document.getElementById(containerId);

        if (!container) {
            container = document.createElement('div');
            container.id = containerId;
            container.className = 'site-notifications';
            container.setAttribute('aria-live', 'polite');
            container.setAttribute('aria-atomic', 'true');
            document.body.appendChild(container);
        }

        return container;
    };

    const removeNotification = (notification, immediate = false) => {
        if (!notification || notification.dataset.removing === 'true') {
            return;
        }

        notification.dataset.removing = 'true';
        window.clearTimeout(notification.dismissTimer);
        notification.progressAnimation?.cancel();

        const key = notification.dataset.notificationKey;
        if (key && activeNotifications.get(key) === notification) {
            activeNotifications.delete(key);
        }

        const remove = () => notification.remove();

        if (immediate) {
            remove();
            return;
        }

        notification.classList.remove('is-visible');
        notification.classList.add('is-leaving');
        notification.addEventListener('transitionend', event => {
            if (event.target === notification) remove();
        });
        window.setTimeout(remove, notification.dataset.variant === 'code' ? 380 : 250);
    };

    window.siteNotify = ({
        title,
        message,
        type = 'info',
        duration = 5000,
        key = '',
        variant = ''
    }) => {
        if (key && activeNotifications.has(key)) {
            removeNotification(activeNotifications.get(key), true);
        }

        const notification = document.createElement('section');
        const icon = document.createElement('i');
        const content = document.createElement('div');
        const heading = document.createElement('strong');
        const description = document.createElement('p');
        const closeButton = document.createElement('button');

        notification.className = `site-notification site-notification--${type}`;
        notification.setAttribute('role', type === 'error' ? 'alert' : 'status');
        notification.dataset.notificationKey = key;

        icon.className = `site-notification__icon ${iconClasses[type] || iconClasses.info}`;
        icon.setAttribute('aria-hidden', 'true');

        content.className = 'site-notification__content';
        heading.className = 'site-notification__title';
        heading.textContent = title;
        description.className = 'site-notification__message';
        description.textContent = message;
        content.append(heading, description);

        closeButton.type = 'button';
        closeButton.className = 'site-notification__close';
        closeButton.title = '关闭通知';
        closeButton.setAttribute('aria-label', '关闭通知');
        closeButton.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        closeButton.addEventListener('click', () => removeNotification(notification));

        const codeVariant = variant === 'code';
        if (codeVariant) {
            notification.className = `code-copy-toast ${type === 'error' ? 'is-error' : 'is-success'}`;
            notification.dataset.variant = 'code';
            icon.className = `fas ${type === 'error' ? 'fa-exclamation-triangle' : 'fa-check'} code-copy-toast__icon`;
            content.className = 'code-copy-toast__content';
            heading.className = '';
            closeButton.className = 'code-copy-toast__close';
            const detail = document.createElement('span');
            detail.textContent = message;
            content.replaceChildren(heading, detail);
        }
        notification.append(icon, content, closeButton);
        ensureContainer().appendChild(notification);

        if (key) {
            activeNotifications.set(key, notification);
        }

        requestAnimationFrame(() => notification.classList.add('is-visible'));

        if (duration > 0) {
            const progress = document.createElement('div');
            progress.className = codeVariant ? 'code-copy-toast__progress' : 'site-notification__progress';
            progress.setAttribute('aria-hidden', 'true');
            notification.append(progress);
            let remaining = duration;
            let started;
            let hovered = false;
            let focused = false;
            let paused = false;
            const resume = () => {
                if (notification.dataset.removing === 'true') return;
                started = performance.now();
                notification.dismissTimer = window.setTimeout(() => removeNotification(notification), remaining);
                notification.progressAnimation?.play();
            };
            notification.progressAnimation = progress.animate([
                { transform: 'scaleX(1)' },
                { transform: 'scaleX(0)' }
            ], {
                duration,
                easing: 'linear',
                fill: 'forwards'
            });
            const updatePause = () => {
                const next = hovered || focused;
                if (next === paused) return;
                paused = next;
                if (paused) {
                    remaining = Math.max(0, remaining - (performance.now() - started));
                    window.clearTimeout(notification.dismissTimer);
                    notification.progressAnimation.pause();
                } else {
                    resume();
                }
            };

            notification.addEventListener('pointerenter', () => {
                hovered = true;
                updatePause();
            });
            notification.addEventListener('pointerleave', () => {
                hovered = false;
                updatePause();
            });
            notification.addEventListener('focusin', () => {
                focused = true;
                updatePause();
            });
            notification.addEventListener('focusout', event => {
                focused = notification.contains(event.relatedTarget);
                updatePause();
            });
            resume();
        }

        return () => removeNotification(notification);
    };

    window.copyNotify = () => {
        window.siteNotify({
            title: '哎嘿！复制成功',
            message: '若要转载最好保留原文链接哦。',
            type: 'success',
            key: 'copy'
        });
    };

    document.addEventListener('copy', window.copyNotify);

    const showBadgeInfo = event => {
        const badge = event.target.closest?.('#footer .github-badge[data-title]');
        if (!badge || badge.contains(event.relatedTarget)) return;
        window.siteNotify({
            title: '关于本站',
            message: badge.dataset.title,
            type: 'info',
            duration: 3500,
            key: 'footer-badge'
        });
    };
    document.addEventListener('pointerover', showBadgeInfo);
    document.addEventListener('focusin', showBadgeInfo);

    window.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();
        const inspectShortcut = (event.ctrlKey || event.metaKey) && event.shiftKey && ['i', 'j', 'c'].includes(key);
        if (!event.repeat && (key === 'f12' || inspectShortcut)) {
            window.siteNotify({
                title: '👀 你已被发现',
                message: '小伙子，扒源记住要遵循 GPL 协议！',
                type: 'warning',
                key: 'developer-tools'
            });
        }
    });
})();
