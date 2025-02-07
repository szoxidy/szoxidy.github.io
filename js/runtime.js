document.addEventListener("DOMContentLoaded", function () {
    setInterval(() => {

        const now = new Date();
        now.setTime(now.getTime() + 1e3);

        const start = new Date("08/01/2022 00:00:00");
        const dis = Math.trunc(234e8 + (now - start) / 1e3 * 17);
        const unit = (dis / 1496e5).toFixed(6);

        const grt = new Date("11/16/2023 00:00:00");
        const days = (now - grt) / 1e3 / 60 / 60 / 24;
        const dnum = Math.floor(days);

        const hours = (now - grt) / 1e3 / 60 / 60 - 24 * dnum;
        const hnum = Math.floor(hours);
        const formattedS = String(hnum).padStart(2, '0');

        const minutes = (now - grt) / 1e3 / 60 - 1440 * dnum - 60 * hnum;
        const mnum = Math.floor(minutes);
        const formattedL = String(mnum).padStart(2, '0');

        const seconds = (now - grt) / 1e3 - 86400 * dnum - 3600 * hnum - 60 * mnum;
        const snum = Math.round(seconds);
        const formattedB = String(snum).padStart(2, '0');

        let currentTimeHtml = "";
        if (hnum < 22 && hnum >= 8) {
            currentTimeHtml = `<img alt="" class='boardsign' src='https://img.shields.io/badge/本站点-营业中-6adea8?style=social&logo=php' title='距离百年老站也就差不到一百年~'>
                                <br> 
                                <div style="font-size:13px;font-weight:bold">本站居然运行了 ${dnum} 天 ${formattedS} 小时 ${formattedL} 分 ${formattedB} 秒 
                                    <span class='fas fa-heartbeat' id="heartbeat"></span> 
                                    <br> 旅行者 1 号当前距离地球 ${dis} 千米，约为 ${unit} 个天文单位 🚀
                                </div>`;
        } else {
            currentTimeHtml = `<img alt="" class='boardsign' src='https://img.shields.io/badge/本站点-打烊了-6adea8?style=social&logo=apache' title='这个点了应该去睡觉啦，熬夜对身体不好哦'>
                               <br> 
                               <div style="fon  t-size:13px;font-weight:bold">本站居然运行了 ${dnum} 天 ${formattedS} 小时 ${formattedL} 分 ${formattedB} 秒 
                               <span class='fas fa-heartbeat' id="heartbeat"></span>
                               <br> 旅行者 1 号当前距离地球 ${dis} 千米，约为 ${unit} 个天文单位 🚀
                                </div>`;
        }

        const workBoard = document.getElementById("workboard");
        if (workBoard) {
            workBoard.innerHTML = currentTimeHtml;
        } else {
            console.error("❌ ERROR: workboard not found! 确保HTML包含 <div id='workboard'></div>");

        }

    }, 1000);
});

