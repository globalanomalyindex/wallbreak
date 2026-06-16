/* wallbreak — the wall-smash intro.
   A hand-drawn brick wall stands over the wordmark; a punch cracks it, the center
   bricks burst out, the rest crumbles down, and "wallbreak" is revealed through the
   breach. Decorative only: reduced-motion and no-JS just show the clean hero.
   Debug: append ?slow=N to the url to slow the whole sequence N times. */
(function () {
  var root = document.documentElement;
  if (!root.classList.contains("smash-intro")) return; // reduced motion / not eligible

  var INK = "#101a21";
  var BG = "#b2c4c8";
  var NS = "http://www.w3.org/2000/svg";

  var SLOW = 1;
  try {
    var m = /[?&]slow=(\d+(?:\.\d+)?)/.exec(location.search);
    if (m) SLOW = Math.min(20, parseFloat(m[1]) || 1);
  } catch (e) {}

  var wordmark = document.querySelector(".wordmark");
  var tagline = document.querySelector(".tagline");
  var cta = document.querySelector(".cta");
  var footer = document.querySelector(".footer");
  var heroEls = [wordmark, tagline, cta, footer];

  function settle(elm) {
    if (!elm) return;
    elm.classList.remove("reveal");
    elm.style.opacity = "1";
    elm.style.transform = "none";
  }
  function revealAll() { heroEls.forEach(settle); }

  var overlay = null;
  function cleanup() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    root.classList.remove("smash-intro");
  }

  function later(fn, ms) { return setTimeout(fn, ms * SLOW); }
  function anim(el, kf, dur, delay, easing, fill) {
    return el.animate(kf, { duration: dur * SLOW, delay: (delay || 0) * SLOW, easing: easing || "linear", fill: fill || "none" });
  }

  var failsafe = later(function () { revealAll(); cleanup(); }, 2700);

  function rnd(n) { return (Math.random() * 2 - 1) * n; }
  function node(name, attrs) {
    var n = document.createElementNS(NS, name);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function brickPath(x, y, w, h) {
    var j = 2.4;
    return "M" + (x + rnd(j)) + "," + (y + rnd(j)) +
      " L" + (x + w + rnd(j)) + "," + (y + rnd(j)) +
      " L" + (x + w + rnd(j)) + "," + (y + h + rnd(j)) +
      " L" + (x + rnd(j)) + "," + (y + h + rnd(j)) + " Z";
  }

  try {
    var W = 700, H = 300;
    var IX = 430, IY = 150; // impact point, just right of centre (toward "break")

    overlay = document.createElement("div");
    overlay.className = "smash-stage";
    overlay.setAttribute("aria-hidden", "true");
    var svg = node("svg", { viewBox: "0 0 " + W + " " + H, fill: "none" });
    overlay.appendChild(svg);
    document.body.appendChild(overlay); // must be in the DOM before getTotalLength()

    // centre the wall on the wordmark (it sits above viewport centre because of the footer)
    var wr = wordmark && wordmark.getBoundingClientRect();
    if (wr && wr.width) {
      svg.style.left = (wr.left + wr.width / 2) + "px";
      svg.style.top = (wr.top + wr.height / 2) + "px";
    } else {
      svg.style.left = "50%";
      svg.style.top = "50%";
    }
    svg.style.transform = "translate(-50%, -50%)";

    // --- the wall ---
    var wall = node("g");
    svg.appendChild(wall);
    var bricks = [];
    var bw = 70, bh = 28, vstep = 30, rowi = 0;
    for (var y = 58; y <= 214; y += vstep, rowi++) {
      var startX = 88 - (rowi % 2 ? bw / 2 : 0);
      for (var x = startX; x < 616; x += bw + 2) {
        var p = node("path", {
          d: brickPath(x, y, bw, bh), fill: BG, stroke: INK,
          "stroke-width": 2, "stroke-linejoin": "round"
        });
        p.setAttribute("class", "smash-brick");
        wall.appendChild(p);
        bricks.push({ node: p, cx: x + bw / 2, cy: y + bh / 2 });
      }
    }

    // --- crack ---
    var d1 = ["M" + IX + "," + IY];
    var cx = IX, cy = IY;
    for (var i = 0; i < 5; i++) { cx += -46 - Math.random() * 28; cy += rnd(36); d1.push("L" + cx + "," + cy); }
    var crackD = d1.join(" ") +
      " M" + IX + "," + IY + " L" + (IX + 54) + "," + (IY - 38) + " L" + (IX + 116) + "," + (IY - 16) +
      " M" + IX + "," + IY + " L" + (IX + 24) + "," + (IY + 60) + " L" + (IX - 6) + "," + (IY + 110);
    var crack = node("path", { d: crackD, stroke: INK, "stroke-width": 2.5, "stroke-linecap": "round", "stroke-linejoin": "round" });
    svg.appendChild(crack);
    var clen = crack.getTotalLength();
    crack.setAttribute("stroke-dasharray", clen);
    crack.setAttribute("stroke-dashoffset", clen);

    // --- impact marks (comic radiating strokes) ---
    var marks = node("g", { stroke: INK, "stroke-width": 3, "stroke-linecap": "round" });
    marks.style.opacity = "0";
    marks.style.transformBox = "view-box";
    marks.style.transformOrigin = IX + "px " + IY + "px";
    for (var a = 0; a < 8; a++) {
      var ang = (a / 8) * Math.PI * 2 + rnd(0.18);
      var r0 = 16 + rnd(3), r1 = 36 + rnd(9);
      marks.appendChild(node("line", {
        x1: IX + Math.cos(ang) * r0, y1: IY + Math.sin(ang) * r0,
        x2: IX + Math.cos(ang) * r1, y2: IY + Math.sin(ang) * r1
      }));
    }
    svg.appendChild(marks);

    // --- dust ---
    var dust = node("g", { fill: INK });
    dust.style.opacity = "0";
    dust.style.transformBox = "view-box";
    dust.style.transformOrigin = IX + "px " + IY + "px";
    for (var dn = 0; dn < 7; dn++) {
      dust.appendChild(node("circle", { cx: IX + rnd(26), cy: IY + rnd(20), r: 6 + Math.random() * 8, opacity: 0.16 }));
    }
    svg.appendChild(dust);

    // ---------- choreography ----------
    anim(crack, [{ strokeDashoffset: clen }, { strokeDashoffset: 0 }], 280, 130, "steps(7)", "forwards");
    anim(crack, [{ opacity: 1 }, { opacity: 0 }], 360, 620, "ease-out", "forwards");

    anim(marks,
      [{ opacity: 0, transform: "scale(0.4)" }, { opacity: 1, transform: "scale(1.05)" }, { opacity: 0, transform: "scale(1.3)" }],
      320, 430, "steps(5)", "forwards");

    anim(dust,
      [{ opacity: 0, transform: "scale(0.4)" }, { opacity: 1, transform: "scale(1.1)" }, { opacity: 0, transform: "scale(2)" }],
      600, 440, "steps(6)", "forwards");

    anim(wall,
      [{ transform: "translate(0,0)" }, { transform: "translate(3px,-2px)" }, { transform: "translate(-4px,2px)" }, { transform: "translate(2px,1px)" }, { transform: "translate(0,0)" }],
      210, 430, "steps(4)", "none");

    bricks.forEach(function (b) {
      var dx = b.cx - IX, dy = b.cy - IY;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      if (dist < 120) {
        var push = 150 + Math.random() * 140;
        var tx = (dx / dist) * push + rnd(22);
        var ty = (dy / dist) * push + 70 + Math.random() * 90;
        anim(b.node,
          [{ transform: "translate(0,0) rotate(0deg)", opacity: 1 },
           { transform: "translate(" + tx + "px," + ty + "px) rotate(" + rnd(240) + "deg)", opacity: 0 }],
          520 + Math.random() * 170, 450 + Math.random() * 60, "cubic-bezier(0.16,1,0.3,1)", "forwards");
      } else {
        var fall = 240 + Math.random() * 210;
        anim(b.node,
          [{ transform: "translate(0,0) rotate(0deg)", opacity: 1 },
           { offset: 0.65, opacity: 1 },
           { transform: "translate(" + rnd(44) + "px," + fall + "px) rotate(" + rnd(64) + "deg)", opacity: 0 }],
          640 + Math.random() * 280, 540 + Math.random() * 280, "cubic-bezier(0.45,0,0.9,0.35)", "forwards");
      }
    });

    // reveal the hero through the breach
    animateIn(wordmark, 660, 540, true);
    animateIn(tagline, 900, 460, false);
    animateIn(cta, 1020, 460, false);
    animateIn(footer, 1140, 460, false);

    later(function () { clearTimeout(failsafe); cleanup(); }, 1750);
  } catch (e) {
    clearTimeout(failsafe);
    revealAll();
    cleanup();
  }

  function animateIn(elm, delay, dur, withScale) {
    if (!elm) return;
    var from = withScale ? "translateY(6px) scale(0.97)" : "translateY(12px)";
    anim(elm, [{ opacity: 0, transform: from }, { opacity: 1, transform: "none" }], dur, delay, "cubic-bezier(0.16,1,0.3,1)", "forwards");
    later(function () { settle(elm); }, delay + dur);
  }
})();
