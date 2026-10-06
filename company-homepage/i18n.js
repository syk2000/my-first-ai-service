// 다국어(EN/JA/ZH) 번역 엔진 — 공통 사전(i18n/common.json) + 전체 페이지 사전 번들(i18n/pages-bundle.json,
// 페이지 파일명을 키로 모든 i18n/pages/<파일명>.json을 합친 것)을 불러와, 한국어 원문과 정확히 일치하는
// "리프 요소"(블록 자식이 없는 요소)의 innerHTML을 치환합니다.
// 표(tbody) 안의 규격 데이터는 절대 건드리지 않습니다.
(function () {
  var BLOCK_TAGS = { HTML: 1, HEAD: 1, BODY: 1, DIV: 1, SECTION: 1, TABLE: 1, THEAD: 1, TBODY: 1, TR: 1, UL: 1, OL: 1, DETAILS: 1, HEADER: 1, FOOTER: 1, NAV: 1, FORM: 1, ARTICLE: 1 };
  // 자식이 전부 "항목형"(title/meta, th/td, li)이라 BLOCK_TAGS 자식-검사로는 못 잡는 태그 —
  // 이 태그들은 절대 스스로 리프가 되면 안 됨(그래야 자식까지 재귀해서 들어감).
  var NEVER_LEAF_SELF = { HTML: 1, HEAD: 1, BODY: 1, TR: 1, UL: 1, OL: 1 };
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, SVG: 1, TBODY: 1 };
  var ATTR_NAMES = ['placeholder', 'alt', 'aria-label', 'title'];
  var KOREAN_RE = /[가-힣]/;

  var dict = { en: {}, ja: {}, zh: {} };
  var attrDict = { en: {}, ja: {}, zh: {} };
  var originalHTML = new Map(); // element -> original (Korean) innerHTML
  var originalAttr = new Map(); // element -> { attrName: originalValue }
  var leaves = [];
  var attrEls = [];
  var currentLang = 'KOR';
  var applying = false;
  var pageDictLoaded = false;

  function hasKorean(s) { return s && KOREAN_RE.test(s); }
  function normKey(s) { return s.replace(/\s+/g, ' ').trim(); }

  function isLeaf(el) {
    if (SKIP_TAGS[el.tagName] || NEVER_LEAF_SELF[el.tagName]) return false;
    for (var i = 0; i < el.children.length; i++) {
      if (BLOCK_TAGS[el.children[i].tagName]) return false;
    }
    return hasKorean(el.textContent);
  }

  function collect(root) {
    (function walk(el) {
      if (!el || el.nodeType !== 1) return;
      if (SKIP_TAGS[el.tagName]) return;
      if (isLeaf(el)) {
        leaves.push(el);
        return;
      }
      for (var i = 0; i < el.children.length; i++) walk(el.children[i]);
    })(root);

    var all = root.querySelectorAll('*');
    for (var j = 0; j < all.length; j++) {
      var el = all[j];
      if (el.closest('tbody')) continue;
      for (var k = 0; k < ATTR_NAMES.length; k++) {
        var a = ATTR_NAMES[k];
        var v = el.getAttribute(a);
        if (v && hasKorean(v)) {
          attrEls.push({ el: el, attr: a });
        }
      }
    }
  }

  function cacheOriginals() {
    leaves.forEach(function (el) {
      if (!originalHTML.has(el)) originalHTML.set(el, el.innerHTML);
    });
    attrEls.forEach(function (item) {
      var key = item.el;
      if (!originalAttr.has(key)) originalAttr.set(key, {});
      var rec = originalAttr.get(key);
      if (rec[item.attr] === undefined) rec[item.attr] = item.el.getAttribute(item.attr);
    });
  }

  function langKey(code) {
    if (code === 'ENG') return 'en';
    if (code === 'JPN') return 'ja';
    if (code === 'CHN') return 'zh';
    return null; // KOR
  }

  function applyOnce(code) {
    var lk = langKey(code);
    applying = true;
    leaves.forEach(function (el) {
      var ko = originalHTML.get(el);
      if (ko === undefined) return;
      if (!lk) {
        if (el.innerHTML !== ko) el.innerHTML = ko;
        return;
      }
      var tr = dict[lk][normKey(ko)];
      if (tr !== undefined && el.innerHTML !== tr) {
        el.innerHTML = tr;
      } else if (tr === undefined && el.innerHTML !== ko) {
        el.innerHTML = ko; // 번역 없으면 한국어 원문 유지
      }
    });
    attrEls.forEach(function (item) {
      var rec = originalAttr.get(item.el);
      if (!rec) return;
      var ko = rec[item.attr];
      if (ko === undefined) return;
      if (!lk) {
        item.el.setAttribute(item.attr, ko);
        return;
      }
      var tr = attrDict[lk][normKey(ko)];
      item.el.setAttribute(item.attr, tr !== undefined ? tr : ko);
    });
    applying = false;
  }

  // 동적으로 생성되는 짧은 한국어 UI 조각(검색 결과 건수, 전체 펼치기/접기 버튼 등) 보조 치환
  var UNIT_WORDS = {
    en: { '건': ' items', '개 시리즈': ' series', '표시 중': 'shown', '전체 펼치기': 'Expand all', '전체 접기': 'Collapse all' },
    ja: { '건': '件', '개 시리즈': 'シリーズ', '표시 중': '表示中', '전체 펼치기': 'すべて展開', '전체 접기': 'すべて折りたたむ' },
    zh: { '건': '个', '개 시리즈': '个系列', '표시 중': '显示中', '전체 펼치기': '全部展开', '전체 접기': '全部折叠' }
  };

  function sweepDynamic(root) {
    var lk = langKey(currentLang);
    if (!lk) return;
    var nodes = root.querySelectorAll('.finder-tip, .spec-toolbar-btn, .series-count, [id$="Count"], [id$="ToggleAll"]');
    nodes.forEach(function (node) {
      if (node.closest('tbody')) return;
      var t = node.textContent;
      if (!t || !hasKorean(t)) return;
      var out = t;
      out = out.replace(/전체\s*펼치기/g, UNIT_WORDS[lk]['전체 펼치기']);
      out = out.replace(/전체\s*접기/g, UNIT_WORDS[lk]['전체 접기']);
      out = out.replace(/(\d+)\s*개\s*시리즈/g, '$1' + UNIT_WORDS[lk]['개 시리즈']);
      out = out.replace(/표시\s*중/g, UNIT_WORDS[lk]['표시 중']);
      out = out.replace(/(\d+)\s*건/g, '$1' + UNIT_WORDS[lk]['건']);
      if (out !== t) node.textContent = out;
    });
  }

  function fetchJSON(url) {
    return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  function mergeDict(target, src) {
    if (!src) return;
    ['en', 'ja', 'zh'].forEach(function (lk) {
      if (src[lk]) Object.assign(target[lk], src[lk]);
    });
  }

  function pageBaseName() {
    var p = location.pathname.split('/').pop() || 'index.html';
    return p.replace(/\.html?$/, '');
  }

  var loadDictsPromise = null;
  function loadDicts() {
    if (loadDictsPromise) return loadDictsPromise;
    // 페이지별 사전을 187개 개별 파일 대신 하나의 번들(pages-bundle.json)로 받아옵니다.
    // 배포 대상(Claude Artifact 등)의 파일 개수 제한 때문에 개별 파일이 통째로 누락되는 걸 막기 위함입니다.
    var tasks = [fetchJSON('i18n/common.json'), fetchJSON('i18n/pages-bundle.json')];
    loadDictsPromise = Promise.all(tasks).then(function (results) {
      var common = results[0];
      if (common) {
        mergeDict(dict, common.text || common);
        mergeDict(attrDict, common.attrs || {});
      }
      var bundle = results[1];
      var pageDict = bundle && bundle[pageBaseName()];
      if (pageDict) {
        mergeDict(dict, pageDict.text || pageDict);
        mergeDict(attrDict, pageDict.attrs || {});
      }
      pageDictLoaded = true;
    });
    return loadDictsPromise;
  }

  var observer = null;
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(function () {
      if (applying) return;
      sweepDynamic(document.body);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function init() {
    collect(document.body);
    cacheOriginals();
    startObserver();
    var saved = null;
    try { saved = localStorage.getItem('siteLang'); } catch (e) {}
    var code = saved || 'KOR';
    loadDicts().then(function () {
      apply(code);
    });
  }

  function apply(code) {
    currentLang = code;
    try { localStorage.setItem('siteLang', code); } catch (e) {}
    function run() {
      applyOnce(code);
      sweepDynamic(document.body);
    }
    if (pageDictLoaded) {
      run();
    } else {
      loadDicts().then(run);
    }
  }

  window.I18N = { init: init, apply: apply, getSaved: function () {
    try { return localStorage.getItem('siteLang') || 'KOR'; } catch (e) { return 'KOR'; }
  } };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
