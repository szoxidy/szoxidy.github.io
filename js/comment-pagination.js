export const PAGE_SIZE = 10;

export function pageNumbers(current, total) {
    const numbers = [...new Set([1, current - 1, current, current + 1, total])]
        .filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
    return numbers.flatMap((n, i) => i && n - numbers[i - 1] > 1 ? ['…', n] : [n]);
}

// Twikoo uses a cursor rather than page offsets. Load only the missing batches;
// keep native comment nodes so replies, moderation and likes keep working.
export async function ensurePage(target, read, loadMore) {
    let state = read();
    const first = state.ids[0];
    while (state.more && state.ids.length < Math.min(target * PAGE_SIZE, state.total)) {
        const previous = new Set(state.ids);
        await loadMore();
        state = read();
        if (first && state.ids[0] !== first) throw new Error('评论列表已刷新，请重新选择页码。');
        if (!state.ids.some(id => !previous.has(id))) throw new Error('评论加载失败，请重试。');
    }
    const pages = Math.ceil(state.ids.length / PAGE_SIZE);
    return Math.max(1, Math.min(target, pages || 1));
}
