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
        notification.addEventListener('transitionend', remove, { once: true });
        window.setTimeout(remove, 250);
    };

    window.siteNotify = ({
        title,
        message,
        type = 'info',
        duration = 5000,
        key = ''
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

        notification.append(icon, content, closeButton);
        ensureContainer().appendChild(notification);

        if (key) {
            activeNotifications.set(key, notification);
        }

        requestAnimationFrame(() => notification.classList.add('is-visible'));

        if (duration > 0) {
            notification.dismissTimer = window.setTimeout(
                () => removeNotification(notification),
                duration
            );
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

    window.addEventListener('keydown', (event) => {
        if (event.key === 'F12' || (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'i')) {
            window.siteNotify({
                title: '👀 你已被发现',
                message: '小伙子，扒源记住要遵循 GPL 协议！',
                type: 'warning',
                key: 'developer-tools'
            });
        }
    });
})();
