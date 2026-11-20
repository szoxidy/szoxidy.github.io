// Write text to the clipboard while suppressing the global article copy toast
// during the fallback execCommand('copy') path.
export async function writeClipboardText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch {
            // Fall through to the textarea-based compatibility path.
        }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();

    const silenceCopyNotice = event => event.stopImmediatePropagation();
    document.addEventListener('copy', silenceCopyNotice, true);
    let copied = false;

    try {
        copied = document.execCommand('copy');
    } finally {
        document.removeEventListener('copy', silenceCopyNotice, true);
        textarea.remove();
    }

    if (!copied) {
        throw new Error('Copy command failed');
    }
}
