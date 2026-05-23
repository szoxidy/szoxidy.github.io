(() => {
    const fallbackId = 'comment-fallback-tip';
    const timeoutMs = 10000;

    const removeFallback = (container) => {
        const fallback = container.querySelector(`#${fallbackId}`);
        if (fallback) {
            fallback.remove();
        }
    };

    const hasRealCommentNode = (container) => {
        return Array.from(container.children).some(node => node.id !== fallbackId);
    };

    const showFallback = (container) => {
        if (hasRealCommentNode(container) || container.querySelector(`#${fallbackId}`)) {
            return;
        }

        const fallback = document.createElement('div');
        fallback.id = fallbackId;
        fallback.className = 'comment-fallback-tip';
        fallback.innerHTML = '评论服务加载超时。当前评论后端可能暂时不可达，你可以先通过 <a href="/about/">关于页</a> 或 <a href="mailto:szoxidy@gmail.com">邮件</a> 联系我。';
        container.appendChild(fallback);
    };

    const initCommentFallback = () => {
        const container = document.getElementById('twikoo-wrap');

        if (!container) {
            return;
        }

        removeFallback(container);

        if (hasRealCommentNode(container)) {
            return;
        }

        const observer = new MutationObserver(() => {
            if (hasRealCommentNode(container)) {
                removeFallback(container);
                observer.disconnect();
            }
        });

        observer.observe(container, { childList: true, subtree: true });

        window.setTimeout(() => {
            if (!hasRealCommentNode(container)) {
                showFallback(container);
            }
            observer.disconnect();
        }, timeoutMs);
    };

    document.addEventListener('DOMContentLoaded', initCommentFallback);
    document.addEventListener('pjax:complete', initCommentFallback);
})();
