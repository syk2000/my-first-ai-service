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

    // 최근 본 품번 기록 — 규격표·검색 결과에서 행을 누르면 그 품번(예: 6205)을 남겨 견적문의(board.html)에서
    // 보여줍니다. sessionStorage를 쓰므로 홈페이지(탭)를 닫으면 기록이 자동으로 초기화됩니다.
    // 항목: { m: 품번, u: 제품 페이지, n: { KOR: 제품 종류, ENG/JPN/CHN: 번역 이름(있으면) } }
    const RECENT_KEY = "recentModels";
    const RECENT_MAX = 20;
    const pageFile = location.pathname.split("/").pop() || "index.html";
    const shortName = (title) => title.split(" | ")[0].trim();

    function readRecent() {
      try { return JSON.parse(sessionStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; }
    }
    function writeRecent(list) {
      try { sessionStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) {}
    }

    // 이 시점엔 번역 적용 전이라 제목이 항상 한국어 — 다른 언어 이름은 페이지 사전에서 가져옴
    const pageKind = (() => {
      const names = { KOR: shortName(document.title) };
      const pageText = window.I18N_PAGE && window.I18N_PAGE.text;
      const LANG_KEYS = { ENG: "en", JPN: "ja", CHN: "zh" };
      Object.keys(LANG_KEYS).forEach((code) => {
        const tr = pageText && pageText[LANG_KEYS[code]] && pageText[LANG_KEYS[code]][document.title];
        if (tr) names[code] = shortName(tr);
      });
      return names;
    })();

    // 클릭한 칸이 속한 행의 품번 — rowspan으로 위 행과 품번 칸을 공유하는 표도 처리
    function modelOf(td) {
      const tr = td.parentElement;
      const tbody = tr.parentElement;
      const heads = [...tbody.closest("table").querySelectorAll("thead th")].map((th) => th.textContent.trim());
      // 모든 열이 품번인 표(예: 키 b×h×L)는 누른 칸 자체가 품번
      if (heads.length > 1 && heads.every((h) => h === heads[0])) return td.textContent.trim();
      const grid = [];
      [...tbody.rows].forEach((row, r) => {
        grid[r] = grid[r] || [];
        let c = 0;
        [...row.cells].forEach((cell) => {
          while (grid[r][c]) c++;
          for (let i = 0; i < cell.rowSpan; i++) {
            for (let j = 0; j < cell.colSpan; j++) (grid[r + i] = grid[r + i] || [])[c + j] = cell;
          }
          c += cell.colSpan;
        });
      });
      const cells = grid[tr.sectionRowIndex] || [];
      // 품번 칸 없이 치수로 구분하는 표(오일씰: d·D·H)는 치수를 이어 붙임
      if (/^d\s*\(/.test(heads[0] || "")) return cells.slice(0, 3).map((c) => c.textContent.trim()).join("×");
      return cells[0] ? cells[0].textContent.trim() : "";
    }

    function showToast(text) {
      let toast = document.getElementById("siteToast");
      if (!toast) {
        toast = document.createElement("div");
        toast.id = "siteToast";
        toast.className = "site-toast";
        toast.setAttribute("role", "status");
        document.body.append(toast);
      }
      toast.textContent = text;
      toast.classList.add("show");
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
    }

    document.addEventListener("click", (e) => {
      const td = e.target.closest("table.spec-table tbody td");
      // 복사하려고 글자를 드래그해 선택한 경우는 기록하지 않음
      if (!td || String(window.getSelection())) return;
      const tr = td.parentElement;
      // 규격 검색 결과 행은 [제품유형, 제품명, …] 순서이고 제품 페이지를 data-p로 갖고 있음
      const entry = tr.dataset.p
        ? { m: tr.cells[1].textContent.trim(), u: tr.dataset.p, n: { KOR: tr.dataset.c } }
        : { m: modelOf(td), u: pageFile, n: pageKind };
      if (!entry.m || entry.m === "-") return;
      writeRecent([entry, ...readRecent().filter((r) => !(r.m === entry.m && r.u === entry.u))].slice(0, RECENT_MAX));
      document.querySelectorAll("tr.row-picked").forEach((r) => r.classList.remove("row-picked"));
      tr.classList.add("row-picked");
      const t = window.I18N ? window.I18N.t : (s) => s;
      showToast(t("최근 본 품번에 추가했습니다") + ": " + entry.m);
    });

    // 견적문의의 품번 링크(…html#pick=6205)로 들어오면 해당 행으로 스크롤해 표시
    if (location.hash.startsWith("#pick=")) {
      const model = decodeURIComponent(location.hash.slice(6));
      const hit = [...document.querySelectorAll("table.spec-table tbody td")].find((td) => td.textContent.trim() === model);
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

    // 우클릭 / 드래그 방지 (참고: 규격 검색 결과표·입력창은 CSS에서 선택·복사 예외 처리됨)
    document.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("dragstart", (e) => {
      if (!e.target.closest("input, textarea, .spec-table")) e.preventDefault();
    });
