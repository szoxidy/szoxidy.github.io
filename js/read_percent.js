(() => {
    let goUpButton = null;
    let icon = null;
    let percent = null;
    let ticking = false;
    let lastPercent = -1;
    let showingPercent = null;

    const resolveElements = () => {
        goUpButton = document.querySelector('#go-up');
        icon = goUpButton ? goUpButton.querySelector('i') : null;
        percent = goUpButton ? goUpButton.querySelector('.scroll-percent, #percent') : null;
        return !!(goUpButton && icon && percent);
    };

    const updateScrollPercent = () => {
        ticking = false;

        if (!resolveElements()) {
            return;
        }

        const top = document.documentElement.scrollTop || window.pageYOffset;
        const totalHeight = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
            document.body.offsetHeight,
            document.documentElement.offsetHeight,
            document.body.clientHeight,
            document.documentElement.clientHeight
        ) - document.documentElement.clientHeight;
        const result = totalHeight > 0 ? Math.round(top / totalHeight * 100) : 0;
        const shouldShowPercent = result <= 95;

        if (shouldShowPercent !== showingPercent) {
            icon.style.display = shouldShowPercent ? 'none' : 'block';
            percent.style.display = shouldShowPercent ? 'block' : 'none';
            showingPercent = shouldShowPercent;
        }

        if (shouldShowPercent && result !== lastPercent) {
            percent.textContent = result + '%';
            lastPercent = result;
        }
    };

    const requestUpdate = () => {
        if (ticking) {
            return;
        }

        ticking = true;
        window.requestAnimationFrame(updateScrollPercent);
    };

    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('load', requestUpdate, { passive: true });
    document.addEventListener('DOMContentLoaded', requestUpdate);
    document.addEventListener('pjax:complete', () => {
        goUpButton = null;
        icon = null;
        percent = null;
        lastPercent = -1;
        showingPercent = null;
        requestUpdate();
    });
})();
