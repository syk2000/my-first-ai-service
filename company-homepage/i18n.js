// 다국어(EN/JA/ZH) 번역 엔진 — 공통 사전(i18n/common.dict.js → window.I18N_COMMON) + 전체 페이지
// 사전 번들(i18n/pages-bundle.dict.js → window.I18N_PAGES_BUNDLE, 페이지 파일명을 키로 모든
// i18n/pages/<파일명>.json을 합친 것)을 읽어, 한국어 원문과 정확히 일치하는 "리프 요소"(블록 자식이
// 없는 요소)의 innerHTML을 치환합니다. 이 두 .dict.js 파일은 i18n/common.json·i18n/pages-bundle.json을
// 원본으로 생성한 결과물이며, 반드시 이 스크립트보다 먼저 <script>로 로드되어 있어야 합니다.
// 표(tbody) 안의 규격 데이터는 절대 건드리지 않습니다.
(function () {
  var BLOCK_TAGS = { HTML: 1, HEAD: 1, BODY: 1, DIV: 1, SECTION: 1, TABLE: 1, THEAD: 1, TBODY: 1, TR: 1, UL: 1, OL: 1, DETAILS: 1, HEADER: 1, FOOTER: 1, NAV: 1, FORM: 1, ARTICLE: 1 };
  // 자식이 전부 "항목형"(title/meta, th/td, li)이라 BLOCK_TAGS 자식-검사로는 못 잡는 태그 —
  // 이 태그들은 절대 스스로 리프가 되면 안 됨(그래야 자식까지 재귀해서 들어감).
  var NEVER_LEAF_SELF = { HTML: 1, HEAD: 1, BODY: 1, TR: 1, UL: 1, OL: 1 };
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, SVG: 1, TBODY: 1 };
  var ATTR_NAMES = ['placeholder', 'alt', 'aria-label', 'title'];
  var KOREAN_RE = /[가-힣]/;
  // 언어 전환 드롭다운(#langSelect, #mobileLangOptions) 내부는 번역 대상에서 제외합니다.
  // 각 버튼 라벨("한국어/English/中文/日本語")은 그 자체로 다국어 혼합 텍스트라 "한국어"라는
  // 글자 때문에 번역 대상 리프로 잡혀 el.innerHTML이 통째로 교체되면, 거기 달려 있던 클릭
  // 이벤트 리스너가 새로 파싱된 버튼 노드에는 없어서 그 뒤로 언어 전환 버튼이 완전히 먹통이 됩니다.
  function inNoTranslateZone(el) {
    return !!(el.closest && el.closest('#langSelect, #mobileLangOptions'));
  }

  var dict = { en: {}, ja: {}, zh: {} };
  var attrDict = { en: {}, ja: {}, zh: {} };
  var originalHTML = new Map(); // element -> original (Korean) innerHTML
  var originalAttr = new Map(); // element -> { attrName: originalValue }
  var leaves = [];
  var attrEls = [];
  var originalTitle = null; // 브라우저 탭 제목(<title>) 원문 — <head>에 있어 leaves 수집 대상이 아니라 따로 보관
  var currentLang = 'KOR';
  var applying = false;
  var pageDictLoaded = false;
  var requestEpoch = 0; // apply() 호출마다 증가 — 늦게 도착한 이전 요청이 최신 요청을 덮어쓰지 않도록 가드

  function hasKorean(s) { return s && KOREAN_RE.test(s); }
  function normKey(s) {
    s = s.replace(/\s+/g, ' ').trim();
    // 마크업이 시간이 지나며 조금씩 바뀌어도(자기닫힘 태그 </br> 추가 등) 사전 키가 안 깨지도록
    // 흔한 서식 차이를 흡수합니다 — 사전 쪽 키도 동일 함수로 정규화해서 저장합니다.
    s = s.replace(/\s*\/>/g, '>');               // <circle ... /> -> <circle ...>
    s = s.replace(/viewbox=/gi, 'viewBox=');      // viewbox 대소문자 통일
    s = s.replace(/<([a-zA-Z][a-zA-Z0-9]*)([^>]*)>\s*<\/\1>/g, '<$1$2>'); // <x ...></x> -> <x ...>
    return s;
  }

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
      if (el.id === 'langSelect' || el.id === 'mobileLangOptions') return;
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
      if (inNoTranslateZone(el)) continue;
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
    if (originalTitle === null) originalTitle = document.title;
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
    try {
      leaves.forEach(function (el) {
        try {
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
        } catch (e) {
          // 개별 요소 치환 실패가 나머지 요소 전체를 막지 않도록 격리
        }
      });
      attrEls.forEach(function (item) {
        try {
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
        } catch (e) {
          // 개별 속성 치환 실패 격리
        }
      });
      if (originalTitle) {
        var titleTr = lk ? dict[lk][normKey(originalTitle)] : undefined;
        document.title = titleTr !== undefined ? titleTr : originalTitle;
      }
    } finally {
      // 루프 중 예외가 나더라도 applying 플래그가 영구히 true로 멈추지 않도록 보장
      applying = false;
    }
  }

  // 동적으로 생성되는 짧은 한국어 UI 조각(검색 결과 건수, 전체 펼치기/접기 버튼 등) 보조 치환
  var UNIT_WORDS = {
    en: { '건': ' items', '개 시리즈': ' series', '개 그룹': ' groups', '개 d·D 조합': ' d·D combinations', '표시 중': 'shown', '전체 펼치기': 'Expand all', '전체 접기': 'Collapse all' },
    ja: { '건': '件', '개 시리즈': 'シリーズ', '개 그룹': 'グループ', '개 d·D 조합': '通りのd·D組合せ', '표시 중': '表示中', '전체 펼치기': 'すべて展開', '전체 접기': 'すべて折りたたむ' },
    zh: { '건': '个', '개 시리즈': '个系列', '개 그룹': '个组', '개 d·D 조합': '种d·D组合', '표시 중': '显示中', '전체 펼치기': '全部展开', '전체 접기': '全部折叠' }
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
      out = out.replace(/(\d+)\s*개\s*그룹/g, '$1' + UNIT_WORDS[lk]['개 그룹']);
      out = out.replace(/(\d+)\s*개\s*d·D\s*조합/g, '$1' + UNIT_WORDS[lk]['개 d·D 조합']);
      out = out.replace(/표시\s*중/g, UNIT_WORDS[lk]['표시 중']);
      out = out.replace(/(\d+)\s*건/g, '$1' + UNIT_WORDS[lk]['건']);
      if (out !== t) node.textContent = out;
    });
  }

  function mergeDict(target, src) {
    if (!src) return;
    ['en', 'ja', 'zh'].forEach(function (lk) {
      if (!src[lk]) return;
      // 사전 키도 normKey로 정규화해서 저장 — 런타임에 읽는 ko 키와 동일한 정규화를 거치도록 맞춥니다.
      Object.keys(src[lk]).forEach(function (k) {
        target[lk][normKey(k)] = src[lk][k];
      });
    });
  }

  function pageBaseName() {
    var p = location.pathname.split('/').pop() || 'index.html';
    return p.replace(/\.html?$/, '');
  }

  var loadDictsPromise = null;
  function loadDicts() {
    if (loadDictsPromise) return loadDictsPromise;
    // 사전은 fetch()가 아니라 <script> 태그(i18n/common.dict.js, i18n/pages-bundle.dict.js)로
    // window.I18N_COMMON / window.I18N_PAGES_BUNDLE에 미리 실려 옵니다. fetch는 file://로 폴더를
    // 그냥 열었을 때(서버 없이) CORS 때문에 항상 실패하지만, <script src>는 file://에서도 똑같이
    // 동작하므로 로컬에서 더블클릭으로 열어도 번역이 그대로 동작합니다.
    var common = window.I18N_COMMON || null;
    if (common) {
      mergeDict(dict, common.text || common);
      mergeDict(attrDict, common.attrs || {});
    }
    var bundle = window.I18N_PAGES_BUNDLE || null;
    var pageDict = bundle && bundle[pageBaseName()];
    if (pageDict) {
      mergeDict(dict, pageDict.text || pageDict);
      mergeDict(attrDict, pageDict.attrs || {});
    }
    pageDictLoaded = true;
    loadDictsPromise = Promise.resolve();
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
    // 저장된 언어 복원은 common.js의 최초 setLanguage() 호출이 담당합니다(apply에 UI 콜백까지 넘겨줌).
    // 여기서 또 apply()를 호출하면, 그 사이 사용자가 다른 언어를 클릭했을 때 이 늦게 끝나는 호출이
    // 오래된 값으로 덮어써버리는 경합이 생길 수 있어 제거했습니다. 사전은 미리 받아만 둡니다.
    loadDicts();
  }

  function apply(code, onApplied) {
    currentLang = code;
    try { localStorage.setItem('siteLang', code); } catch (e) {}
    requestEpoch += 1;
    var myEpoch = requestEpoch;
    function run() {
      // 이 요청이 떠 있는 동안 더 최신 apply() 호출이 들어왔다면, 그 결과를 덮어쓰지 않고 조용히 버림
      if (myEpoch !== requestEpoch) return;
      applyOnce(code);
      sweepDynamic(document.body);
      if (onApplied) onApplied(code);
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
