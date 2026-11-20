// Safe browser storage helpers that degrade cleanly when storage is unavailable.
export function readStorage(key, fallback = null) {
    try {
        const value = localStorage.getItem(key);
        return value == null ? fallback : value;
    } catch {
        return fallback;
    }
}

export function writeStorage(key, value) {
    try {
        localStorage.setItem(key, String(value));
        return true;
    } catch {
        return false;
    }
}

export function readBooleanPref(key, fallback = true) {
    const saved = readStorage(key, null);
    if (saved === 'true') return true;
    if (saved === 'false') return false;
    return fallback;
}

export function writeBooleanPref(key, checked) {
    return writeStorage(key, Boolean(checked));
}
