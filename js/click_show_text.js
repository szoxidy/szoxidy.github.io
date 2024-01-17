$(window).on('load', function() {
    let textArray = [];
    let newStyle = {};
    let rc = false;

    $("body").click(function(e) {
        if (textArray.length === 0) {
            let texts = getElementAttribute($("#click-show-text"), "texts") || "Hi,Ha";
            textArray = texts.split(getElementAttribute($("#click-show-text"), "split") || ",");
        }
        let a_index = getRandomValue(0, textArray.length - 1);
        let $i = $("<span />").text(textArray[a_index]);
        let x = e.pageX, y = e.pageY;

        if (jQuery.isEmptyObject(newStyle)) {
            let css = (getElementAttribute($("#click-show-text"), "css") || "").split(';');
            let prms = [];
            for (let i = 0; i < css.length; i++) {
                if (css[i] !== undefined) {
                    prms = css[i].split(':');
                    if (isNaN(prms[1])) {
                        newStyle[prms[0]] = prms[1];
                    } else {
                        newStyle[prms[0]] = Number(prms[1]);
                    }
                }
            }

            let style = {
                "z-index": 15,
                "position": "absolute",
                "font-weight": "bold",
                "cursor": "default"
            };

            newStyle = $.extend(style, newStyle);

            rc = newStyle["color"] === undefined;
        }

        $("body").append($i);

        newStyle["top"] = y - 20;
        newStyle["left"] = x - $i.innerWidth() / 2;
        newStyle["color"] = rc ? getRandomColor() : newStyle["color"];

        $i.css(newStyle);

        $i.animate({
            "top": y - 180,
            "opacity": 0
        }, 3000, function() {
            $i.remove();
        });
    });
});