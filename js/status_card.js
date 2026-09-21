(() => {
    'use strict';

    const dayLength = 86_400_000;
    const visibleDays = 15;
    let activeCard = null;
    let snapshot = null;
    let loading = null;

    const isCount = value => Number.isSafeInteger(value) && value >= 0;
    const percentage = (up, down) => {
        if (!isCount(up) || !isCount(down)) throw new Error('Invalid check counts');
        return up + down > 0 ? up / (up + down) : null;
    };
    const formatUptime = value => {
        if (value === null) return '暂无数据';
        const hundredths = Math.floor((value + Number.EPSILON) * 10_000);
        return `${(Math.min(hundredths, value < 1 ? 9_999 : 10_000) / 100).toFixed(2)}%`;
    };
    function dateTimestamp(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
        const timestamp = Date.parse(`${value}T00:00:00Z`);
        return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : NaN;
    }

    function selectBlog(config, daily) {
        const matches = (config.publicGroupList || []).flatMap(group => group.monitorList || [])
            .filter(monitor => monitor.name === 'Blog');
        if (matches.length !== 1 || !Number.isSafeInteger(matches[0].id) || matches[0].id <= 0) throw new Error('Invalid Blog monitor');
        const histories = Array.isArray(daily.monitors) ? daily.monitors.filter(item => item.id === matches[0].id) : [];
        if (daily.ok !== true || daily.range?.days !== 30 || histories.length !== 1) throw new Error('Missing daily history');
        const start = dateTimestamp(daily.range.from);
        const end = dateTimestamp(daily.range.to);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end - start !== 29 * dayLength) throw new Error('Invalid history range');
        const today = Math.floor(Date.now() / dayLength) * dayLength;
        if (Math.abs(end - today) > dayLength) throw new Error('History is stale');
        const history = histories[0];
        if (!Array.isArray(history.days)) throw new Error('Invalid daily records');
        const records = new Map();
        for (const record of history.days) {
            const timestamp = dateTimestamp(record.date);
            if (!Number.isFinite(timestamp) || timestamp < start || timestamp > end || records.has(record.date)) throw new Error('Invalid record date');
            records.set(record.date, { ...record, ratio: percentage(record.up, record.down) });
        }
        const totalUp = history.days.reduce((sum, record) => sum + record.up, 0);
        const totalDown = history.days.reduce((sum, record) => sum + record.down, 0);
        if (totalUp !== history.totalUp || totalDown !== history.totalDown) throw new Error('Incomplete daily totals');

        // Upstream supports 30/60/90 days. Both bars and percentage use only
        // the last 15 calendar days, including gaps without measurements.
        let up = 0;
        let down = 0;
        const days = Array.from({ length: visibleDays }, (_, index) => {
            const date = new Date(end - (visibleDays - 1 - index) * dayLength).toISOString().slice(0, 10);
            const record = records.get(date);
            up += record?.up ?? 0;
            down += record?.down ?? 0;
            return { date, ratio: record?.ratio ?? null };
        });
        return { uptime: percentage(up, down), days };
    }

    function render(card, data, animate = false) {
        if (data.error) {
            card.querySelector('[data-status-uptime]').textContent = '—';
            card.querySelector('[data-status-history]').hidden = true;
            card.querySelector('[data-status-dates]').hidden = true;
            card.querySelector('[data-status-updated]').textContent = '重试';
            card.querySelector('[data-status-refresh]').title = '暂时无法获取，点击重试';
            return;
        }
        const uptime = card.querySelector('[data-status-uptime]');
        uptime.textContent = formatUptime(data.uptime);
        uptime.title = '最近 15 天按实际检测次数统计；无数据日期不计入可用率';
        const history = card.querySelector('[data-status-history]');
        const fragment = document.createDocumentFragment();
        for (const [index, day] of data.days.entries()) {
            const bar = document.createElement('span');
            bar.className = animate ? 'blog-status__day blog-status__day--reveal' : 'blog-status__day';
            if (animate) bar.setAttribute('style', `--status-reveal-delay: ${index * 65}ms`);
            bar.dataset.state = day.ratio === null ? 'unknown' : day.ratio >= 0.9 ? 'up' : day.ratio > 0 ? 'degraded' : 'down';
            const label = `${day.date}（UTC）：${formatUptime(day.ratio)}`;
            bar.dataset.statusDate = day.date;
            bar.dataset.statusValue = formatUptime(day.ratio);
            bar.setAttribute('role', 'listitem');
            bar.setAttribute('aria-label', label);
            bar.tabIndex = 0;
            fragment.append(bar);
        }
        history.replaceChildren(fragment);
        history.hidden = false;
        card.querySelector('[data-status-start]').textContent = `${data.days[0].date.slice(5)} · UTC`;
        card.querySelector('[data-status-end]').textContent = data.days.at(-1).date.slice(5);
        card.querySelector('[data-status-dates]').hidden = false;
        card.querySelector('[data-status-updated]').textContent = '刷新';
        card.querySelector('[data-status-refresh]').title = '重新获取最近 15 天的状态数据';
    }

    async function load(api, animate) {
        const requestedCard = activeCard;
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 12_000);
        try {
            const page = new URL(window.location.href);
            const local = ['localhost', '127.0.0.1', '[::1]'].includes(page.hostname);
            const base = new URL(local ? '/__blog-status/' : api, page);
            const data = await Promise.all(['config', 'daily?days=30'].map(async path => {
                const response = await fetch(new URL(path, base), {
                    signal: controller.signal, credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' },
                });
                if (!response.ok) throw new Error(`Status API returned ${response.status}`);
                return response.json();
            }));
            snapshot = selectBlog(...data);
        } catch (_) {
            controller.abort();
            snapshot = { error: true };
        } finally {
            window.clearTimeout(timeout);
        }
        if (activeCard?.isConnected) render(activeCard, snapshot, animate && activeCard === requestedCard);
    }

    function setRefreshing(card, busy) {
        const button = card.querySelector('[data-status-refresh]');
        button.disabled = busy;
        button.setAttribute('aria-busy', String(busy));
        card.querySelector('[data-status-updated]').textContent = busy ? '刷新中' : snapshot?.error ? '重试' : '刷新';
    }

    function refresh(animate = false) {
        if (loading || !activeCard?.isConnected) return;
        setRefreshing(activeCard, true);
        loading = load(activeCard.dataset.statusApi, animate).finally(() => {
            loading = null;
            if (activeCard?.isConnected) setRefreshing(activeCard, false);
        });
    }

    function init() {
        const card = document.querySelector('#blog-status-card');
        if (!card || card === activeCard) return;
        activeCard = card;
        if (snapshot) render(card, snapshot);
        else refresh();
        setRefreshing(card, Boolean(loading));
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
    // Reuse the snapshot after PJAX. Tab switching and elapsed time do not
    // clear, redraw or reload it. A full reload starts a new snapshot.
    document.addEventListener('pjax:complete', init);
    document.addEventListener('click', event => {
        const button = event.target.closest?.('[data-status-refresh]');
        if (button && button === activeCard?.querySelector('[data-status-refresh]')) refresh(true);
    });
})();
