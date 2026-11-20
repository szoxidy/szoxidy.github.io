import { formatCommentDate, normalizeIsoDateString, parseUserAgentBadge } from '../lib/comment-shared.js?v=94b74f8636';
import { element, icon, notifyComment } from './config.js?v=3998dd6238';
import { enhanceArtalkAvatar } from './profile.js?v=a555dc6842';

const voteStates = new WeakMap();

function markAction(node, caption) {
    node.classList.add('blog-artalk-action');
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', caption);
    node.tabIndex = 0;
}

function enhanceVoteControl(comment, ctx, signal) {
    const data = comment.getData();
    const vote = comment.getRender().voteBtnUp;
    if (!vote) return;

    let state = voteStates.get(comment);
    if (!state) {
        state = { revision: 0 };
        voteStates.set(comment, state);
        const options = comment.getOpts();
        const getApi = options.getApi;
        // Native fetch attaches Guest proof to comments, but not votes.
        // Only this private comment's fixed vote routes need it. Read the
        // current proof each time, and retain native JWT authentication.
        const voteHeaders = () => {
            const user = ctx.getUser();
            const proof = data.blog_private === true && !user.getData().token
                && user.getGuestToken?.(ctx.getConf().server, false);
            return proof ? { 'X-Artalk-Guest': proof } : {};
        };
        // The blog backend reports is_up with both GET and POST. Use that
        // response, never infer a visitor's choice from the public count.
        getApi().request({ path: `/votes/comment/${data.id}`, method: 'GET', format: 'json', headers: voteHeaders(), signal })
            .then(response => {
                if (state.revision || signal.aborted) return;
                state.isUp = response.data.is_up;
                const current = comment.getRender().voteBtnUp?.$el;
                if (current?.isConnected && typeof state.isUp === 'boolean') current.setAttribute('aria-pressed', String(state.isUp));
            })
            .catch(error => {
                if (state.revision || signal.aborted) return;
                state.error = error;
                const current = comment.getRender().voteBtnUp?.$el;
                if (current) current.dataset.commentTooltip = '点赞状态加载失败，点击后重试';
            });
        options.getApi = () => {
            const native = getApi();
            const api = Object.create(native);
            api.votes = { ...native.votes };
            api.votes.createVote = async (target, id, choice, value, params = {}) => {
                state.revision++;
                const active = comment.getRender().voteBtnUp;
                active.isLoading = true;
                active.$el.setAttribute('aria-busy', 'true');
                try {
                    const response = await native.votes.createVote(
                        target,
                        id,
                        choice,
                        value,
                        { ...params, headers: { ...params.headers, ...voteHeaders() }, signal }
                    );
                    state.isUp = response.data.is_up;
                    if (typeof state.isUp === 'boolean') active.$el.setAttribute('aria-pressed', String(state.isUp));
                    delete active.$el.dataset.commentTooltip;
                    return response;
                } catch (error) {
                    state.error = error;
                    throw error;
                } finally {
                    active.isLoading = false;
                    active.$el.setAttribute('aria-busy', 'false');
                }
            };
            return api;
        };
    }

    vote.$el.classList.add('blog-artalk-vote');
    if (typeof state.isUp === 'boolean') vote.$el.setAttribute('aria-pressed', String(state.isUp));
    vote.setError = message => notifyComment('点赞失败', state.error?.message || message, 'error');
    vote.updateText(() => {
        const count = String(comment.getData().vote_up || 0);
        markAction(vote.$el, `点赞 ${count}`);
        return count;
    });
}

export function decorateArtalkComment(comment, ctx, signal) {
    const data = comment.getData();
    // Native CommentNode replaces '-' with '/' even in RFC3339 timestamps.
    // Restore only that ISO form so the date and its full tooltip keep the zone.
    data.date = normalizeIsoDateString(data.date);
    const render = comment.getRender();

    enhanceVoteControl(comment, ctx, signal);

    const voteEl = render.voteBtnUp?.$el;
    const reply = [...render.$el.querySelectorAll(':scope > .atk-comment > .atk-main > .atk-footer > .atk-actions > .atk-common-action-btn')]
        .find(node => node !== voteEl && !node.hasAttribute('atk-only-admin-show'));
    if (reply) {
        reply.classList.add('blog-artalk-reply');
        markAction(reply, '回复评论');
    }

    const date = render.$el.querySelector(':scope > .atk-comment > .atk-main > .atk-header > .atk-date');
    if (date) {
        const formatted = formatCommentDate(data.date);
        if (formatted) {
            date.textContent = formatted.shortDate;
            date.dataset.fullDate = formatted.fullDate;
            date.dataset.commentTooltip = formatted.fullDate;
            date.tabIndex = 0;
        }
    }

    for (const badge of render.$el.querySelectorAll(':scope > .atk-comment > .atk-main > .atk-header > .atk-ua-wrap > .atk-ua')) {
        const parsed = parseUserAgentBadge(badge.textContent, {
            rawUa: data.ua || '',
            isBrowser: badge.classList.contains('ua-browser')
        });
        badge.dataset.agent = parsed.brand;
        badge.title = parsed.title;
        badge.dataset.commentTooltip = parsed.title;
        if (parsed.brand) badge.textContent = parsed.label;
    }

    if (data.blog_deleted === true) {
        render.$content.textContent = '评论已由作者删除。';
        render.$content.classList.add('blog-artalk-deleted');
    } else if (data.blog_markdown === false) {
        render.$content.textContent = data.content;
        render.$content.classList.add('blog-artalk-plain');
    }

    const replyTo = comment.getOpts().replyTo;
    if ((replyTo?.blog_deleted === true || replyTo?.blog_markdown === false) && render.$replyTo) {
        const quoted = render.$replyTo.querySelector('.atk-content');
        quoted.textContent = replyTo.blog_deleted === true ? '评论已由作者删除。' : replyTo.content;
        quoted.classList.add('blog-artalk-plain');
    }

    enhanceArtalkAvatar(render.$el.querySelector('.atk-avatar img'), data);

    if (data.blog_private === true) {
        const badge = element('span', 'blog-artalk-private-badge', '悄悄话');
        badge.prepend(icon('lock'));
        badge.title = '评论仅发送者和博主可见';
        render.$el.querySelector('.atk-header').append(badge);
    }

    const target = render.$replyAt || render.$replyTo;
    const link = target?.querySelector('.atk-nick');
    if (link) {
        link.tabIndex = 0;
        link.setAttribute('role', 'button');
        link.dataset.blogReplyTarget = String(data.rid);
        if (render.$replyAt) render.$replyAt.dataset.blogReplyTarget = String(data.rid);
    }
}
