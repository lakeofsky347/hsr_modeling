/* 游戏切换标签栏：结构统一，皮肤跟随 <html data-theme>。每个游戏包各带一份，链接全用相对路径（../hsr/ 等）。
   页面加载即插入到 <body> 最前面，不依赖其他脚本；页面本身的 id 和逻辑不受影响。 */
(function () {
  "use strict";
  var GAMES = [
    { id: "hsr", name: "星穹铁道", en: "STAR RAIL", href: "../hsr/" },
    { id: "endfield", name: "终末地", en: "ENDFIELD", href: "../endfield/" },
    { id: "ww", name: "鸣潮", en: "WUTHERING WAVES", href: "../ww/" }
  ];
  /* 数据来源（底部小字）；没有确认网址的来源只写名字 */
  var SOURCES = {
    hsr: [["TurnBasedGameData", "https://github.com/DimbreathBot/TurnBasedGameData"], ["nanoka", "https://hsr.nanoka.cc/"]],
    endfield: [["EndfieldData", "https://github.com/rmxlinux/EndfieldData"]],
    ww: [["WutheringWaves_Data", "https://github.com/Arikatsu/WutheringWaves_Data"], ["encore.moe", "https://encore.moe/"], ["WuwaLAB", "https://wuwalab.com/"], ["WuWaSim", "https://github.com/Philipp-DI/WuWaSim"]]
  };
  var cur = document.documentElement.getAttribute("data-theme") || "";
  var root = document.documentElement.getAttribute("data-gnav-root") || "../";
  /* 部署路径可配：apply-theme.py --nav '<json>' 在本脚本前注入 window.__SIM_NAV = {hsr, endfield, ww, home}。
     值为 null 或缺失的游戏不显示（当前页面自己的标签始终显示）；home 为 null 时不显示“返回入口”。
     没有 __SIM_NAV 时保持默认：../hsr/ ../endfield/ ../ww/，入口 ../ */
  var NAV = window.__SIM_NAV && typeof window.__SIM_NAV === "object" ? window.__SIM_NAV : null;
  if (NAV) {
    GAMES = GAMES.filter(function (g) {
      var v = NAV[g.id];
      if (typeof v === "string" && v) { g.href = v; return true; }
      if (g.id === cur) { g.href = "./"; return true; }
      return false;
    });
    if ("home" in NAV) root = typeof NAV.home === "string" && NAV.home ? NAV.home : null;
  }
  function attr(v) { return String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }

  var css = [
    ".gnav{position:relative;z-index:40;display:flex;align-items:stretch;gap:0;height:40px;padding:0 14px;font:500 12.5px/1 'HarmonyOS Sans SC','PingFang SC','Microsoft YaHei',sans-serif;user-select:none;flex:none}",
    ".gnav a{color:inherit;text-decoration:none}",
    ".gnav .home{display:flex;align-items:center;gap:8px;padding-right:14px;margin-right:6px;opacity:.75;letter-spacing:2px;font-size:11px}",
    ".gnav .home:hover{opacity:1}",
    ".gnav .home svg{width:16px;height:16px}",
    ".gnav .tabs{display:flex;align-items:stretch;gap:2px}",
    ".gnav .tab{position:relative;display:flex;align-items:center;gap:8px;padding:0 16px;opacity:.88;transition:opacity .2s,background .2s;white-space:nowrap}",
    ".gnav .tab:hover{opacity:.95}",
    ".gnav .tab .en{font-size:9.5px;letter-spacing:2px;opacity:.85}",
    ".gnav .tab.on{opacity:1}",
    "@media (max-width:640px){.gnav{padding:0 6px;letter-spacing:0!important}.gnav .home{padding-right:6px;margin-right:2px}.gnav .tab{padding:0 9px}.gnav .tab .en,.gnav .home span{display:none}}",
    ".gnav{max-width:100vw;overflow-x:auto;scrollbar-width:none}.gnav::-webkit-scrollbar{display:none}.gnav .tabs{flex:none}",
    ".gfoot{overflow-wrap:anywhere}",
    /* ---- 星铁：星轨玻璃 ---- */
    "html[data-theme=hsr] .gnav{background:rgba(6,8,22,.7);backdrop-filter:blur(12px);color:#dfe4ff;border-bottom:1px solid rgba(157,178,255,.15)}",
    "html[data-theme=hsr] .gnav .tabs::before{content:'';position:absolute;left:150px;right:14px;bottom:0;height:1px;background:linear-gradient(90deg,rgba(157,178,255,.0),rgba(157,178,255,.45),rgba(211,168,255,.45),rgba(157,178,255,0));background-size:200% 100%;animation:gnav-flow 8s linear infinite}",
    "html[data-theme=hsr] .gnav .tab{border-radius:999px;margin:6px 0;padding:0 16px}",
    "html[data-theme=hsr] .gnav .tab.on{background:linear-gradient(120deg,rgba(96,119,255,.35),rgba(154,99,240,.35));box-shadow:inset 0 0 0 1px rgba(190,170,255,.45),0 0 16px rgba(150,130,255,.25)}",
    "html[data-theme=hsr] .gnav .tab.on::before{content:'';width:8px;height:8px;background:#fff;-webkit-mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z'/%3E%3C/svg%3E\") center/contain no-repeat;mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z'/%3E%3C/svg%3E\") center/contain no-repeat;filter:drop-shadow(0 0 4px #c9b8ff)}",
    "@keyframes gnav-flow{to{background-position:-200% 0}}",
    /* ---- 终末地：黄黑工业 ---- */
    "html[data-theme=endfield] .gnav{background:#0a0b0c;color:#d8d7d2;border-bottom:1px solid #2b2d32;font-family:'Bahnschrift','HarmonyOS Sans SC',sans-serif;letter-spacing:1px}",
    "html[data-theme=endfield] .gnav .home{font-family:ui-monospace,Menlo,monospace}",
    "html[data-theme=endfield] .gnav .tab{border-right:1px solid #1f2024;text-transform:uppercase}",
    "html[data-theme=endfield] .gnav .tab::before{content:attr(data-idx);font:10px ui-monospace,Menlo,monospace;opacity:.5}",
    "html[data-theme=endfield] .gnav .tab.on{background:#fadb14;color:#111;font-weight:700;clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,0 100%)}",
    "html[data-theme=endfield] .gnav .tab.on::after{content:'';position:absolute;left:0;right:0;bottom:0;height:3px;background:repeating-linear-gradient(-45deg,#111 0 5px,transparent 5px 10px)}",
    "html[data-theme=endfield] .gnav .tab:not(.on):hover{color:#fadb14}",
    /* ---- 鸣潮：黑金声波 ---- */
    "html[data-theme=ww] .gnav{background:rgba(8,9,10,.8);backdrop-filter:blur(12px);color:#ecebe7;border-bottom:1px solid rgba(255,255,255,.07);letter-spacing:2px}",
    "html[data-theme=ww] .gnav .tab.on{color:#f1d9a0}",
    "html[data-theme=ww] .gnav .tab.on::after{content:'';position:absolute;left:12px;right:12px;bottom:3px;height:8px;opacity:.9;background:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 8' preserveAspectRatio='none' fill='none' stroke='%23d9b46a' stroke-width='1.2'%3E%3Cpath d='M0 4 Q3 0 6 4 T12 4 T18 4 Q21 1 24 4 T30 4 Q33 7 36 4 T42 4 T48 4 Q51 2 54 4 T60 4'/%3E%3C/svg%3E\") 0 0/60px 8px repeat-x;animation:gnav-wave 1.6s linear infinite}",
    "html[data-theme=ww] .gnav .tab.on::before{content:'';position:absolute;inset:6px 4px;border:1px solid rgba(217,180,106,.35);background:linear-gradient(180deg,rgba(217,180,106,.08),transparent)}",
    "@keyframes gnav-wave{to{background-position:60px 0}}",
    ".gfoot{position:relative;z-index:2;clear:both;padding:8px 18px 10px;font-size:11px;line-height:1.7;opacity:1;text-align:center;flex:none}",
    ".gfoot a{color:inherit;text-decoration:underline;text-underline-offset:2px}",
    ".gfoot .sep{margin:0 6px;opacity:.5}",
    "html[data-theme=hsr] .gfoot{color:#d5dcf2;border-top:1px solid transparent;border-image:linear-gradient(90deg,transparent,rgba(157,178,255,.3),transparent) 1}",
    "html[data-theme=endfield] .gfoot{color:#d4d3cc;font-family:ui-monospace,Menlo,monospace;letter-spacing:.5px;text-align:left;border-top:1px dashed #2b2d32}",
    "html[data-theme=endfield] .gfoot::before{content:'// SOURCE  ';color:#fadb14}",
    "html[data-theme=ww] .gfoot{color:#dddcd6;letter-spacing:1px;border-top:1px solid rgba(217,180,106,.18)}",
    "html[data-theme=ww] .gfoot a:hover{color:#f1d9a0}",
    "@media (prefers-reduced-motion:reduce){.gnav *{animation:none!important}}"
  ].join("\n");

  function build() {
    if (document.querySelector(".gnav")) return;
    var st = document.createElement("style"); st.id = "gnav-css"; st.textContent = css; document.head.appendChild(st);
    var nav = document.createElement("nav");
    nav.className = "gnav"; nav.setAttribute("aria-label", "切换游戏");
    var h = root == null ? '<div class="tabs">' : ('<a class="home" href="' + attr(root) + '" title="返回入口"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="2" width="5" height="5"/><rect x="9" y="2" width="5" height="5"/><rect x="2" y="9" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/></svg><span>模拟器</span></a><div class="tabs">');
    GAMES.forEach(function (g, i) {
      var on = g.id === cur;
      h += '<a class="tab' + (on ? " on" : "") + '" data-idx="0' + (i + 1) + '" href="' + attr(g.href) + '"' + (on ? ' aria-current="page"' : "") + '>' + g.name + '<span class="en">' + g.en + "</span></a>";
    });
    nav.innerHTML = h + "</div>";
    document.body.insertBefore(nav, document.body.firstChild);
    var src = SOURCES[cur];
    if (src && !document.querySelector(".gfoot")) {
      var f = document.createElement("footer"); f.className = "gfoot";
      f.innerHTML = "数据来源：" + src.map(function (x) {
        return x[1] ? '<a href="' + x[1] + '" target="_blank" rel="noopener noreferrer">' + x[0] + "</a>" : x[0];
      }).join('<span class="sep">·</span>') + '<span class="sep">｜</span>非官方工具，游戏数据与名称版权归原游戏所有';
      // 放在 body 末尾（星铁是全高 flex 布局，脚注会固定在底部一行；引擎重绘容器时不会被冲掉）
      document.body.appendChild(f);
    }
  }
  if (document.body) build(); else document.addEventListener("DOMContentLoaded", build);
})();
