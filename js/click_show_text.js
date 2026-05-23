(() => {
    const configScript = document.getElementById('click-show-text');
    const defaultStyle = {
        zIndex: '15',
        position: 'absolute',
        fontWeight: 'bold',
        cursor: 'default',
        pointerEvents: 'none',
        transition: 'top 3s ease-out, opacity 3s ease-out'
    };
    let textArray = [];
    let configuredStyle = null;
    let useRandomColor = true;

    const getRandomValue = (min, max) => {
        return Math.floor(Math.random() * (max - min + 1) + min);
    };

    const getRandomColor = () => {
        return `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
    };

    const readTextArray = () => {
        if (textArray.length) {
            return textArray;
        }

        const texts = configScript ? configScript.getAttribute('texts') || 'Hi,Ha' : 'Hi,Ha';
        const split = configScript ? configScript.getAttribute('split') || ',' : ',';
        textArray = texts.split(split).map(item => item.trim()).filter(Boolean);

        return textArray.length ? textArray : ['Hi'];
    };

    const readStyle = () => {
        if (configuredStyle) {
            return configuredStyle;
        }

        configuredStyle = { ...defaultStyle };
        const cssText = configScript ? configScript.getAttribute('css') || '' : '';

        cssText.split(';').forEach((declaration) => {
            const [property, value] = declaration.split(':').map(item => item && item.trim());

            if (property && value) {
                configuredStyle[property] = value;
            }
        });

        useRandomColor = configuredStyle.color === undefined;
        return configuredStyle;
    };

    const createClickText = (event) => {
        const words = readTextArray();
        const text = words[getRandomValue(0, words.length - 1)];
        const item = document.createElement('span');
        const style = readStyle();

        item.textContent = text;
        Object.assign(item.style, style);
        item.style.top = `${event.pageY - 20}px`;
        document.body.appendChild(item);
        item.style.left = `${event.pageX - item.offsetWidth / 2}px`;

        if (useRandomColor) {
            item.style.color = getRandomColor();
        }

        requestAnimationFrame(() => {
            item.style.top = `${event.pageY - 180}px`;
            item.style.opacity = '0';
        });

        window.setTimeout(() => {
            item.remove();
        }, 3000);
    };

    const initClickShowText = () => {
        document.body.removeEventListener('click', createClickText);
        document.body.addEventListener('click', createClickText);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initClickShowText, { once: true });
    } else {
        initClickShowText();
    }
})();
