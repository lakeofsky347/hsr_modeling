/* 背景特效层：WebGL 绘制，失败自动退回 CSS。只读 <html data-theme="hsr|endfield">，不碰页面逻辑 约定见 ../ww/COMPONENTS.md。 */
(function () {
  "use strict";
  var theme = document.documentElement.getAttribute("data-theme") || "hsr";
  var mq = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  function motionPref() {
    var o = null;
    try { o = localStorage.getItem("sim:reducedMotion"); } catch (e) { o = null; }
    if (o === "1") return true;
    if (o === "0") return false;
    return !!(mq && mq.matches);
  }
  function setReduce(v) {
    window.__reducedMotion = !!v;
    if (v) document.documentElement.setAttribute("data-reduced-motion", ""); else document.documentElement.removeAttribute("data-reduced-motion");
  }
  if (typeof window.__reducedMotion !== "boolean") setReduce(motionPref()); else setReduce(window.__reducedMotion);
  var reduce = window.__reducedMotion, kick = null;
  if (mq) {
    var onMq = function () {
      setReduce(motionPref()); var was = reduce; reduce = window.__reducedMotion;
      if (was && !reduce && kick) kick();
      try { document.dispatchEvent(new CustomEvent("sim:motion", { detail: { reduced: reduce } })); } catch (e) {}
    };
    if (mq.addEventListener) mq.addEventListener("change", onMq); else if (mq.addListener) mq.addListener(onMq);
  }

  var D = document;
  function ensureLoader() {
    var el = D.getElementById("loader");
    if (!el) { el = D.createElement("div"); el.id = "loader"; el.setAttribute("role", "status"); (D.body || D.documentElement).appendChild(el); }
    if (!el.querySelector(".ld-prog")) el.innerHTML = '<div class="ld-core"><div class="ld-mark"></div><svg class="ld-ring" viewBox="0 0 100 100"><circle class="tr" cx="50" cy="50" r="47"/><circle class="fg" cx="50" cy="50" r="47" pathLength="100"/></svg></div>' +
      '<div class="ld-text">正在加载数据…</div><div class="ld-prog" hidden><div class="ld-bar" role="progressbar" aria-label="加载进度"><i></i></div>' +
      '<div class="ld-meta"><span class="ld-pct">0%</span><span class="ld-files"></span><span class="ld-eta"></span></div></div>' +
      '<div class="ld-busy" hidden>服务器繁忙，正在排队加载…</div><div class="ld-retry" hidden></div><div class="ld-err"></div>' +
      '<div class="ld-act" hidden><button type="button" class="ld-reload">重新加载</button></div>';
    el.querySelector(".ld-reload").onclick = function () { location.reload(); };
    return el;
  }
  var LD = { b: null, t0: 0, l0: 0, rate: 0, iv: 0, rt: 0, done: false, failed: false };
  function q(sel) { var el = D.getElementById("loader"); return el ? el.querySelector(sel) : null; }
  function paint() {
    var el = D.getElementById("loader"), b = LD.b; if (!el || LD.failed || !b) return;
    var tot = +b.total, got = +b.loaded; if (!(tot > 0) || !isFinite(got)) return;
    var p = Math.max(0, Math.min(1, got / tot)), pct = p >= 1 ? 100 : Math.floor(p * 100), dt = (Date.now() - LD.t0) / 1000, eta = "";
    el.style.setProperty("--ld-p", p.toFixed(4)); el.classList.add("has-prog"); q(".ld-prog").hidden = false;
    q(".ld-pct").textContent = pct + "%"; q(".ld-bar").setAttribute("aria-valuenow", pct);
    q(".ld-files").textContent = +b.files > 0 && isFinite(+b.filesDone) ? b.filesDone + " / " + b.files + " 个文件" : "";
    if (dt >= 0.5 && got > LD.l0 && p < 1) {
      var r = (got - LD.l0) / dt; LD.rate = LD.rate > 0 ? LD.rate * 0.7 + r * 0.3 : r;
      var sec = (tot - got) / LD.rate;
      if (isFinite(sec) && sec >= 0) eta = sec < 1 ? "即将完成" : sec < 60 ? "约 " + Math.ceil(sec) + " 秒" : "约 " + Math.ceil(sec / 60) + " 分钟";
    }
    q(".ld-eta").textContent = eta;
  }
  function prog(d) {
    var b = d.batch; if (d.phase !== "boot" || LD.done || !b) return;
    if (!LD.b || LD.b.id !== b.id || LD.b.pre) { LD.t0 = Date.now(); LD.l0 = +b.loaded || 0; LD.rate = 0; LD.start = +b.startedAt || LD.t0; }
    LD.b = b; ensureLoader();
    if (d.state === "retry") {
      var rt = q(".ld-retry"); rt.hidden = false;
      rt.textContent = "重试中（第 " + Math.max(1, (+d.attempt || 2) - 1) + " 次）" + (d.file ? " · " + String(d.file).split("?")[0].split("/").pop() : "");
      clearTimeout(LD.rt); LD.rt = setTimeout(function () { var r2 = q(".ld-retry"); if (r2) r2.hidden = true; }, 4000);
    }
    paint();
    if (!LD.iv) LD.iv = setInterval(function () {
      if (LD.done || LD.failed) return clearInterval(LD.iv);
      if (LD.b && Date.now() - LD.start > 5000 && +LD.b.loaded < +LD.b.total) { var bz = q(".ld-busy"); if (bz) bz.hidden = false; }
      paint();
    }, 500);
  }
  D.addEventListener("sim:progress", function (e) { prog(e.detail || {}); });
  (function () {
    var st = window.__simLoadState && window.__simLoadState(), C = window.__simChunks; if (!st || !C || !C.boot || !C.chunks) return;
    var sz = {}, tot = 0, got = 0, n = 0; C.chunks.forEach(function (c) { sz[c.id] = +c.size || 0; });
    C.boot.forEach(function (id) { tot += sz[id] || 0; if (st.loaded.indexOf(id) >= 0) { got += sz[id] || 0; n++; } });
    if (tot > 0 && n < C.boot.length) prog({ phase: "boot", batch: { id: "boot", pre: 1, loaded: got, total: tot, files: C.boot.length, filesDone: n, startedAt: Date.now() } });
  })();
  var EXPLAIN = {
    "file-protocol": "页面是直接双击打开的（file://），浏览器不允许读取数据。请在包目录运行 python3 -m http.server 后访问 http://localhost:8000/。",
    "mismatch": "页面和数据版本对不上，多半是缓存了旧文件。请重新加载；仍不行按 Ctrl+Shift+R。",
    "parse": "数据文件不完整，可能是传输中断。请重新加载。",
    "network": "网络中断或服务器暂时无法访问。请检查网络后重新加载。",
    "stall": "服务器长时间没有响应（可能在排队）。请稍后重新加载。",
    "http-404": "服务器上缺少数据文件（数据包不完整）。请稍后再试；一直这样请联系维护者。"
  };
  function explain(c) {
    var m = /^http-(\d+)$/.exec(c || "");
    return EXPLAIN[c] || (m ? (+m[1] >= 500 ? "服务器暂时出错或繁忙（" + m[1] + "），自动重试仍未成功。请稍后重新加载。" : "服务器拒绝了数据请求（" + m[1] + "）。请重新加载。") : "数据没有加载成功。请重新加载。");
  }
  function showError(msg, code) {
    var el = ensureLoader(); LD.failed = true;
    el.classList.remove("done"); el.classList.add("error"); el.setAttribute("role", "alert");
    el.querySelector(".ld-text").textContent = "加载失败";
    msg = String(msg || "").replace(/\?v=[0-9a-z]+/gi, "").replace(/（([^（）]+)）(?=（\1）)/g, "");
    el.querySelector(".ld-err").textContent = explain(code) + (msg ? "\n（" + msg + "）" : "");
    ["ld-prog", "ld-busy", "ld-retry"].forEach(function (c) { el.querySelector("." + c).hidden = true; });
    el.querySelector(".ld-act").hidden = false;
    try { el.querySelector(".ld-reload").focus({ preventScroll: true }); } catch (e) {}
  }
  var lastErr = {};
  D.addEventListener("sim:error", function (e) {
    var d = e.detail || {}; if (d.phase !== "load" || d.runId != null || LD.done) return;
    lastErr = d; showError(d.message, d.code);
  });
  window.__uiReady = function () {
    LD.done = true; clearInterval(LD.iv);
    var el = D.getElementById("loader"); if (!el || LD.failed) return;
    if (LD.b) { LD.b = Object.assign({}, LD.b, { loaded: LD.b.total }); paint(); }
    el.classList.add("done"); setTimeout(function () { el.remove(); }, window.__reducedMotion ? 0 : 600);
  };
  window.__uiError = function (msg) {
    var m = String(msg || ""), code = lastErr.code, h;
    if (!code && /file:|本地服务器|file-protocol/.test(m)) code = "file-protocol";
    if (!code && (h = /\b(?:HTTP\s*|http-)(\d{3})\b/.exec(m))) code = "http-" + h[1];
    showError(m.replace(/^数据加载失败：/, ""), code);
  };

  var FRAG = {
    hsr: [
      "precision mediump float;uniform vec2 r;uniform float t;",
      "float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
      "float stars(vec2 uv,float s,float sp){vec2 g=uv*s;vec2 id=floor(g);vec2 f=fract(g)-.5;",
      " float n=h(id);vec2 o=vec2(h(id+1.3),h(id+7.1))-.5;float d=length(f-o*.7);",
      " float tw=.6+.4*sin(t*sp+n*40.);return smoothstep(.06*n,.0,d)*step(.82,n)*tw;}",
      "void main(){vec2 uv=gl_FragCoord.xy/r.y;vec2 c=uv-vec2(r.x/r.y*.5,.5);",
      " vec3 col=mix(vec3(.03,.04,.09),vec3(.09,.06,.18),uv.y);",
      " col+=vec3(.25,.18,.55)*.35*exp(-6.*length(c-vec2(-.6,.45)));",
      " col+=vec3(.15,.25,.6)*.30*exp(-5.*length(c-vec2(.7,.35)));",
      " float a=atan(c.y,c.x),l=length(c);",
      " col+=vec3(.55,.6,1.)*.05*smoothstep(.006,0.,abs(l-.62-.01*sin(a*3.+t*.2)));",
      " col+=vec3(.8,.6,1.)*.035*smoothstep(.004,0.,abs(l-.88));",
      " col+=vec3(.9,.92,1.)*(stars(uv+t*.004,60.,1.5)+stars(uv+t*.002,120.,2.3)*.6);",
      " gl_FragColor=vec4(col,1.);}"
    ].join("\n"),
    ww: [
      "precision mediump float;uniform vec2 r;uniform float t;",
      "void main(){vec2 uv=gl_FragCoord.xy/r;vec2 p=(gl_FragCoord.xy-.5*r)/r.y;",
      " vec3 col=mix(vec3(.035,.04,.05),vec3(.07,.075,.085),uv.y);",
      " float w=0.;for(int i=0;i<5;i++){float fi=float(i);",
      "  float y=.06*sin(p.x*(3.+fi*1.7)+t*(.25+fi*.07)+fi*1.3)*(1.-abs(p.x)*.6)-.18+fi*.012;",
      "  w+=smoothstep(.004,0.,abs(p.y-y))*(.35-fi*.05);}",
      " col+=mix(vec3(.85,.72,.42),vec3(.45,.85,.9),uv.x)*w*.55;",
      " float l=length(p-vec2(.55,.22));",
      " for(int k=1;k<5;k++){float rr=float(k)*.09+.01*sin(t*.4+float(k));col+=vec3(.9,.8,.55)*.05*smoothstep(.003,0.,abs(l-rr));}",
      " col+=vec3(.95,.85,.6)*.06*exp(-8.*l);",
      " float v=length(uv-.5);col*=1.-.5*v*v;",
      " gl_FragColor=vec4(col,1.);}"
    ].join("\n"),
    endfield: [
      "precision mediump float;uniform vec2 r;uniform float t;",
      "void main(){vec2 p=gl_FragCoord.xy;vec2 uv=p/r;",
      " vec3 col=vec3(.055,.058,.062)+vec3(.02)*(1.-uv.y);",
      " vec2 g=abs(fract(p/48.)-.5)*48.;float grid=smoothstep(1.,0.,min(g.x,g.y));",
      " vec2 g2=abs(fract(p/240.)-.5)*240.;float big=smoothstep(1.2,0.,min(g2.x,g2.y));",
      " col+=vec3(.09)*grid*.35+vec3(.98,.82,.12)*big*.06;",
      " float sy=fract(t*.06);float scan=exp(-abs(uv.y-1.+sy)*60.);",
      " col+=vec3(.98,.82,.12)*scan*.07;",
      " col*=.94+.06*sin(p.y*1.5);",
      " float v=length(uv-.5);col*=1.-.55*v*v;",
      " gl_FragColor=vec4(col,1.);}"
    ].join("\n")
  };

  function startGL() {
    var cv = document.createElement("canvas");
    cv.id = "bg-gl";
    cv.setAttribute("aria-hidden", "true");
    var gl = cv.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return false;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
    var vs = sh(gl.VERTEX_SHADER, "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}");
    var fs = sh(gl.FRAGMENT_SHADER, FRAG[theme] || FRAG.hsr);
    if (!vs || !fs) return false;
    var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return false;
    gl.useProgram(pr);
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var uR = gl.getUniformLocation(pr, "r"), uT = gl.getUniformLocation(pr, "t");
    document.body.insertBefore(cv, document.body.firstChild);
    var scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.75;
    function resize() { cv.width = innerWidth * scale | 0; cv.height = innerHeight * scale | 0; gl.viewport(0, 0, cv.width, cv.height); gl.uniform2f(uR, cv.width, cv.height); }
    addEventListener("resize", resize); resize();
    var t0 = performance.now(), last = 0;
    function frame(now) {
      if (!document.hidden && now - last > 33) {
        last = now; gl.uniform1f(uT, (now - t0) / 1000); gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      if (!reduce) requestAnimationFrame(frame); else { looping = false; still(); }
    }
    function still() { gl.uniform1f(uT, 12.0); gl.drawArrays(gl.TRIANGLES, 0, 3); }
    addEventListener("resize", function () { if (reduce) still(); });
    var looping = false;
    kick = function () { if (!looping) { looping = true; requestAnimationFrame(frame); } };
    still();
    if (!reduce) kick();
    cv.addEventListener("webglcontextlost", function () { cv.remove(); document.documentElement.classList.add("no-gl"); });
    document.documentElement.classList.add("has-gl");
    return true;
  }

  function init() {
    ensureLoader();
    var ok = false;
    try { ok = startGL(); } catch (e) { ok = false; }
    if (!ok) document.documentElement.classList.add("no-gl");
  }
  if (document.body) init(); else document.addEventListener("DOMContentLoaded", init);
})();
