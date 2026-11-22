import { blogArtalkJSON, bridgeArtalkEditorApi, formatCommentError } from './artalk/api.js?v=4fc545aa71';
import { decorateArtalkComment } from './artalk/comment-node.js?v=b14a877567';
import { installArtalkComposer, validateArtalkForm } from './artalk/composer.js?v=1adbd7959b';
import {
    COMPATIBLE_API_VERSIONS,
    UPSTREAM_API_VERSION,
    artalkOptions,
    normalizeCompatApiVersion,
    notifyComment
} from './artalk/config.js?v=3998dd6238';
import { installArtalkPagination, installArtalkReplyPages } from './artalk/list-pagination.js?v=9fbd72995e';
import { completeArtalkUserAgent, enhanceArtalkAvatar } from './artalk/profile.js?v=a555dc6842';
import { installArtalkSelfDelete } from './artalk/self-delete.js?v=91ce8e6c33';

// Artalk 2.10.1 integration entrypoint. Keeps native submission/reply/data
// ownership while delegating domain concerns to focused modules under artalk/.
const installed = new WeakSet();

export function blogArtalkPlugin(ctx) {
    const root = ctx.getEl();
    const abort = new AbortController();
    const cleanups = [];
    const on = (target, name, fn, options) => {
        target.addEventListener(name, fn, options);
        cleanups.push(() => target.removeEventListener(name, fn, options));
    };
    const listen = (target, name, fn) => {
        target.on(name, fn);
        cleanups.push(() => target.off(name, fn));
    };
    let alive = true;
    const isAlive = () => alive;

    root.dataset.commentState = 'loading';
    const pagination = installArtalkPagination(ctx, listen, abort.signal);
    installArtalkReplyPages(ctx, root, on, listen);
    const selfDelete = installArtalkSelfDelete(ctx, root, on, listen, abort.signal, pagination.refresh);

    listen(ctx, 'created', () => {
        ctx.updateConf({ editorTravel: false });
        const normalizedVersion = normalizeCompatApiVersion(ctx.getConf().apiVersion);
        if (normalizedVersion !== ctx.getConf().apiVersion) {
            ctx.updateConf({ apiVersion: normalizedVersion });
        }
        // LocalStorage restores the bottom draft during native plug mounting,
        // before composer setup runs. Route that notification at its source
        // too, including on PJAX remounts.
        const editor = ctx.inject('editor');
        const original = editor.showNotify;
        const forward = (message, type) => {
            if (alive) {
                notifyComment(
                    '评论提示',
                    message,
                    type === 'e' ? 'error' : type === 's' ? 'success' : type === 'w' ? 'warning' : 'info'
                );
            }
        };
        editor.showNotify = forward;
        cleanups.push(() => { if (editor.showNotify === forward) editor.showNotify = original; });
    });

    listen(ctx, 'comment-rendered', comment => decorateArtalkComment(comment, ctx, abort.signal));
    listen(ctx, 'list-loaded', () => { root.dataset.commentState = 'ready'; });
    listen(ctx, 'list-failed', () => { root.dataset.commentState = 'error'; });
    listen(ctx, 'unmounted', () => {
        alive = false;
        abort.abort();
        cleanups.splice(0).forEach(cleanup => cleanup());
    });

    listen(ctx, 'mounted', () => {
        installArtalkComposer(ctx, {
            root,
            on,
            listen,
            cleanups,
            signal: abort.signal,
            isAlive,
            selfDelete
        });
    });
}

export function installArtalkUI(Artalk) {
    if (installed.has(Artalk)) return;
    installed.add(Artalk);
    Artalk.use(blogArtalkPlugin);
}

// Preserve public helpers and version contract exports for integrations and tests.
export {
    COMPATIBLE_API_VERSIONS,
    UPSTREAM_API_VERSION,
    artalkOptions,
    blogArtalkJSON,
    bridgeArtalkEditorApi,
    completeArtalkUserAgent,
    enhanceArtalkAvatar,
    formatCommentError,
    validateArtalkForm
};
