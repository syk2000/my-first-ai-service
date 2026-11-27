// 형번 검색 공통 비교 — 띄어쓰기·하이픈·밑줄 차이와 ×/x/* 차이를 무시함(KT304517 = KT 304517, UCP-205 = UCP 205, 6x15 = 6×15)
// 각 페이지 검색 스크립트가 원래 비교 뒤에 `|| (window.SWS_has && SWS_has(row, q[, 1]))` 로 부름 — 원래 찾던 결과는 그대로 두고 더 찾기만 함
window.SWS_norm = function (s) {
  return String(s == null ? "" : s).toUpperCase().replace(/[×✕*＊]/g, "X").replace(/[\s\u00a0\-‐‑–_]/g, "");
};
// row = 표의 <tr>(칸마다 따로 비교 — 옆 칸 글자가 붙어 엉뚱하게 맞는 것을 막음) 또는 문자열
// dims가 참이면(치수 검색이 따로 없는 페이지) 숫자만 ×·*·x·띄어쓰기로 나눈 치수 검색(20*47, 30x62)도 숫자마다 그 줄 어느 칸의 값과 같으면 맞음
window.SWS_has = function (row, q, dims) {
  var raw = String(q == null ? "" : q).trim();
  var isDim = /^\d+(\.\d+)?([\s×✕*＊xX,]+\d+(\.\d+)?)+$/.test(raw);
  var k = window.SWS_norm(isDim ? raw.replace(/[\s,]+/g, "X") : raw);  // 숫자끼리 띄어 쓴 것(30 35)은 붙이지 않고 치수로 봄
  if (!k) return true;
  var cells = row && row.cells ? Array.prototype.map.call(row.cells, function (c) { return c.textContent; })
    : [row && row.textContent != null ? row.textContent : String(row == null ? "" : row)];
  if (cells.some(function (c) { return window.SWS_norm(c).indexOf(k) !== -1; })) return true;
  // 표 어딘가에 그 표기 그대로(20×47) 적힌 줄이 있으면 그것만 보여 줌 — 나사 규격(M20×1.5) 같은 표에서 엉뚱한 줄이 섞이지 않게
  dims = dims && isDim;
  if (dims && window.SWS_has._q !== k) {
    window.SWS_has._q = k;
    window.SWS_has._lit = Array.prototype.some.call(document.querySelectorAll("table tbody td"), function (c) { return window.SWS_norm(c.textContent).indexOf(k) !== -1; });
  }
  if (dims && !window.SWS_has._lit) {
    // 숫자는 적은 차례대로 왼쪽 칸부터(20*47 = 앞 칸 20, 그 뒤 칸 47)
    var nums = cells.map(function (c) { return c.split(/[^\d.]+/).filter(Boolean).map(parseFloat); });
    var at = -1;
    return raw.split(/[\s×✕*＊xX,]+/).every(function (w) {
      var n = parseFloat(w);
      for (var i = at + 1; i < nums.length; i++) if (nums[i].indexOf(n) !== -1) { at = i; return true; }
      return false;
    });
  }
  return false;
};

// 모바일 내비게이션 토글
    const navToggle = document.getElementById("navToggle");
    const mainNav = document.getElementById("mainNav");

    navToggle.addEventListener("click", () => {
      const isOpen = mainNav.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
    });

    mainNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        mainNav.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });

    // 상단 메뉴 드롭다운 탭 토글 (호버 불가능한 기기 대응)
    document.querySelectorAll(".nav-caret").forEach((caretBtn) => {
      caretBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const item = caretBtn.closest(".nav-item");
        const willOpen = !item.classList.contains("open");
        document.querySelectorAll(".nav-item.open").forEach((openItem) => {
          openItem.classList.remove("open");
          const btn = openItem.querySelector(".nav-caret");
          if (btn) btn.setAttribute("aria-expanded", "false");
        });
        if (willOpen) {
          item.classList.add("open");
          caretBtn.setAttribute("aria-expanded", "true");
        }
      });
    });

    document.addEventListener("click", (e) => {
      document.querySelectorAll(".nav-item.open").forEach((item) => {
        if (!item.contains(e.target)) {
          item.classList.remove("open");
          const btn = item.querySelector(".nav-caret");
          if (btn) btn.setAttribute("aria-expanded", "false");
        }
      });
    });

    // 언어 선택 — 실제 번역은 i18n.js(window.I18N)가 적용하고, 여기서는 드롭다운 UI와 선택 저장만 담당
    const langSelect = document.getElementById("langSelect");
    const langSelectBtn = document.getElementById("langSelectBtn");
    const langSelectLabel = document.getElementById("langSelectLabel");
    const langMenu = document.getElementById("langMenu");
    const mobileLangOptions = document.getElementById("mobileLangOptions");

    function closeLangMenu() {
      langSelect.classList.remove("open");
      langSelectBtn.setAttribute("aria-expanded", "false");
    }

    // 드롭다운 표시(라벨·체크마크)는 번역이 "실제로 적용된 뒤"에만 갱신합니다 —
    // 요청만 하고 아직 반영 전인 상태가 화면에 보이는 일이 없도록, 단일 진실 공급원을 적용 완료 시점으로 둡니다.
    function updateLangUI(code) {
      langSelectLabel.textContent = code;
      langMenu.querySelectorAll("button[data-lang]").forEach((b) => {
        b.setAttribute("aria-checked", String(b.dataset.lang === code));
      });
      mobileLangOptions.querySelectorAll("button[data-lang]").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.lang === code));
      });
    }

    function setLanguage(code) {
      if (window.I18N) {
        window.I18N.apply(code, updateLangUI);
      } else {
        updateLangUI(code);
      }
    }

    // 다른 페이지에서 선택했던 언어를 유지
    setLanguage(window.I18N ? window.I18N.getSaved() : "KOR");

    langSelectBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = langSelect.classList.toggle("open");
      langSelectBtn.setAttribute("aria-expanded", String(isOpen));
    });

    langMenu.querySelectorAll("button[data-lang]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setLanguage(btn.dataset.lang);
        closeLangMenu();
      });
    });

    mobileLangOptions.querySelectorAll("button[data-lang]").forEach((btn) => {
      btn.addEventListener("click", () => setLanguage(btn.dataset.lang));
    });

    document.addEventListener("click", (e) => {
      if (!langSelect.contains(e.target)) closeLangMenu();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeLangMenu();
    });

    // 견적 목록 — 규격 검색 결과에서 [담기]를 누른 품번(예: 6205)을 남겨 견적문의(board.html)에서 보여줍니다.
    // sessionStorage를 쓰므로 홈페이지(탭)를 닫으면 목록이 자동으로 초기화됩니다.
    // 항목: { m: 품번, u: 제품 페이지, n: { KOR: 제품 종류 } }
    const RECENT_KEY = "recentModels";
    const RECENT_MAX = 20;
    function readRecent() {
      try { return JSON.parse(sessionStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; }
    }
    function writeRecent(list) {
      try { sessionStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) {}
    }

    // 알림창 전체가 견적문의 링크: 누르면 견적문의 페이지로 이동(견적 목록에 방금 담은 품번이 들어 있음)
    function showToast(text, linkText) {
      let toast = document.getElementById("siteToast");
      if (!toast) {
        toast = document.createElement("a");
        toast.id = "siteToast";
        toast.className = "site-toast";
        toast.href = "board.html";
        toast.setAttribute("role", "status");
        toast.addEventListener("mouseenter", () => clearTimeout(showToast.timer));
        toast.addEventListener("mouseleave", () => hideLater(1500));
        document.body.append(toast);
      }
      const msg = document.createElement("span");
      msg.textContent = text;
      const go = document.createElement("strong");
      go.className = "toast-go";
      go.textContent = linkText;
      toast.replaceChildren(msg, go);
      toast.classList.add("show");
      hideLater(4000);
    }
    function hideLater(ms) {
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => document.getElementById("siteToast").classList.remove("show"), ms);
    }

    // 견적 목록 담기 — 규격 검색 결과의 [담기] 버튼으로만 추가. 제품 규격 페이지의 표는 보기 전용(클릭 동작 없음)
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("tr[data-p] .quote-add");
      if (!btn) return;
      const tr = btn.closest("tr");
      // 규격 검색 결과 행은 [제품유형, 제품명, …] 순서이고 제품 페이지를 data-p로 갖고 있음
      const entry = { m: (tr.dataset.m || tr.cells[1].textContent).trim(), u: tr.dataset.p, n: { KOR: tr.dataset.c } };
      if (!entry.m || entry.m === "-") return;
      writeRecent([entry, ...readRecent().filter((r) => !(r.m === entry.m && r.u === entry.u))].slice(0, RECENT_MAX));
      tr.classList.add("row-picked");
      const t = window.I18N ? window.I18N.t : (s) => s;
      btn.textContent = t("담김");
      btn.classList.add("is-added");
      showToast(t("견적 목록에 담았습니다") + ": " + entry.m, t("견적문의로 가기") + " →");
    });

    // 견적문의의 품번 링크(…html#pick=6205)로 들어오면 해당 행으로 스크롤해 표시
    if (location.hash.startsWith("#pick=")) {
      const model = decodeURIComponent(location.hash.slice(6));
      // 표에 "P201 (PPL201)"처럼 병기된 형번도 찾도록 앞부분 일치까지 허용
      const tds = [...document.querySelectorAll("table.spec-table tbody td")];
      const text = (td) => td.textContent.replace(/\s+/g, " ").trim();
      const hit = tds.find((td) => text(td) === model) || tds.find((td) => text(td).startsWith(model + " "));
      if (hit) {
        const details = hit.closest("details");
        if (details) details.open = true;
        hit.parentElement.classList.add("row-picked");
        // 위쪽 이미지가 다 불러와져 위치가 확정된 뒤 스크롤
        const scroll = () => hit.scrollIntoView({ block: "center" });
        if (document.readyState === "complete") scroll();
        else window.addEventListener("load", scroll);
      }
    }

    // 우클릭 / 드래그 / 복사 방지 — 규격표 내용을 긁어 가지 못하게 함 (입력창만 예외, 선택 차단은 styles.css의 user-select)
    const isField = (el) => el && el.closest && el.closest("input, textarea, select");
    document.addEventListener("contextmenu", (e) => { if (!isField(e.target)) e.preventDefault(); });
    document.addEventListener("dragstart", (e) => { if (!isField(e.target)) e.preventDefault(); });
    document.addEventListener("selectstart", (e) => { if (!isField(e.target)) e.preventDefault(); });
    ["copy", "cut"].forEach((type) => document.addEventListener(type, (e) => {
      if (!isField(document.activeElement)) e.preventDefault();
    }));

    // 메인 오른쪽 광고 배너: 설명서처럼 한 장씩 넘김 — 배너를 누르면 다음 장(버튼 글자를 누르면 해당 페이지로 이동),
    // 4.5초마다 자동으로 넘기고, 점을 누르면 해당 장. 마우스를 올리면 멈춤
    (function adBanner() {
      const box = document.querySelector(".ad-banner");
      if (!box) return;
      const slides = [...box.querySelectorAll(".ad-slide")];
      const dots = [...box.querySelectorAll(".ad-dot")];
      const pageNo = box.querySelector(".ad-page");
      let cur = 0;
      let timer;
      const FLIP_MS = 750;
      function go(i) {
        const next = (i + slides.length) % slides.length;
        if (next === cur) return;
        const prev = slides[cur];
        const incoming = slides[next];
        const forward = next > cur || (cur === slides.length - 1 && next === 0);
        slides.forEach((s) => s.classList.remove("is-leaving", "is-returning"));
        if (forward) {
          // 앞 장이 왼쪽 모서리를 축으로 넘어가며 다음 장이 드러남
          prev.classList.add("is-leaving");
          setTimeout(() => prev.classList.remove("is-leaving"), FLIP_MS);
        } else {
          // 뒤로 갈 때는 이전 장이 다시 덮이듯 돌아옴
          incoming.classList.add("is-returning");
          setTimeout(() => incoming.classList.remove("is-returning"), FLIP_MS);
        }
        cur = next;
        slides.forEach((s, k) => {
          s.classList.toggle("is-active", k === cur);
          s.tabIndex = k === cur ? 0 : -1;
        });
        dots.forEach((d, k) => d.classList.toggle("is-active", k === cur));
        if (pageNo) pageNo.textContent = cur + 1 + " / " + slides.length;
      }
      const start = () => { clearInterval(timer); timer = setInterval(() => go(cur + 1), 4500); };
      dots.forEach((d, k) => d.addEventListener("click", () => { go(k); start(); }));
      slides.forEach((s) => s.addEventListener("click", (e) => {
        // 버튼(ad-cta)을 누르거나 키보드(Enter)로 누르면 원래 링크로 이동, 그 밖의 곳을 누르면 다음 장
        if (e.target.closest(".ad-cta") || e.detail === 0) return;
        e.preventDefault();
        go(cur + 1);
      }));
      const curl = box.querySelector(".ad-curl");
      if (curl) curl.addEventListener("click", () => go(cur + 1));
      box.addEventListener("mouseenter", () => clearInterval(timer));
      box.addEventListener("mouseleave", start);
      start();
    })();

    // 제품 페이지 검색칸이 0건이면 형번 표기 차이(띄어쓰기 SK20→SK 20, 실드 기호 6305ZZ→6305, 타사 표기 KM10→AN 10 등)를
    // 바꿔 다시 찾아봄 — 규칙은 홈페이지 규격검색·챗봇과 같은 assets/spec-data.js(specQueryVariants). 입력한 글자는 그대로 둠
    (function () {
      let busy = false, loading = null;
      const SEL = "section.page-section input[type=text], section.page-section input[type=search]";
      // 페이지 스크립트가 거른 표 중에 보이는 행이 있으면 결과 있음(아예 거르지 않은 표는 판단에서 뺌)
      const hasRows = (scope) => [...scope.querySelectorAll("table.spec-table")].some((t) => {
        const rows = [...t.querySelectorAll("tbody tr")];
        const off = (r) => r.hidden || r.style.display === "none" || !!r.closest("[hidden]");
        const hidden = rows.filter(off).length;
        return hidden > 0 && hidden < rows.length;
      });
      // 표에 실제로 적힌 표기를 찾아 그대로 다시 넣어 봄 — KT303517 → 'KT 303517', LM 20 UU → 'LM20UU' (띄어쓰기·하이픈·×/x 차이)
      const fromTable = (scope, q) => {
        const k = SWS_norm(q), out = [];
        if (k.length < 2 || /^[\d.\s×*xX,]+$/.test(q)) return out;  // 숫자·치수만 적은 건 그대로 둠
        for (const td of scope.querySelectorAll("table.spec-table tbody td")) {
          if (out.length >= 3) break;
          const t = td.textContent;
          let c = "";
          const map = [];
          for (let i = 0; i < t.length; i++) { const n = SWS_norm(t[i]); if (n.length === 1) { c += n; map.push(i); } }
          const at = c.indexOf(k);
          if (at < 0) continue;
          const v = t.slice(map[at], map[at + k.length - 1] + 1);
          if (v !== q && !out.includes(v)) out.push(v);
        }
        return out;
      };
      const need = () => (typeof specQueryVariants === "function" ? Promise.resolve() : loading || (loading = new Promise((res) => {
        const s = document.createElement("script");
        s.src = "assets/spec-data.js?v=20261127sc";
        s.onload = res; s.onerror = res;
        document.head.append(s);
      })));
      document.addEventListener("input", (e) => {
        const inp = e.target;
        if (busy || !inp.matches || !inp.matches(SEL) || inp.closest(".finder-fields")) return;
        const scope = inp.closest("section.page-section");
        const q = inp.value.trim();
        if (!q || hasRows(scope)) return;
        need().then(() => {
          if (inp.value.trim() !== q || typeof specQueryVariants !== "function") return;
          busy = true;
          try {
            let ok = false;
            for (const v of fromTable(scope, q).concat(specQueryVariants(q))) {
              inp.value = v;
              inp.dispatchEvent(new Event("input", { bubbles: true }));
              if (hasRows(scope)) { ok = true; break; }
            }
            if (!ok) { inp.value = q; inp.dispatchEvent(new Event("input", { bubbles: true })); }
          } finally { inp.value = q; busy = false; }
        });
      });
    })();

    // 규격표가 있는데 검색창이 없는 페이지에 '형번 / 규격 검색' 칸을 자동으로 붙임
    // (문구는 i18n/common.json 사전으로 번역 — 이 코드는 번역 대상 수집보다 먼저 실행됨)
    (function () {
      const tables = [...document.querySelectorAll("table.spec-table")].filter((t) => t.tBodies.length && !t.closest("#finderResults, .no-auto-search"));
      if (!tables.length) return;
      const content = document.querySelector("section.page-section, main");
      if (!content || content.querySelector("input:not([type=hidden])")) return;
      // 첫 표를 감싼 덩어리 바로 앞에 넣음
      let anchor = tables[0];
      while (anchor.parentElement && !anchor.parentElement.classList.contains("wrap")) anchor = anchor.parentElement;
      const box = document.createElement("div");
      box.className = "field auto-spec-search";
      box.innerHTML = '<label for="autoSpecFilter">형번 / 규격 검색</label>' +
        '<input id="autoSpecFilter" type="search" placeholder="예: 형번 또는 치수 (20, 30*62)" autocomplete="off">' +
        '<p class="finder-tip" id="autoSpecCount" hidden></p>';
      // 제품 틀의 검색 줄(.tpl-search-row)에 검색칸이 없으면 재질·사양 상자 왼쪽에 넣음(배치는 styles.css)
      const row = document.querySelector(".tpl-search-row");
      if (row && !row.querySelector(".field")) row.insertBefore(box, row.firstChild);
      else anchor.parentElement.insertBefore(box, anchor);
      const input = box.querySelector("input");
      const countEl = box.querySelector("#autoSpecCount");
      const rows = tables.flatMap((t) => [...t.tBodies].flatMap((b) => [...b.rows]));
      const norm = SWS_norm;
      const cells = rows.map((r) => [...r.cells].map((c) => c.textContent.trim()));
      input.addEventListener("input", () => {
        // 띄어쓰기·*·x로 나눈 낱말이 모두 그 줄에 있어야 보임 — 숫자는 칸 값과 같아야, 글자는 들어 있기만 하면 됨
        const words = input.value.trim().split(/[\s*×xX,]+/).filter(Boolean);
        const whole = SWS_norm(input.value);  // 띄어 쓴 형번을 붙여 쓰거나(KT304517) 반대로 써도 찾음
        const byWhole = (i) => whole.length > 1 && !/^[\d.X]+$/.test(whole) && cells[i].some((c) => SWS_norm(c).includes(whole));
        const anyWhole = rows.some((r, i) => byWhole(i));  // 형번 그대로 맞는 줄이 있으면 그 줄만(AN 05 → AN 02 등 섞이지 않게)
        let shown = 0;
        rows.forEach((r, i) => {
          const hit = anyWhole ? byWhole(i) : words.every((w) => /^\d+(\.\d+)?$/.test(w)
            ? cells[i].some((c) => c.split(/[^\d.]+/).some((n) => n !== "" && parseFloat(n) === parseFloat(w)))
            : cells[i].some((c) => norm(c).includes(norm(w))));
          r.hidden = !hit;
          if (hit) shown++;
        });
        if (words.length) document.querySelectorAll("details").forEach((d) => { if (d.querySelector("tbody tr:not([hidden])")) d.open = true; });
        countEl.hidden = !words.length;
        countEl.textContent = shown + " / " + rows.length + "건 표시 중";
      });
    })();

// 탭 페이지를 허브 + 시리즈별 페이지로 나눈 뒤의 예전 주소 이동 — 허브(와 slide_unit) 페이지가 호출
// cfg.tabs  = { 예전 탭 키: 시리즈 페이지 }  (#g2 · #sf 같은 주소)
// cfg.picks = { 형번: 시리즈 페이지 }        (견적 목록의 #pick=형번 링크)
// cfg.byPrefix = true 면 형번 앞 글자(SF 6×15 → sf, FT 5038-250 → ft)를 탭 키로 써서 찾음
function hubRedirect(cfg) {
  var h = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (!h) return;
  var pick = h.indexOf("pick=") === 0;
  var model = pick ? h.slice(5) : "";
  var to = !pick ? cfg.tabs[h] : cfg.byPrefix ? cfg.tabs[model.split(" ")[0].toLowerCase()] : (cfg.picks || {})[model];
  if (to) location.replace(to + (pick ? location.hash : ""));
}

// 이미지 카드 탭(시리즈별): 평소엔 고른 시리즈만 보이고, 검색어가 있으면 일치하는 행이 있는 시리즈를 모두 보여 줌
// rootId = 탭과 패널을 품은 section id, inputId = 그 페이지 검색칸 id(없으면 null → 안쪽의 …Filter 입력칸, 자동 검색칸 포함)
function seriesCardTabs(rootId, inputId) {
  var root = document.getElementById(rootId);
  var input = inputId ? document.getElementById(inputId) : null;
  var STORAGE_KEY = 'activeTab:' + location.pathname;
  var btns = Array.prototype.slice.call(root.querySelectorAll('.tab-cards .cat-tab-btn'));
  var panels = Array.prototype.slice.call(root.querySelectorAll('.cat-tab-panel[data-panel^="g"]'));
  var current = btns[0].getAttribute('data-tab');
  function getInput() { return input || root.querySelector('input[id$="Filter"]'); }
  function btnFor(p) { return btns.filter(function (b) { return b.getAttribute('data-tab') === p.getAttribute('data-panel'); })[0]; }
  function showTab() {
    btns.forEach(function (b) { var on = b.getAttribute('data-tab') === current; b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.classList.remove('no-match'); });
    panels.forEach(function (p) {
      p.hidden = p.getAttribute('data-panel') !== current;
      Array.prototype.forEach.call(p.querySelectorAll('details.series-group'), function (d) { d.open = true; });
    });
  }
  function sync() {
    var inp = getInput();
    var q = inp ? inp.value.trim() : '';
    root.classList.toggle('k-searching', q !== '');
    if (q === '') { showTab(); return; }
    panels.forEach(function (p) {
      var hit = Array.prototype.some.call(p.querySelectorAll('tbody tr'), function (r) { return r.style.display !== 'none' && !r.hidden; });
      p.hidden = !hit;
      var b = btnFor(p);
      if (b) { b.classList.toggle('no-match', !hit); b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); }
    });
  }
  btns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      current = btn.getAttribute('data-tab');
      try { sessionStorage.setItem(STORAGE_KEY, current); } catch (e) {}
      var inp = getInput();
      if (inp && inp.value !== '') { inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); } else { showTab(); }
    });
  });
  // 자동 검색칸(common.js)이 카드 아래에 붙으면 카드 위로 옮김
  function placeAuto() {
    var box = root.querySelector('.auto-spec-search'); var cards = root.querySelector('.tab-cards');
    if (box && cards && (cards.compareDocumentPosition(box) & 4)) cards.parentNode.insertBefore(box, cards);
    // 카드가 2~4장이면 검색칸 오른쪽에 같은 줄로 놓음(.search-tabs-row, 배치는 styles.css — 좁은 화면에선 아래로)
    var n = cards ? cards.querySelectorAll('.cat-tab-btn').length : 0;
    if (box && box.nextElementSibling === cards && n >= 2 && n <= 4 && !box.parentNode.closest('.tpl-search-row, .search-tabs-row')) {
      var row = document.createElement('div');
      row.className = 'search-tabs-row';
      box.parentNode.insertBefore(row, box);
      row.appendChild(box); row.appendChild(cards);
    }
  }
  placeAuto();
  document.addEventListener('DOMContentLoaded', placeAuto);
  var saved = null;
  try { saved = sessionStorage.getItem(STORAGE_KEY); } catch (e) {}
  if (saved && btns.some(function (b) { return b.getAttribute('data-tab') === saved; })) current = saved;
  showTab();
  root.addEventListener('input', function (e) { if (e.target.matches && e.target.matches('input[id$="Filter"]')) sync(); });
  // 일반 / K형 전환 버튼(.kmode-bar) — 검색 중(k-searching)에는 두 표를 모두 보여 줌. 배치는 styles.css
  root.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.kmode-btn'); if (!b) return;
    var p = b.closest('.cat-tab-panel');
    p.classList.toggle('k-on', b.getAttribute('data-kmode') === 'k');
    Array.prototype.forEach.call(p.querySelectorAll('.kmode-btn'), function (x) { x.classList.toggle('active', x === b); });
  });
}

// 이용 통계(익명) — 정식 주소(sws-bearing.com)에서만 기록. 쿠키·개인정보 없이 "무엇을 보고 찾았는지"만 /api/log로 보냄
(function () {
  if (location.hostname !== "sws-bearing.com" || !navigator.sendBeacon) return;
  var page = location.pathname.replace(/^\//, "").replace(/\.html$/, "").replace(/\/$/, "") || "index";
  function send(o) {
    try {
      o.p = o.p || page;
      navigator.sendBeacon("/api/log", new Blob([JSON.stringify(o)], { type: "text/plain" }));
    } catch (e) {}
  }
  var ref = "";
  try { if (document.referrer) { var h = new URL(document.referrer).hostname; if (h !== location.hostname) ref = h.replace(/^www\./, ""); } } catch (e) {}
  send({ t: "view", c: document.title, r: ref });

  // 검색어 — 입력을 멈추고 1.5초 뒤 한 번(글자마다 보내지 않음), 찾은 줄 수도 함께
  var timer = null, last = "";
  function val(id) { var el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; }
  function finderQuery() {
    var dims = [val("fD"), val("fOD"), val("fH")];
    var dimText = dims.some(Boolean) ? dims.map(function (v) { return v || "-"; }).join("×") : "";
    return [val("fName"), dimText].filter(Boolean).join(" ");
  }
  function countRows(scope) {
    var rows = (scope || document).querySelectorAll("table.spec-table tbody tr");
    return Array.prototype.filter.call(rows, function (r) { return !r.hidden && r.style.display !== "none"; }).length;
  }
  function flush(k, scope) {
    if (!k || k === last) return;
    last = k;
    send({ t: "search", k: k, n: countRows(scope) });
  }
  document.addEventListener("input", function (e) {
    var el = e.target;
    if (!el || !el.id) return;
    var finder = /^(fName|fD|fOD|fH)$/.test(el.id);
    if (!finder && !/Filter$/.test(el.id)) return;
    clearTimeout(timer);
    timer = setTimeout(function () {
      flush(finder ? finderQuery() : String(el.value || "").trim(), finder ? document.getElementById("finderResults") : null);
    }, 1500);
  });
  // 다른 화면에서 검색값을 달고 넘어온 경우(search-product.html?name=…)
  if (document.getElementById("finderResults") && /[?&](name|d|D|h)=/.test(location.search)) {
    setTimeout(function () { flush(finderQuery(), document.getElementById("finderResults")); }, 1200);
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    var add = t.closest && t.closest("tr[data-p] .quote-add");
    if (add) {
      var tr = add.closest("tr");
      send({ t: "add", k: tr.getAttribute("data-m"), c: tr.getAttribute("data-c"), p: String(tr.getAttribute("data-p") || "").replace(/\.html$/, "") });
      return;
    }
    var a = t.closest && t.closest("a[href]");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (/\.pdf(\?|#|$)/i.test(href)) send({ t: "dl", k: href.split("/").pop().split(/[?#]/)[0] });
    else if (/pf\.kakao\.com/i.test(href)) send({ t: "kakao" });
    else if (/^tel:/i.test(href)) send({ t: "tel" });
  });
  document.addEventListener("submit", function (e) {
    if (e.target && e.target.id === "inquiryForm") send({ t: "inq" });
  });
})();

// ── 규격표 검색칸 동작 (각 페이지에 복사돼 있던 같은 코드를 모음 — 페이지에서 id·건수만 넘겨 호출)
function filterSeries(_p0, _p1, _p2, _p3, _p4, _p5, _p6) {
    var input = document.getElementById(_p0);
    var groupsWrap = document.getElementById(_p1);
    var groups = Array.prototype.slice.call(groupsWrap.querySelectorAll('.series-group'));
    var countEl = document.getElementById(_p2);
    var toggleBtn = document.getElementById(_p3);
    var totalRows = _p4;

    function applyFilter() {
      var q = input.value.trim().toUpperCase();
      var shown = 0;
      groups.forEach(function (grp) {
        var grpRows = Array.prototype.slice.call(grp.querySelectorAll('tbody tr'));
        var grpShown = 0;
        grpRows.forEach(function (row) {
          var match = q === '' || row.textContent.toUpperCase().indexOf(q) !== -1 || (window.SWS_has && SWS_has(row, q, 1));
          row.style.display = match ? '' : 'none';
          if (match) grpShown++;
        });
        shown += grpShown;
        if (q !== '') {
          grp.open = grpShown > 0;
        } else {
          grp.open = false;
        }
      });
      countEl.textContent = shown + ' / ' + totalRows + '건 표시 중 · ' + _p5 + '개 시리즈';
    }

    var allOpen = false;
    toggleBtn.addEventListener('click', function () {
      allOpen = !allOpen;
      groups.forEach(function (grp) { grp.open = allOpen; });
      toggleBtn.textContent = allOpen ? '전체 접기' : '전체 펼치기';
    });

    input.addEventListener('input', applyFilter);
    countEl.textContent = totalRows + ' / ' + totalRows + '건 표시 중 · ' + _p6 + '개 시리즈';
}

function filterRows(_p0, _p1) {
    var input = document.getElementById(_p0);
    var rows = Array.prototype.slice.call(document.querySelectorAll(_p1));
    input.addEventListener('input', function () {
      var q = input.value.trim().toUpperCase();
      rows.forEach(function (row) {
        row.style.display = (q === '' || row.textContent.toUpperCase().indexOf(q) !== -1 || (window.SWS_has && SWS_has(row, q, 1))) ? '' : 'none';
      });
    });
}

function filterCouplingMain(_p0, _p1) {
    var input = document.getElementById('cplFilter');
    var groups = Array.prototype.slice.call(document.querySelectorAll('#cplGroups .series-group'));
    var countEl = document.getElementById('cplCount');
    var toggleBtn = document.getElementById('cplToggleAll');
    var mainRows = document.querySelectorAll(_p0);
    var totalRows = mainRows.length;
    var seriesN = 1;
    function applyFilter() {
      var q = input.value.trim().toUpperCase().replace(/\s+/g, '');
      var shown = 0;
      groups.forEach(function (grp) {
        var grpShown = 0;
        Array.prototype.slice.call(grp.querySelectorAll('tbody tr')).forEach(function (row) {
          var match = q === '' || row.textContent.toUpperCase().replace(/\s+/g, '').indexOf(q) !== -1 || row.textContent.toUpperCase().indexOf(input.value.trim().toUpperCase()) !== -1 || (window.SWS_has && SWS_has(row, q, 1));
          row.style.display = match ? '' : 'none';
          if (match) { grpShown++; if (row.closest(_p1)) shown++; }
        });
        grp.open = q === '' ? true : grpShown > 0;
      });
      countEl.textContent = shown + ' / ' + totalRows + '건 표시 중 · ' + seriesN + '개 시리즈';
    }
    var allOpen = true;
    toggleBtn.addEventListener('click', function () {
      allOpen = !allOpen;
      groups.forEach(function (grp) { grp.open = allOpen; });
      toggleBtn.textContent = allOpen ? '전체 접기' : '전체 펼치기';
    });
    input.addEventListener('input', applyFilter);
    countEl.textContent = totalRows + ' / ' + totalRows + '건 표시 중 · ' + seriesN + '개 시리즈';
}

function filterCouplingDoh() {
    var input = document.getElementById('cplFilter');
    var groups = Array.prototype.slice.call(document.querySelectorAll('#cplGroups .series-group'));
    var countEl = document.getElementById('cplCount');
    var toggleBtn = document.getElementById('cplToggleAll');
    // 건수는 주 규격표 + 표준 내경 표의 모든 행 기준
    var totalRows = document.querySelectorAll('#cplGroups .series-group:not([data-dup]) tbody tr').length;
    var seriesN = 1;
    var HIT_BG = 'rgba(232, 119, 34, 0.22)';
    // 표준 내경 표: 내경 값이 열 머리글(둘째 줄)에 있고 행에는 ●만 있으므로 열 머리글로 검색
    var boreTables = Array.prototype.slice.call(document.querySelectorAll('#cplGroups table.spec-table:not(.spec-main)')).filter(function (t) {
      return t.tHead && t.tHead.rows.length === 2;
    }).map(function (t) {
      var ths = Array.prototype.slice.call(t.tHead.rows[1].cells);
      return { table: t, ths: ths, vals: ths.map(function (th) { return th.textContent.trim(); }) };
    });
    function boreOf(row) { for (var i = 0; i < boreTables.length; i++) { if (boreTables[i].table.contains(row)) return boreTables[i]; } return null; }
    function modelMatch(model, q) {
      // DR□-16 · DRG-16□ 의 □ 는 시리즈 문자 자리 → DRW-16, DRG-16C 등으로도 찾아짐
      if (model.indexOf('□') === -1 || q === '') return false;
      var pat = model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/□/g, '[A-Z]*');
      return new RegExp('^' + pat + '(?![0-9])').test(q);
    }
    function applyFilter() {
      var raw = input.value.trim().toUpperCase();
      var q = raw.replace(/\s+/g, '');
      var qNum = /^\d+(\.\d+)?$/.test(q) ? parseFloat(q) : NaN;
      var shown = 0;
      boreTables.forEach(function (b) { b.ths.forEach(function (th) { th.style.background = ''; }); });
      Array.prototype.forEach.call(document.querySelectorAll('#cplGroups td.bore-hit'), function (td) { td.classList.remove('bore-hit'); td.style.background = ''; });
      groups.forEach(function (grp) {
        var grpShown = 0;
        Array.prototype.slice.call(grp.querySelectorAll('tbody tr')).forEach(function (row) {
          var txt = row.textContent.toUpperCase();
          var match = q === '' || txt.replace(/\s+/g, '').indexOf(q) !== -1 || txt.indexOf(raw) !== -1 || (window.SWS_has && SWS_has(row, raw));
          var b = boreOf(row);
          if (b && q !== '') {
            var model = row.cells[0] ? row.cells[0].textContent.trim().toUpperCase() : '';
            if (!match && modelMatch(model, q)) match = true;
            var col = isNaN(qNum) ? -1 : b.vals.map(parseFloat).indexOf(qNum);
            if (!match && col !== -1) {
              var cell = row.cells[col + 1];
              if (cell && cell.textContent.trim() !== '') {
                match = true;
                cell.classList.add('bore-hit');
                cell.style.background = HIT_BG;
                b.ths[col].style.background = HIT_BG;
              }
            }
          }
          row.style.display = match ? '' : 'none';
          if (match) grpShown++;
        });
        if (!grp.hasAttribute('data-dup')) shown += grpShown;
        grp.open = q === '' ? true : grpShown > 0;
      });
      countEl.textContent = shown + ' / ' + totalRows + '건 표시 중 · ' + seriesN + '개 시리즈';
    }
    var allOpen = true;
    toggleBtn.addEventListener('click', function () {
      allOpen = !allOpen;
      groups.forEach(function (grp) { grp.open = allOpen; });
      toggleBtn.textContent = allOpen ? '전체 접기' : '전체 펼치기';
    });
    input.addEventListener('input', applyFilter);
    countEl.textContent = totalRows + ' / ' + totalRows + '건 표시 중 · ' + seriesN + '개 시리즈';
}

function filterGroupToggle(_p0, _p1, _p2, _p3, _p4) {
    var input = document.getElementById(_p0);
    var grp = document.getElementById(_p1);
    var rows = Array.prototype.slice.call(grp.querySelectorAll('tbody tr'));
    var countEl = document.getElementById(_p2);
    var toggleBtn = document.getElementById(_p3);
    var totalRows = _p4;

    function applyFilter() {
      var q = input.value.trim().toUpperCase();
      var shown = 0;
      rows.forEach(function (row) {
        var match = q === '' || row.textContent.toUpperCase().indexOf(q) !== -1 || (window.SWS_has && SWS_has(row, q, 1));
        row.style.display = match ? '' : 'none';
        if (match) shown++;
      });
      if (q !== '') { grp.open = shown > 0; }
      countEl.textContent = shown + ' / ' + totalRows + '건 표시 중';
    }

    var allOpen = false;
    toggleBtn.addEventListener('click', function () {
      allOpen = !allOpen;
      grp.open = allOpen;
      toggleBtn.textContent = allOpen ? '전체 접기' : '전체 펼치기';
    });

    input.addEventListener('input', applyFilter);
    countEl.textContent = totalRows + '건';
}

function filterBodyCount(_p0, _p1, _p2) {
    var input = document.getElementById(_p0);
    var wrap = document.getElementById(_p1);
    var rows = Array.prototype.slice.call(wrap.querySelectorAll('tbody tr'));
    var countEl = document.getElementById(_p2);
    var totalRows = rows.length;

    function applyFilter() {
      var q = input.value.trim().toUpperCase();
      var shown = 0;
      rows.forEach(function (row) {
        var match = q === '' || row.textContent.toUpperCase().indexOf(q) !== -1 || (window.SWS_has && SWS_has(row, q, 1));
        row.style.display = match ? '' : 'none';
        if (match) shown++;
      });
      countEl.textContent = (q === '' ? totalRows : shown) + ' / ' + totalRows + '건 표시 중';
    }

    input.addEventListener('input', applyFilter);
    countEl.textContent = totalRows + '건';
}

function filterCouplingMt() {
    var input = document.getElementById('mtFilter');
    var groups = Array.prototype.slice.call(document.querySelectorAll('#mtGroups .series-group'));
    var countEl = document.getElementById('mtCount');
    var totalRows = document.querySelectorAll('#mtGroups tbody.cnt tr').length;
    function applyFilter() {
      var q = input.value.trim().toUpperCase().replace(/\s+/g, '');
      var shown = 0;
      groups.forEach(function (grp) {
        var grpShown = 0;
        Array.prototype.slice.call(grp.querySelectorAll('tbody tr')).forEach(function (row) {
          var match = q === '' || row.textContent.toUpperCase().replace(/\s+/g, '').indexOf(q) !== -1 || (window.SWS_has && SWS_has(row, q, 1));
          row.style.display = match ? '' : 'none';
          if (match && row.parentNode.classList.contains('cnt')) grpShown++;
        });
        shown += grpShown;
        grp.open = q === '' || grpShown > 0;
      });
      countEl.textContent = shown + ' / ' + totalRows + '건 표시 중 · ' + 1 + '개 시리즈';
    }
    input.addEventListener('input', applyFilter);
    countEl.textContent = totalRows + ' / ' + totalRows + '건 표시 중 · ' + 1 + '개 시리즈';
}

function filterRowsCount(_p0, _p1, _p2) {
    var input = document.getElementById(_p0);
    var rows = Array.prototype.slice.call(document.querySelectorAll(_p1));
    var countEl = document.getElementById(_p2);

    function updateCount(shown) {
      countEl.textContent = shown + ' / ' + rows.length + '건 표시 중';
    }

    function applyFilter() {
      var q = input.value.trim().toUpperCase();
      var shown = 0;
      rows.forEach(function (row) {
        var match = q === '' || row.textContent.toUpperCase().indexOf(q) !== -1 || (window.SWS_has && SWS_has(row, q, 1));
        row.style.display = match ? '' : 'none';
        if (match) shown++;
      });
      updateCount(shown);
    }

    input.addEventListener('input', applyFilter);
    updateCount(rows.length);
}

function filterSeriesOpen(_p0, _p1, _p2, _p3, _p4, _p5) {
    var input = document.getElementById(_p0);
    var groups = Array.prototype.slice.call(document.getElementById(_p1).querySelectorAll('.series-group'));
    var countEl = document.getElementById(_p2);
    var toggleBtn = document.getElementById(_p3);
    var totalRows = _p4;
    var allOpen = true;
    function label(shown) { countEl.textContent = shown + ' / ' + totalRows + '건 표시 중 · ' + _p5 + '개 시리즈'; }
    function applyFilter() {
      var q = input.value.trim().toUpperCase().replace(/\*/g, '×');
      var shown = 0;
      groups.forEach(function (grp) {
        var grpShown = 0;
        grp.querySelectorAll('tbody tr').forEach(function (row) {
          var txt = row.textContent.toUpperCase();
          var match = q === '' || txt.indexOf(q) !== -1 || txt.replace(/\s+/g, '').indexOf(q.replace(/\s+/g, '')) !== -1 || (window.SWS_has && SWS_has(row, q, 1));
          row.style.display = match ? '' : 'none';
          if (match) grpShown++;
        });
        shown += grpShown;
        grp.open = q === '' ? allOpen : grpShown > 0;
      });
      label(shown);
    }
    toggleBtn.addEventListener('click', function () {
      allOpen = !allOpen;
      groups.forEach(function (grp) { grp.open = allOpen; });
      toggleBtn.textContent = allOpen ? '전체 접기' : '전체 펼치기';
    });
    input.addEventListener('input', applyFilter);
    label(totalRows);
}

function filterRowsCountDr(_p0, _p1, _p2) {
    var input = document.getElementById(_p0);
    var rows = Array.prototype.slice.call(document.querySelectorAll(_p1));
    var countEl = document.getElementById(_p2);
    function norm(s) { return s.toUpperCase().replace(/\s+/g, '').replace(/[X*]/g, '\u00d7'); }
    function updateCount(shown) { countEl.textContent = shown + ' / ' + rows.length + '건 표시 중'; }
    function applyFilter() {
      var q = norm(input.value.trim());
      var shown = 0;
      rows.forEach(function (row) {
        var match = q === '' || norm(row.cells[0].textContent).indexOf(q) === 0;
        row.style.display = match ? '' : 'none';
        if (match) shown++;
      });
      updateCount(shown);
    }
    input.addEventListener('input', applyFilter);
    updateCount(rows.length);
}

function filterChain() {
    // 형번·치수 검색 — 띄어쓰기로 나눈 낱말이 모두 그 줄에 있어야 보임(숫자는 칸 값과 같아야, 글자는 들어 있기만 하면 됨)
    // 일치하는 행이 있는 묶음만 펼침(처음 접혀 있던 묶음은 검색어를 지우면 다시 접힘). "60 2열" → RS60-2
    var input = document.getElementById('pgFilter');
    var countEl = document.getElementById('pgCount');
    var groups = Array.prototype.slice.call(document.querySelectorAll('.series-group'));
    var total = document.querySelectorAll('.series-group tbody tr').length;
    var norm = function (s) { return s.toUpperCase().replace(/[\s\-_]/g, ''); };
    function apply() {
      var q = input.value.trim().replace(/(\d+)\s*([HhSs]{0,2})\s*([1-4])\s*열/, function (a, n, s, k) { return 'RS' + n + s.toUpperCase() + (k === '1' ? '' : '-' + k); });
      var words = q.split(/[\s*×xX,]+/).filter(Boolean);
      var shown = 0;
      groups.forEach(function (grp) {
        var n = 0;
        Array.prototype.slice.call(grp.querySelectorAll('tbody tr')).forEach(function (row) {
          var cells = Array.prototype.slice.call(row.cells).map(function (c) { return c.textContent.trim(); });
          var m = words.every(function (w) {
            return /^\d+(\.\d+)?$/.test(w)
              ? cells.some(function (c) { return c.split(/[^\d.]+/).some(function (x) { return x !== '' && parseFloat(x) === parseFloat(w); }); })
              : cells.some(function (c) { return norm(c).indexOf(norm(w)) !== -1; });
          });
          row.style.display = m ? '' : 'none';
          if (m) n++;
        });
        shown += n;
        grp.open = q === '' ? grp.hasAttribute('data-open') : n > 0;
      });
      countEl.textContent = shown + ' / ' + total + '건 표시 중';
    }
    input.addEventListener('input', apply);
    countEl.textContent = total + ' / ' + total + '건 표시 중';
}

function filterWrapRows(_p0, _p1) {
    var input = document.getElementById(_p0);
    var rows = Array.prototype.slice.call(document.querySelectorAll(_p1));
    if (!input) return;
    input.addEventListener('input', function () {
      var q = input.value.trim().toUpperCase();
      rows.forEach(function (row) {
        row.style.display = (q === '' || row.textContent.toUpperCase().indexOf(q) !== -1 || (window.SWS_has && SWS_has(row, q, 1))) ? '' : 'none';
      });
    });
}

function filterUnitCase(_p0, _p1, _p2, _p3, _p4) {
    var input = document.getElementById(_p0);
    var groupsWrap = document.getElementById(_p1);
    var groups = Array.prototype.slice.call(groupsWrap.querySelectorAll('.series-group'));
    var countEl = document.getElementById(_p2);
    var toggleBtn = document.getElementById(_p3);
    var totalRows = _p4;

    function applyFilter() {
      var q = input.value.trim().toUpperCase();
      var shown = 0;
      groups.forEach(function (grp) {
        var grpRows = Array.prototype.slice.call(grp.querySelectorAll('tbody tr'));
        var grpShown = 0;
        grpRows.forEach(function (row) {
          var match = q === '' || row.textContent.toUpperCase().indexOf(q) !== -1 || (window.SWS_has && SWS_has(row, q, 1));
          row.style.display = match ? '' : 'none';
          if (match) grpShown++;
        });
        shown += grpShown;
        if (q !== '') { grp.open = grpShown > 0; } else { grp.open = false; }
      });
      countEl.textContent = shown + ' / ' + totalRows + '건 표시 중 · ' + 2 + '개 시리즈';
    }

    var allOpen = false;
    toggleBtn.addEventListener('click', function () {
      allOpen = !allOpen;
      if (allOpen) {
        input.value = '';
        groups.forEach(function (grp) {
          Array.prototype.slice.call(grp.querySelectorAll('tbody tr')).forEach(function (row) { row.style.display = ''; });
        });
        countEl.textContent = totalRows + ' / ' + totalRows + '건 표시 중 · ' + 2 + '개 시리즈';
      }
      groups.forEach(function (grp) { grp.open = allOpen; });
      toggleBtn.textContent = allOpen ? '전체 접기' : '전체 펼치기';
    });

    input.addEventListener('input', applyFilter);
    countEl.textContent = totalRows + ' / ' + totalRows + '건 표시 중 · ' + 2 + '개 시리즈';
}

function filterTabSeries(_p0, _p1, _p2, _p3, _p4, _p5, _p6, _p7, _p8) {
    // 이미지 카드 탭: 평소엔 고른 시리즈 하나만 보이고, 검색어가 있으면 모든 탭에서 일치하는 행을 한꺼번에 보여 줌
    var STORAGE_KEY = 'activeTab:' + location.pathname;
    var input = document.getElementById(_p0);
    var btns = Array.prototype.slice.call(document.querySelectorAll(_p1));
    var panels = Array.prototype.slice.call(document.querySelectorAll(_p2));
    var groups = Array.prototype.slice.call(document.querySelectorAll(_p3));
    var countEl = document.getElementById(_p4);
    var toggleBtn = document.getElementById(_p5);
    var totalRows = _p6;
    var current = btns[0].getAttribute('data-tab');
    var allOpen = true;
    function showTab() {
      btns.forEach(function (b) { var on = b.getAttribute('data-tab') === current; b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.classList.remove('no-match'); });
      panels.forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== current; });
    }
    function applyFilter() {
      var q = input.value.trim().toUpperCase();
      var shown = 0;
      groups.forEach(function (grp) {
        var grpRows = Array.prototype.slice.call(grp.querySelectorAll('tbody tr'));
        var grpShown = 0;
        grpRows.forEach(function (row) {
          var match = q === '' || row.textContent.toUpperCase().indexOf(q) !== -1 || (window.SWS_has && SWS_has(row, q, 1));
          row.style.display = match ? '' : 'none';
          if (match) grpShown++;
        });
        shown += grpShown;
        grp.open = q !== '' ? grpShown > 0 : allOpen;
      });
      if (q === '') {
        showTab();
      } else {
        // 검색 중: 일치하는 행이 있는 탭은 모두 펼쳐 보이고, 없는 탭 카드는 흐리게
        panels.forEach(function (p) {
          var hit = Array.prototype.some.call(p.querySelectorAll('tbody tr'), function (r) { return r.style.display !== 'none'; });
          p.hidden = !hit;
          btns.forEach(function (b) {
            if (b.getAttribute('data-tab') === p.getAttribute('data-panel')) {
              b.classList.toggle('no-match', !hit); b.classList.remove('active'); b.setAttribute('aria-selected', 'false');
            }
          });
        });
      }
      countEl.textContent = shown + ' / ' + totalRows + '건 표시 중 · ' + _p7 + '개 시리즈';
    }
    toggleBtn.addEventListener('click', function () {
      allOpen = !allOpen;
      groups.forEach(function (grp) { grp.open = allOpen; });
      toggleBtn.textContent = allOpen ? '전체 접기' : '전체 펼치기';
    });
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        current = btn.getAttribute('data-tab');
        try { sessionStorage.setItem(STORAGE_KEY, current); } catch (e) {}
        if (input.value !== '') { input.value = ''; applyFilter(); } else { showTab(); }
      });
    });
    var saved = null;
    try { saved = sessionStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (saved && btns.some(function (b) { return b.getAttribute('data-tab') === saved; })) current = saved;
    showTab();
    input.addEventListener('input', applyFilter);
    countEl.textContent = totalRows + ' / ' + totalRows + '건 표시 중 · ' + _p8 + '개 시리즈';
}

function filterSealGroups() {
    // 형번·치수 검색 — 일치하는 행만 보이고, 그 행이 있는 묶음만 펼침(처음 접혀 있던 묶음은 검색어를 지우면 다시 접힘)
    var input = document.getElementById('pgFilter');
    var countEl = document.getElementById('pgCount');
    var groups = Array.prototype.slice.call(document.querySelectorAll('.series-group'));
    var total = document.querySelectorAll('.series-group tbody tr').length;
    function apply() {
      var q = input.value.trim().toUpperCase().replace(/\s+/g, '').replace(/[X*]/g, '×');
      var shown = 0;
      groups.forEach(function (grp) {
        var n = 0;
        Array.prototype.slice.call(grp.querySelectorAll('tbody tr')).forEach(function (row) {
          var m = q === '' || row.textContent.toUpperCase().replace(/\s+/g, '').replace(/[X*]/g, '×').indexOf(q) !== -1 || (window.SWS_has && SWS_has(row, q, 1));
          row.style.display = m ? '' : 'none';
          if (m) n++;
        });
        shown += n;
        grp.open = q === '' ? grp.hasAttribute('data-open') : n > 0;
      });
      countEl.textContent = shown + ' / ' + total + '건 표시 중';
    }
    input.addEventListener('input', apply);
    countEl.textContent = total + ' / ' + total + '건 표시 중';
}

function filterSmallTables() {
    var STORAGE_KEY = 'activeTab:' + location.pathname;
    var btns = Array.prototype.slice.call(document.querySelectorAll('.cat-tab-btn'));
    var panels = Array.prototype.slice.call(document.querySelectorAll('.cat-tab-panel'));
    function activate(target) {
      btns.forEach(function (b) { var on = b.getAttribute('data-tab') === target; b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
      panels.forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== target; });
    }
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.getAttribute('data-tab');
        activate(target);
        try { sessionStorage.setItem(STORAGE_KEY, target); } catch (e) {}
      });
    });
    var saved = null;
    try { saved = sessionStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (saved && panels.some(function (p) { return p.getAttribute('data-panel') === saved; })) {
      activate(saved);
    }
}

// mm / 인치 전환 버튼(.unit-bar) — 버튼을 자동 검색칸 오른쪽으로 옮기고, 검색 중에는 두 표를 모두 보여 줌(모양은 styles.css)
function unitTabs(id) {
  var root = document.getElementById(id); if (!root) return;
  var bar = root.querySelector('.unit-bar'); if (!bar) return;
  var sec = root.closest('section') || document;
  var box = sec.querySelector('.auto-spec-search');
  if (box) {
    var row = document.createElement('div');
    row.className = 'search-unit-row';
    box.parentNode.insertBefore(row, box);
    row.appendChild(box); row.appendChild(bar);
    var inp = box.querySelector('input');
    if (inp) inp.addEventListener('input', function () { root.classList.toggle('unit-searching', inp.value.trim() !== ''); });
  }
  bar.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.unit-btn'); if (!b) return;
    root.classList.toggle('unit-inch-on', b.getAttribute('data-unit') === 'inch');
    Array.prototype.forEach.call(bar.querySelectorAll('.unit-btn'), function (x) { x.classList.toggle('active', x === b); });
  });
}
