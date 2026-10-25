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
      const entry = { m: tr.cells[1].textContent.trim(), u: tr.dataset.p, n: { KOR: tr.dataset.c } };
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

    // 규격표가 있는데 검색창이 없는 페이지에 '형번 / 규격 검색' 칸을 자동으로 붙임
    // (문구는 i18n/common.json 사전으로 번역 — 이 코드는 번역 대상 수집보다 먼저 실행됨)
    (function () {
      const tables = [...document.querySelectorAll("table.spec-table")].filter((t) => t.tBodies.length && !t.closest("#finderResults"));
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
      anchor.parentElement.insertBefore(box, anchor);
      const input = box.querySelector("input");
      const countEl = box.querySelector("#autoSpecCount");
      const rows = tables.flatMap((t) => [...t.tBodies].flatMap((b) => [...b.rows]));
      const norm = (s) => s.toUpperCase().replace(/[\s\-_]/g, "");
      const cells = rows.map((r) => [...r.cells].map((c) => c.textContent.trim()));
      input.addEventListener("input", () => {
        // 띄어쓰기·*·x로 나눈 낱말이 모두 그 줄에 있어야 보임 — 숫자는 칸 값과 같아야, 글자는 들어 있기만 하면 됨
        const words = input.value.trim().split(/[\s*×xX,]+/).filter(Boolean);
        let shown = 0;
        rows.forEach((r, i) => {
          const hit = words.every((w) => /^\d+(\.\d+)?$/.test(w)
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
