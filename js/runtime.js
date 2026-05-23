(() => {
    const voyagerStart = new Date("08/01/2022 00:00:00");
    const blogStart = new Date("11/16/2023 00:00:00");
    const intervalKey = "__szoxidyRuntimeInterval__";

    const pad = value => String(value).padStart(2, "0");

    const ensureWorkboard = () => {
        let workBoard = document.getElementById("workboard");
        if (workBoard) {
            return workBoard;
        }

        const footer = document.getElementById("footer-wrap") || document.getElementById("footer");
        if (!footer) {
            return null;
        }

        footer.insertAdjacentHTML("beforeend", '<div id="workboard"></div>');
        return document.getElementById("workboard");
    };

    const buildRuntimeHtml = () => {
        const now = new Date(Date.now() + 1000);
        const voyagerDistance = Math.trunc(234e8 + (now - voyagerStart) / 1e3 * 17);
        const voyagerUnit = (voyagerDistance / 1496e5).toFixed(6);

        const uptimeDays = (now - blogStart) / 1e3 / 60 / 60 / 24;
        const dayCount = Math.floor(uptimeDays);

        const uptimeHours = (now - blogStart) / 1e3 / 60 / 60 - 24 * dayCount;
        const hourCount = Math.floor(uptimeHours);

        const uptimeMinutes = (now - blogStart) / 1e3 / 60 - 1440 * dayCount - 60 * hourCount;
        const minuteCount = Math.floor(uptimeMinutes);

        const uptimeSeconds = (now - blogStart) / 1e3 - 86400 * dayCount - 3600 * hourCount - 60 * minuteCount;
        const secondCount = Math.round(uptimeSeconds);

        const isOpen = hourCount < 22 && hourCount >= 8;
        const badge = isOpen
            ? "https://img.shields.io/badge/本站点-营业中-6adea8?style=social&logo=php"
            : "https://img.shields.io/badge/本站点-打烊了-6adea8?style=social&logo=apache";
        const title = isOpen
            ? "距离百年老站也就差不到一百年~"
            : "这个点了应该去睡觉啦，熬夜对身体不好哦";

        return `<img alt="" class="boardsign" src="${badge}" title="${title}">
<br>
<div style="font-size:13px;font-weight:bold">本站居然运行了 ${dayCount} 天 ${pad(hourCount)} 小时 ${pad(minuteCount)} 分 ${pad(secondCount)} 秒
    <span class="fa-solid fa-heart-pulse" id="heartbeat"></span>
    <br> 旅行者 1 号当前距离地球 ${voyagerDistance} 千米，约为 ${voyagerUnit} 个天文单位 🚀
</div>`;
    };

    const renderRuntime = () => {
        const workBoard = ensureWorkboard();
        if (!workBoard) {
            return;
        }

        workBoard.innerHTML = buildRuntimeHtml();
    };

    const initRuntime = () => {
        renderRuntime();

        if (window[intervalKey]) {
            clearInterval(window[intervalKey]);
        }

        window[intervalKey] = setInterval(renderRuntime, 1000);
        document.removeEventListener("pjax:complete", renderRuntime);
        document.addEventListener("pjax:complete", renderRuntime);
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initRuntime, { once: true });
        return;
    }

    initRuntime();
})();
