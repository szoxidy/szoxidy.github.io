import { blogArtalkJSON, formatCommentError } from './api.js?v=4fc545aa71';
import { button, element, notifyComment } from './config.js?v=3998dd6238';

// Guest self-deletion state machine: checks server ownership with native guest
// proof, confirms via an accessible alertdialog and reloads on tombstone reply.
export function installArtalkSelfDelete(ctx, root, on, listen, signal, refreshList) {
    let enabled = false;
    let owned = new Set();
    let ownedProof;
    let pendingRead;
    let readAgain = false;
    let dialog;
    const deleting = new Set();

    const proof = () => ctx.getUser().getGuestToken?.(ctx.getConf().server, false);

    const closeDialog = (restoreFocus = true) => {
        if (!dialog) return;
        const previous = dialog;
        dialog = null;
        previous.panel.remove();
        if (restoreFocus && previous.control.isConnected) previous.control.focus({ preventScroll: true });
    };

    const syncComment = comment => {
        const data = comment.getData();
        const actions = comment.getRender().$actions;
        let control = actions.querySelector('.blog-artalk-delete');
        if (!enabled || !ownedProof || proof() !== ownedProof || !owned.has(data.id) || data.blog_deleted === true) {
            control?.remove();
            return;
        }
        if (!control) {
            control = button('blog-artalk-delete', '删除');
            control.setAttribute('aria-label', '删除评论');
            control.dataset.commentId = String(data.id);
            actions.append(control);
        }
        control.disabled = deleting.has(data.id);
    };

    const sync = () => ctx.getCommentNodes().forEach(syncComment);

    const refreshOwned = () => {
        const token = enabled && proof();
        if (!token || signal.aborted) { owned.clear(); ownedProof = undefined; sync(); return; }
        if (pendingRead) { readAgain = true; return pendingRead; }
        const conf = ctx.getConf();
        pendingRead = (async () => {
            try {
                const result = await blogArtalkJSON(
                    conf.server,
                    'comments/owned',
                    { site_name: conf.site, page_key: conf.pageKey },
                    signal,
                    { headers: { 'X-Artalk-Guest': token } }
                );
                if (signal.aborted || !enabled || proof() !== token) return;
                if (!Array.isArray(result.ids)) throw new Error('暂时无法获取评论操作状态，请稍后重试。');
                owned = new Set(result.ids);
                ownedProof = token;
            } catch (error) {
                if (signal.aborted) return;
                owned.clear();
                ownedProof = undefined;
                notifyComment('提示', formatCommentError(error, '暂时无法获取评论操作状态，请稍后重试。'), 'error');
            } finally {
                pendingRead = null;
                if (!signal.aborted) {
                    sync();
                    if (readAgain) { readAgain = false; refreshOwned(); }
                }
            }
        })();
        return pendingRead;
    };

    on(root, 'click', event => {
        const control = event.target.closest?.('.blog-artalk-delete');
        if (!control || control.disabled || signal.aborted) return;
        if (dialog?.busy) return;
        closeDialog(false);
        const id = Number(control.dataset.commentId);
        const token = proof();
        if (!enabled || !token || token !== ownedProof || !owned.has(id)) return;
        const panel = element('div', 'blog-artalk-delete-confirm');
        panel.setAttribute('role', 'alertdialog');
        const caption = element('p', '', '确定删除这条评论？已有回复会保留。');
        caption.id = `blog-artalk-delete-${crypto.randomUUID()}`;
        panel.setAttribute('aria-labelledby', caption.id);
        const cancel = button('blog-artalk-delete-cancel', '取消');
        cancel.setAttribute('aria-label', '取消删除');
        const confirm = button('blog-artalk-delete-submit', '确认删除');
        confirm.setAttribute('aria-label', '确认删除');
        panel.append(caption, cancel, confirm);
        control.closest('.atk-footer').after(panel);
        dialog = { panel, control, busy: false };
        const current = dialog;
        cancel.onclick = () => closeDialog();
        confirm.onclick = async () => {
            if (current.busy || signal.aborted || dialog !== current) return;
            current.busy = true;
            deleting.add(id);
            control.disabled = cancel.disabled = confirm.disabled = true;
            panel.setAttribute('aria-busy', 'true');
            try {
                const conf = ctx.getConf();
                const result = await blogArtalkJSON(
                    conf.server,
                    `comments/${id}`,
                    { site_name: conf.site, page_key: conf.pageKey },
                    signal,
                    { method: 'DELETE', headers: { 'X-Artalk-Guest': token } }
                );
                if (signal.aborted) return;
                if (result.comment?.id !== id || result.comment.blog_deleted !== true) {
                    throw new Error('删除失败，请刷新页面确认。');
                }
                owned.delete(id);
                closeDialog(false);
                sync();
                await refreshList();
                if (!signal.aborted) notifyComment('删除成功', '评论已由作者删除。', 'success');
            } catch (error) {
                if (!signal.aborted) notifyComment('删除失败', formatCommentError(error, '删除失败，请重试。'), 'error');
            } finally {
                deleting.delete(id);
                current.busy = false;
                control.disabled = cancel.disabled = confirm.disabled = false;
                panel.setAttribute('aria-busy', 'false');
            }
        };
        cancel.focus({ preventScroll: true });
    });

    on(root, 'keydown', event => {
        if (event.key === 'Escape' && dialog && !dialog.busy) {
            event.preventDefault();
            closeDialog();
        }
    });

    listen(ctx, 'comment-rendered', syncComment);
    listen(ctx, 'list-loaded', refreshOwned);
    listen(ctx, 'editor-submitted', refreshOwned);
    listen(ctx, 'unmounted', () => closeDialog(false));

    return {
        enable(value) {
            enabled = value;
            return refreshOwned();
        }
    };
}
