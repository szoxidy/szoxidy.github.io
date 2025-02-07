$(window).on('load', function () {

    let element = document.querySelector(getElementAttribute($("#subtitle"), "on"));

    if (element) {
        colorful(element);
    }
});

let colorful = function (element) {
    if (element == null) {
        return;
    }

    function getRandomColor() {
        return colors[Math.floor(Math.random() * colors.length)];
    }

    function getRandomChar() {
        return String.fromCharCode(94 * Math.random() + 33);
    }

    function addEndChars(chars) {
        let fragment = document.createDocumentFragment()
        for (let i = 0; chars > i; i++) {
            let endChars = document.createElement("span");
            endChars.textContent = getRandomChar();
            endChars.style.color = getRandomColor();
            fragment.appendChild(endChars);
        }
        return fragment;
    }

    function startPrint() {
        const startChars = textArray[sets.skillI];
        if (sets.step) {
            sets.step--;
        } else {
            sets.step = speed;
            if (sets.prefixP < showText.length) {
                if (sets.prefixP >= 0) {
                    sets.text += showText[sets.prefixP];
                }
                sets.prefixP++;
            } else {
                if ("forward" === sets.direction) {
                    if (sets.skillP < startChars.length) {
                        sets.text += startChars[sets.skillP];
                        sets.skillP++;
                    } else {
                        if (sets.delay) {
                            sets.delay--;
                        } else {
                            sets.direction = "backward";
                            sets.delay = sentDelay;
                        }
                    }
                } else {
                    if (sets.skillP > 0) {
                        sets.text = sets.text.slice(0, -1);
                        sets.skillP--;
                    } else {
                        setTimeout(function() {
                            sets.skillI = (sets.skillI + 1) % textArray.length;
                            sets.direction = "forward";
                            startPrint();  // 重新调用 startPrint 开始新的循环
                        }, 500);
                        return;  // 避免继续调用后面的 setTimeout(startPrint, charDelay)
                    }
                }
            }
        }
        element.textContent = sets.text;

        element.appendChild(addEndChars(sets.prefixP < showText.length ? Math.min(prefixEnd, prefixEnd + sets.prefixP) : Math.min(prefixEnd, startChars.length - sets.skillP)));

        setTimeout(startPrint, charDelay);
    }

    let showText = "", texts = getElementAttribute($("#subtitle"), "texts") || "Hi.";

    let textArray = texts.split(getElementAttribute($("#subtitle"), "split") || "-").filter((item, index) => item.length != 0);
    textArray = textArray.map(function (str) {
        return str + ""
    });
    let sentDelay = 10,
        speed = 1,
        prefixEnd = 5,
        charDelay = 75,
        colors = ["rgb(110,64,170)", "rgb(150,61,179)", "rgb(191,60,175)", "rgb(228,65,157)", "rgb(254,75,131)", "rgb(255,94,99)", "rgb(255,120,71)", "rgb(251,150,51)", "rgb(226,183,47)", "rgb(198,214,60)", "rgb(175,240,91)", "rgb(127,246,88)", "rgb(82,246,103)", "rgb(48,239,130)", "rgb(29,223,163)", "rgb(26,199,194)", "rgb(35,171,216)", "rgb(54,140,225)", "rgb(76,110,219)", "rgb(96,84,200)"],
        sets = {
            text: "",
            prefixP: -prefixEnd,
            skillI: 0,
            skillP: 0,
            direction: "forward",
            delay: sentDelay,
            step: speed
        };
    startPrint();
};
