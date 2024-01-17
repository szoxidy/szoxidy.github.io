function getElementAttribute(element, attr) {
    try {
        return $.trim(element.attr(attr));
    } catch (e) {
        return null;
    }
}

function getRandomValue(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

function getRandomColor() {
    return "#" + Math.floor(Math.random() * 16777215).toString(16);
}