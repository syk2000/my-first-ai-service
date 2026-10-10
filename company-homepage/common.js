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

    // 최근 본 제품 기록 — 제품 페이지를 볼 때마다 이름을 남겨 견적문의(board.html)에서 보여줍니다.
    // sessionStorage를 쓰므로 홈페이지(탭)를 닫으면 기록이 자동으로 초기화됩니다.
    const RECENT_KEY = "recentProducts";
    const NON_PRODUCT_PAGES = ["", "index", "main", "introduce", "about-product", "brands", "board", "notice", "catalog", "search-product"];
    const pageFile = location.pathname.split("/").pop();
    const shortName = (title) => title.split(" | ")[0].trim();

    function readRecent() {
      try { return JSON.parse(sessionStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; }
    }
    function writeRecent(list) {
      try { sessionStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) {}
    }

    if (!NON_PRODUCT_PAGES.includes(pageFile.replace(/\.html?$/, ""))) {
      // 이 시점엔 번역 적용 전이라 제목이 항상 한국어 — 다른 언어 이름은 페이지 사전에서 함께 저장
      const names = { KOR: shortName(document.title) };
      const pageText = window.I18N_PAGE && window.I18N_PAGE.text;
      const LANG_KEYS = { ENG: "en", JPN: "ja", CHN: "zh" };
      Object.keys(LANG_KEYS).forEach((code) => {
        const tr = pageText && pageText[LANG_KEYS[code]] && pageText[LANG_KEYS[code]][document.title];
        if (tr) names[code] = shortName(tr);
      });
      const list = readRecent().filter((r) => r.u !== pageFile);
      list.unshift({ u: pageFile, n: names });
      writeRecent(list.slice(0, 12));
    }

    // 우클릭 / 드래그 방지 (참고: 규격 검색 결과표·입력창은 CSS에서 선택·복사 예외 처리됨)
    document.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("dragstart", (e) => {
      if (!e.target.closest("input, textarea, .spec-table")) e.preventDefault();
    });
