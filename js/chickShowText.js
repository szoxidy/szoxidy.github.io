jQuery(document).ready(function ($) {
    let a_idx = 0;

    $("body").click(function (e) {
        let a = ["富强", "民主", "文明", "和谐", "自由", "平等", "公正", "法治", "爱国", "敬业", "诚信", "友善"];
        let $i = $("<span/>").text(a[a_idx]);
        a_idx = (a_idx + 1) % a.length;
        let x = e.pageX,
            y = e.pageY;

        let randomColor = getRandomColor();

        $i.css({
            "z-index": 9,
            "top": y - 15,
            "left": x,
            "position": "absolute",
            "font-weight": "bold",
            "color": randomColor
        });

        $("body").append($i);
        $i.animate({
            "top": y - 180,
            "opacity": 0
        }, 2000, function () {
            $i.remove();
        });
    });

    function delay() {
        // 延迟函数的内容
    }

    setTimeout(delay, 2000);

    function getRandomColor() {
        return "#" + Math.floor(Math.random() * 16777215).toString(16);
    }
});
