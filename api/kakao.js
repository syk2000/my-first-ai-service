// 카카오톡 챗봇 스킬 서버 — 카카오 i 오픈빌더의 "스킬"이 이 주소(/api/kakao)로 손님 메시지를 보내면
// 홈페이지 규격 데이터(company-homepage/assets/spec-data.js)에서 찾아 카카오 응답 형식(v2.0)으로 돌려줍니다.
//   형번 검색: "6205", "UC205", "NK8/12"
//   치수 검색: "25 52", "25*52*15", "25x52" (내경 외경 두께 순, 일부만 입력 가능)
const fs = require("fs");
const path = require("path");

const SITE = "https://my-first-ai-service-pi.vercel.app/company-homepage/";
const TOLERANCE = 0.51; // 홈페이지 규격 검색과 같은 허용오차(정수 입력으로 x.5 치수도 찾기)
const MAX_CARDS = 10; // 카카오 캐러셀 최대 카드 수

let DATA = null;
function load() {
  if (DATA) return DATA;
  const src = fs.readFileSync(path.join(process.cwd(), "company-homepage/assets/spec-data.js"), "utf8");
  DATA = new Function(src + ";return { SPEC_DATA, PAGE_GROUP, GROUP_ORDER, specDedupe };")();
  return DATA;
}

const fmt = (v) => (v === null || v === undefined || v === "" ? "-" : String(v));
const norm = (s) => String(s || "").toUpperCase().replace(/[\s\-_]/g, "");

// 메시지를 형번 검색 또는 치수 검색으로 해석
function parse(text) {
  const t = text.trim().replace(/[×xX*＊]/g, " ").replace(/,/g, " ");
  const nums = t.split(/\s+/).filter(Boolean);
  if (nums.length >= 2 && nums.length <= 3 && nums.every((n) => /^\d+(\.\d+)?$/.test(n))) {
    const [d, D, h] = nums.map(Number);
    return { kind: "dim", d, D, h: h === undefined ? null : h };
  }
  return { kind: "model", q: text.trim() };
}

// 같은 조건이면 베어링 → 아답타 … 홈페이지 분류 순서로 보여줌
function groupRank(r) {
  const { PAGE_GROUP, GROUP_ORDER } = load();
  const i = GROUP_ORDER.indexOf(PAGE_GROUP[r.p]);
  return i < 0 ? 99 : i;
}

function search(query) {
  const { SPEC_DATA } = load();
  const near = (v, x) => x === null || (v !== null && v !== undefined && Math.abs(v - x) < TOLERANCE);
  if (query.kind === "dim") {
    return SPEC_DATA.filter((r) => near(r.d, query.d) && near(r.D, query.D) && near(r.h, query.h))
      .sort((a, b) => groupRank(a) - groupRank(b));
  }
  const q = norm(query.q);
  if (!q) return [];
  const hits = SPEC_DATA.filter((r) => norm(r.m).includes(q));
  // 정확히 같은 형번 → 앞부분 일치 → 나머지 순
  const rank = (r) => (norm(r.m) === q ? 0 : norm(r.m).startsWith(q) ? 1 : 2);
  return hits.sort((a, b) => rank(a) - rank(b) || groupRank(a) - groupRank(b));
}

// "2548"처럼 숫자를 붙여 쓴 치수 — 나눠 볼 수 있는 모든 경우(25×48, 25×52×8 …) 중 등록 규격이 있는 것만
function splitDims(s) {
  const ok = (p) => p !== "" && !/^0\d/.test(p);
  const out = [];
  for (let i = 1; i < s.length; i++) {
    const a = s.slice(0, i), b = s.slice(i);
    if (ok(a) && ok(b) && +a < +b) out.push({ kind: "dim", d: +a, D: +b, h: null });
    for (let j = i + 1; j < s.length; j++) {
      const c = s.slice(i, j), e = s.slice(j);
      if (ok(a) && ok(c) && ok(e) && +a < +c && +e < +c) out.push({ kind: "dim", d: +a, D: +c, h: +e });
    }
  }
  return out.map((q) => ({ q, rows: dedupe(search(q)) })).filter((x) => x.rows.length);
}
const dimLabel = (q) => [q.d, q.D, q.h].filter((v) => v !== null).join("×");

// 치수·형태가 같은 규격은 한 번만 — 홈페이지 규격 검색과 같은 규칙(spec-data.js의 specDedupe)
const dedupe = (rows) => load().specDedupe(rows);

// 양식에 넣을 품번 표기 — 기호(○ 등)는 빼고, 오일씰은 "오일씰 TC 25×52×10"처럼
function cardName(r) {
  const m = String(r.m).replace(/[○●△⬠★☆◎]/g, "").replace(/\s+/g, " ").trim();
  return (r.c === "오일씰 형식 및 적용현황" && !/^오일씰/.test(m) ? "오일씰 " : "") + m;
}

// 볼 베어링은 같은 형번이라도 실드 형식(개방·ZZ·DD)을 골라야 해서, 견적·발주 전에 형식을 물어봄
const SHIELD_CATS = { "깊은 홈 볼 베어링": 1, "미니어처 볼 베어링": 1 };
const SHIELDS = [
  ["OPEN (개방형)", ""],
  ["ZZ (철판 실드)", "ZZ"],
  ["DD (고무 실)", "DD"],
];
const hasShield = (m) => /(ZZ|2Z|DDU?|LLU|LLB|2RS\w*|RS|Z|D)$/i.test(m.replace(/\s+/g, ""));
const needsShield = (r) => SHIELD_CATS[r.c] && !hasShield(String(r.m));
// 양식에 들어갈 품번이 실드 표기 없는 볼 베어링 형번인지 (예: "6205" → true, "6205ZZ" → false)
function shieldItem(item) {
  if (!item) return false;
  const n = norm(item);
  return load().SPEC_DATA.some((r) => norm(r.m) === n && needsShield(r));
}
function shieldAsk(kind, model) {
  return {
    outputs: [text(`${model}의 실드 형식을 골라 주세요.\n• OPEN: 실드 없는 개방형\n• ZZ: 양쪽 철판 실드\n• DD: 양쪽 고무 실 (2RS·DDU·LLU와 같은 형식)`)],
    quick: [
      ...SHIELDS.map(([label, sfx]) => ({ label, action: "message", messageText: `${kind} 문의: ${model}${sfx}` })),
      { label: "모름·기타", action: "message", messageText: `${kind} 문의: ${model} (실드 형식 미정)` },
      QUICK[0],
    ],
  };
}

// 형번 뒤에 붙는 실드·틈새 표기(6205ZZ, 6205-2RS, 6205 C3 …)를 떼어 기본 형번을 찾음
const SUFFIX_RE = /[\s\-]*(2RSH|2RS1|2RS|DDU|LLU|LLB|ZZ|2Z|DD|RS|Z|D|NR|ZNR|C3|C4|CM|OPEN|OP)$/i;
function stripSuffix(q) {
  let base = q.trim();
  const sfx = [];
  for (let i = 0; i < 3; i++) {
    const m = base.match(SUFFIX_RE);
    if (!m || base.length - m[0].length < 2) break;
    sfx.unshift(m[1].toUpperCase());
    base = base.slice(0, base.length - m[0].length);
  }
  return sfx.length ? { base, sfx: sfx.join("") } : null;
}

// 정확히 맞는 규격이 없을 때 가까운 규격(치수는 차이가 작은 순, 형번은 앞부분이 많이 같은 순)
function approx(query) {
  const { SPEC_DATA } = load();
  if (query.kind === "dim") {
    const rel = (v, x) => (x === null ? 0 : v === null || v === undefined ? 9 : Math.abs(v - x) / Math.max(x, 1));
    return dedupe(SPEC_DATA.filter((r) => r.d != null && r.D != null)
      .map((r) => ({ r, s: rel(r.d, query.d) + rel(r.D, query.D) + rel(r.h, query.h) }))
      .filter((x) => x.s < 0.6)
      .sort((a, b) => a.s - b.s || groupRank(a.r) - groupRank(b.r))
      .slice(0, 40).map((x) => x.r));
  }
  const q = norm(query.q);
  const common = (m) => { let i = 0; while (i < m.length && i < q.length && m[i] === q[i]) i++; return i; };
  return dedupe(SPEC_DATA.map((r) => ({ r, n: norm(r.m), c: common(norm(r.m)) }))
    .filter((x) => x.c >= Math.max(2, Math.ceil(q.length * 0.5)))
    .sort((a, b) => b.c - a.c || Math.abs(a.n.length - q.length) - Math.abs(b.n.length - q.length) || groupRank(a.r) - groupRank(b.r))
    .slice(0, 40).map((x) => x.r));
}

function searchUrl(query) {
  const p = new URLSearchParams();
  if (query.kind === "dim") {
    p.set("d", query.d);
    p.set("D", query.D);
    if (query.h !== null) p.set("h", query.h);
  } else p.set("name", query.q);
  return SITE + "search-product.html?" + p.toString();
}

const QUICK = [
  { label: "처음으로", action: "message", messageText: "처음" },
  { label: "규격 검색 방법", action: "message", messageText: "도움말" },
  { label: "자주 하는 질문", action: "message", messageText: "자주 하는 질문" },
];

// outputs 배열, 또는 { outputs, quick }(바로가기 버튼을 바꿀 때)
function reply(x) {
  const outputs = Array.isArray(x) ? x : x.outputs;
  const quick = Array.isArray(x) ? QUICK : x.quick;
  return { version: "2.0", template: { outputs, quickReplies: quick } };
}
const text = (t) => ({ simpleText: { text: t } });

const HELP =
  "SWS TECH 규격 검색 챗봇입니다.\n\n" +
  "■ 형번으로 찾기\n예) 6205, UC205, NK8/12\n\n" +
  "■ 치수로 찾기 (내경 외경 두께)\n예) 25 52 15  또는  25*52\n\n" +
  "찾는 규격이 없으면 '견적 문의'를 눌러 주세요.";

// 첫인사 — 오픈빌더 "웰컴 블록"(채팅방에 처음 들어왔을 때)에서 보냄
const WELCOME =
  "안녕하세요, SWS TECH입니다 😊\n" +
  "베어링·오일씰·키·스냅링 등 규격을 바로 찾아드려요.\n\n" +
  "■ 형번으로 찾기\n예) 6205, UC205, NK8/12\n\n" +
  "■ 치수로 찾기 (내경 외경 두께)\n예) 25 52 15\n\n" +
  "견적이나 상담은 아래 '견적 문의' 버튼을 눌러 주세요.";

const PHONE = "02-2613-3040";

// ── 견적·발주 양식: 손님이 길게 눌러 복사 → 채워서 보내면 메일(FormSubmit, 홈페이지 견적문의와 같은 받는 주소)로 접수
const FORMS = {
  quote: {
    tag: "[견적 문의서]",
    name: "견적 문의서",
    fields: ["회사명/담당자", "품번/규격", "수량", "비고"],
    required: ["회사명/담당자", "품번/규격"],
  },
  order: {
    tag: "[발주서]",
    name: "발주서",
    fields: ["회사명/담당자", "연락처", "품번/규격", "수량", "희망 납기", "비고"],
    required: ["회사명/담당자", "연락처", "품번/규격"],
  },
};

function formIntro(form, item, qty) {
  return [
    text(
      `${form.name} 양식이에요.\n` +
      "아래 말풍선을 길게 눌러 복사한 뒤 내용을 채워서 이 채팅방에 보내 주세요.\n\n" +
      "품목이 여러 개면 품번/규격 칸에 '6205 10개, 6206 5개'처럼 이어서 적으시면 돼요." +
      (form.note ? "\n\n" + form.note : "") +
      // 오일씰은 같은 치수라도 형식이 여러 가지 — 손님이 알면 적고, 모르면 담당자가 안내
      (/^오일씰/.test(item || "") ? "\n\n※ 오일씰은 같은 치수라도 형식(립·스프링·외주 구조)이 여러 가지예요. 사용 중인 제품의 형식이나 품번을 아시면 비고에 적어 주세요. 모르시면 담당자가 확인해 맞는 형식을 안내드려요." : "") +
      // 볼 베어링(실드 표기 없는 형번)은 실드 형식을 비고에 적도록 안내
      (shieldItem(item) ? "\n\n※ 볼 베어링은 실드 형식에 따라 품번이 달라요. 비고에 OPEN(개방형)·ZZ(철판 실드)·DD(고무 실, 2RS·DDU와 같은 형식) 중 필요한 형식을 적어 주세요. 모르시면 담당자가 확인해 안내드려요." : "")
    ),
    // 말풍선에는 ':' 없이 "항목 이름 + 띄어쓰기"만 — 손님은 이름 뒤에 바로 내용을 적으면 됨
    text(form.tag + "\n" + form.fields.map((f) => f + " " + ((f === "품번/규격" && item) || (f === "수량" && qty) || "")).join("\n")),
  ];
}

// 양식을 채워 보낸 메시지인지 확인하고 항목별로 나눔
function parseForm(u) {
  const form = Object.values(FORMS).find((f) => u.startsWith(f.tag));
  if (!form) return null;
  const values = {};
  // "회사명/담당자: 홍길동", "회사명/담당자 홍길동", "회사명/담당자홍길동" 모두 인식(':' 없어도 됨)
  const fields = form.fields.slice().sort((a, b) => b.length - a.length);
  for (const line of u.split(/\r?\n/).slice(1)) {
    const t = line.trim();
    const f = fields.find((name) => t.replace(/\s+/g, "").startsWith(name.replace(/\s+/g, "")));
    if (f) {
      // 항목 이름 글자 수만큼(공백 무시) 앞에서 떼고 나머지를 값으로
      let i = 0, k = 0;
      const key = f.replace(/\s+/g, "");
      while (i < t.length && k < key.length) { if (!/\s/.test(t[i])) k++; i++; }
      values[f] = t.slice(i).replace(/^[\s:：\-=]+/, "").trim();
      continue;
    }
    const m = t.match(/^([^:：]+)[:：]\s*(.*)$/);
    if (m) values[m[1].trim()] = m[2].trim();
  }
  const missing = form.required.filter((k) => !values[k]);
  return { form, values, missing };
}

async function sendFormMail(parsed, userId) {
  const { form, values } = parsed;
  const now = new Date(Date.now() + 9 * 3600 * 1000); // 한국 시간
  const stamp = now.toISOString().slice(0, 16).replace("T", " ");
  const docNo = (form === FORMS.order ? "O-" : "Q-") + stamp.replace(/[-: ]/g, "").slice(0, 12);
  const payload = {
    _subject: `[SWS 카카오톡] ${form.name} - ${values["회사명/담당자"] || values["회사명"] || values["담당자"] || "손님"}`,
    _template: "table",
    _captcha: "false",
    "문서 구분": form.name + " (카카오톡 챗봇 접수)",
    "문서번호": docNo,
    "접수일시": stamp,
  };
  form.fields.forEach((f) => (payload[f] = values[f] || "-"));
  if (values["이메일"] || values["이메일(세금계산서)"]) payload._replyto = values["이메일"] || values["이메일(세금계산서)"];
  payload["카카오 사용자 ID"] = userId || "-";
  const { ok } = await postMail(payload);
  return { ok, docNo };
}

// 홈페이지 견적문의와 같은 FormSubmit 주소로 메일 발송
async function postMail(payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3500); // 카카오는 5초 안에 답해야 함
  try {
    const r = await fetch(FORMSUBMIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Referer: SITE + "board.html", Origin: "https://my-first-ai-service-pi.vercel.app" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const res = await r.json().catch(() => ({}));
    return { ok: r.ok && String(res.success) === "true" };
  } catch (e) {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}
const FORMSUBMIT_URL = "https://formsubmit.co/ajax/06c8bd050147ba661797f96176c179f7";

// 손님이 채팅방에 사진·파일을 보내면(카카오가 주소로 전달) 챗봇은 받지 않고 1:1 상담으로 안내
function isImage(u) {
  return /^https?:\/\/\S+$/i.test(u) && /(kakaocdn|kakao\.com|\.(jpe?g|png|gif|webp|heic|pdf)(\?|$))/i.test(u);
}

// 영업시간(평일 09:00~18:00, 한국 시간) 밖이면 안내 한 줄
function closedNote() {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const day = now.getUTCDay();
  const h = now.getUTCHours();
  if (day >= 1 && day <= 5 && h >= 9 && h < 18) return "";
  return "\n\n지금은 영업시간(평일 09:00~18:00)이 아니에요. 다음 영업일 오전부터 순서대로 답변드릴게요.";
}

async function submitForm(parsed, userId) {
  const { form, missing, values } = parsed;
  if (missing.length) {
    return reply([text(`${form.name}에 ${missing.map((m) => "'" + m + "'").join(", ")} 항목이 비어 있어요.\n채워서 다시 보내 주세요.`)]);
  }
  const { ok, docNo } = await sendFormMail(parsed, userId);
  if (ok && form === FORMS.quote) {
    // 견적 접수 안내에 [발주하기] — 견적서를 받은 뒤 이 버튼으로 같은 품번·수량이 채워진 발주서를 바로 열 수 있음
    const item = values["품번/규격"];
    const qty = values["수량"];
    return reply([{
      textCard: {
        title: `견적 문의서가 접수되었어요`,
        description: (`접수번호 ${docNo}\n담당자가 확인 후 이 카카오톡으로 견적서를 보내드릴게요.\n견적서를 받고 주문하실 때 아래 [발주하기]를 눌러 주세요.` + closedNote()).slice(0, 400),
        buttons: [
          { action: "message", label: "발주하기", messageText: "발주 문의: " + item + (qty ? " | 수량 " + qty : "") },
          { action: "phone", label: "전화 문의", phoneNumber: PHONE },
        ],
      },
    }]);
  }
  if (ok) {
    return reply([text(`${form.name}가 접수되었어요. (접수번호 ${docNo})\n${values["연락처"] ? "담당자가 확인 후 적어 주신 연락처로 빠르게 회신드릴게요." : "담당자가 확인 후 이 카카오톡으로 빠르게 회신드릴게요."}\n급하시면 ${PHONE}으로 전화 주세요.` +
      closedNote())]);
  }
  return reply([{
    textCard: {
      title: "자동 접수가 되지 않았어요",
      description: `일시적인 문제로 ${form.name}를 메일로 전달하지 못했어요.\n번거로우시겠지만 전화 또는 카톡 상담으로 알려 주세요.`,
      buttons: [
        { action: "phone", label: "전화 상담", phoneNumber: PHONE },
        { action: "message", label: "카톡 상담", messageText: "카톡 상담" },
      ],
    },
  }]);
}

// ── 상담: 카톡 상담 / 전화 상담
const KAKAO_CONSULT =
  "카톡 상담은 채팅 입력창 아래의 '상담 연결' 버튼을 누르면 담당자와 1:1 대화로 연결돼요.\n" +
  "연결된 뒤 문의 내용을 남겨 주시면 확인 후 답변드릴게요.";
function consult() {
  return [{
    textCard: {
      title: "상담 방법을 선택해 주세요",
      description: `• 카톡 상담: 담당자와 1:1 채팅\n• 전화 상담: ${PHONE}` + closedNote(),
      buttons: [
        { action: "message", label: "카톡 상담", messageText: "카톡 상담" },
        { action: "phone", label: "전화 상담", phoneNumber: PHONE },
      ],
    },
  }];
}

// ── 자주 하는 질문 (홈페이지에 있는 내용으로만 답함)
const FAQ = [
  {
    short: "제품·브랜드",
    q: "어떤 제품과 브랜드가 있나요?",
    a: "베어링·베어링 유닛을 중심으로 아답타·로크너트·와셔, 키&핀, 파워록, 강구·볼 리테이너, 테이크업 유닛, 스냅링, 오일씰·오링·유압씰, 오일게이지, 오일레스 부시, 접시·금형 스프링, 볼 플런저, 유닛 하우징, LM가이드 블록을 취급해요.\n\n" +
      "브랜드는 NACHI·IBC·JIB·WBC·JMC·ILJIN·TYB 제품을 공식 대리점 자격으로 직접 공급하고, 그 밖의 국내외 브랜드도 취급해요.",
    links: [["취급 제품 보기", "about-product.html"], ["취급 브랜드 보기", "brands.html"]],
  },
  {
    short: "형번·규격 입력",
    q: "형번 및 규격 입력하는 방법",
    a: "이 채팅에 형번이나 치수를 그대로 보내 주세요.\n\n" +
      "■ 형번으로 찾기\n예) 6205, UC205, NK8/12 (일부만 입력해도 돼요)\n\n" +
      "■ 치수로 찾기 (형번을 모를 때)\n'내경 외경 두께' 순서로 보내 주세요.\n예) 25 52 15  또는  25*52",
  },
  {
    short: "견적·발주 방법",
    q: "견적/발주하는 법",
    a: "■ 견적: 하단 메뉴의 '견적문의'를 누르면 견적 문의서 양식이 나와요. 양식을 채워 보내 주시면 담당자가 확인 후 회신드려요.\n\n" +
      "■ 발주: 하단 메뉴의 '발주문의'를 누르면 발주서 양식이 나와요. 회사명·연락처·품번·수량을 적어 보내 주시면 접수돼요.\n\n" +
      "규격 검색 결과 카드의 [견적 문의]·[발주 문의] 버튼을 누르면 품번이 채워진 양식이 바로 나와요.",
  },
  {
    short: "카탈로그",
    q: "카탈로그를 볼 수 있나요?",
    a: "홈페이지 카탈로그 페이지에서 볼 수 있어요.",
    link: ["카탈로그 보기", "catalog.html"],
  },
  {
    short: "영업시간",
    q: "영업시간은 어떻게 되나요?",
    a: "평일 09:00 ~ 18:00 (주말·공휴일 휴무)\n\n영업시간 외에 남겨 주신 문의·견적·발주는 다음 영업일에 순서대로 확인해 회신드려요.",
  },
  {
    short: "위치·연락처",
    q: "회사 위치와 연락처는?",
    a: `TEL ${PHONE} · FAX 02-2613-3042\n서울 구로구 경인로53길 32, 미래에코타워 B101·102호`,
    link: ["찾아오시는 길", "introduce.html#directions"],
  },
];
function faqList() {
  return {
    outputs: [text("자주 하는 질문이에요. 아래에서 궁금한 질문을 눌러 주세요.\n\n" + FAQ.map((f, i) => `${i + 1}. ${f.q}`).join("\n"))],
    quick: [...FAQ.map((f) => ({ label: f.short, action: "message", messageText: f.q })), QUICK[0]],
  };
}
function faqAnswer(f) {
  const card = { title: "Q. " + f.q, description: f.a.slice(0, 400) };
  const links = f.links || (f.link ? [f.link] : []);
  if (links.length) card.buttons = links.map(([label, path]) => ({ action: "webLink", label, webLinkUrl: SITE + path }));
  return [{ textCard: card }, text("다른 질문은 'FAQ'를 눌러 주세요.")];
}

function answer(utterance, blockName) {
  const u = (utterance || "").trim();
  if (/웰컴|welcome/i.test(blockName || "")) return reply([text(WELCOME)]);
  // 인사·메뉴 요청은 첫인사와 같은 안내로(이미 대화한 적 있는 손님은 웰컴 블록이 다시 나오지 않음)
  if (!u || /^(안녕|하이|시작|처음|메뉴|hi|hello)/i.test(u)) return reply([text(WELCOME)]);
  if (/^(도움말|사용법|규격 ?검색 ?방법)/.test(u)) return reply([text(HELP)]);
  // FAQ 질문 버튼 — "형번 및 규격…", "견적/발주…"가 아래 키워드 안내에 걸리지 않도록 먼저 확인
  const faq = FAQ.find((f) => f.q.replace(/\s+/g, "") === u.replace(/\s+/g, "").replace(/^Q\.?/, ""));
  if (faq) return reply(faqAnswer(faq));
  // 채팅방 하단 메뉴 [규격&품번] 등 — 숫자 없이 "규격/품번/형번/검색"만 오면 입력 안내
  if (!/\d/.test(u) && /규격|품번|형번|검색/.test(u)) {
    return reply([text(
      "찾으시는 형번이나 치수를 입력해 주세요.\n\n" +
      "■ 형번\n예) 6205, UC205, NK8/12\n\n" +
      "■ 치수 (내경 외경 두께)\n예) 25 52 15  또는  25*52"
    )]);
  }
  // 규격 카드의 [견적 문의]/[발주 문의] 버튼 → 품번이 채워진 양식
  // 볼 베어링 카드의 [견적 문의]/[발주 문의] → 실드 형식 먼저 고르기
  const shield = u.match(/^실드\s*선택\s*[:：]\s*(견적|발주)\s*\|\s*(.+)$/);
  if (shield) return reply(shieldAsk(shield[1], shield[2].trim()));
  // "근사치: 25 48" — 정확한 규격이 없을 때 가까운 규격 보여주기
  const near = u.match(/^근사치\s*[:：]\s*(.+)$/);
  if (near) return showResults(approx(parse(near[1].trim())), parse(near[1].trim()),
    `'${near[1].trim()}'에 정확히 맞는 규격은 없어서 가까운 규격을 보여드려요.\n`, near[1].trim(), true);
  const pick = u.match(/^(견적|발주)\s*문의\s*[:：]\s*(.+)$/);
  if (pick) {
    // "발주 문의: 6205 | 수량 10" — 견적 접수 후 [발주하기] 버튼은 수량까지 넘김
    const [item, qty] = pick[2].split(/\s*\|\s*수량\s*/);
    return reply(formIntro(pick[1] === "발주" ? FORMS.order : FORMS.quote, item.trim(), qty && qty.trim()));
  }
  const compact = u.replace(/\s+/g, "");
  // 숫자 없이 "발주…"·"견적…"으로 시작하면 양식 안내(메뉴 오타 "발주문화" 등도 허용)
  if (!/\d/.test(compact) && /^(발주|주문)/.test(compact)) return reply(formIntro(FORMS.order));
  if ((!/\d/.test(compact) && /^견적/.test(compact)) || /^문의(하기)?$/.test(compact)) return reply(formIntro(FORMS.quote));
  if (/^카톡상담$/.test(compact)) return reply([text(KAKAO_CONSULT + closedNote())]);
  if (/^(고객)?(상담|상담문의|상담하기|전화상담)$/.test(compact)) return reply(consult(compact === "전화상담"));
  if (/^(FAQ|자주(하는|묻는)질문)$/i.test(compact)) return reply(faqList());
  if (/연락처|전화|위치|주소|오시는|팩스/.test(u)) {
    return reply([
      {
        textCard: {
          title: "SWS TECH 연락처",
          description: "TEL 02-2613-3040 · FAX 02-2613-3042\n서울 구로구 경인로53길 32, 미래에코타워 B101·102호",
          buttons: [
            { action: "phone", label: "전화 걸기", phoneNumber: "02-2613-3040" },
            { action: "webLink", label: "찾아오시는 길", webLinkUrl: SITE + "introduce.html#directions" },
          ],
        },
      },
    ]);
  }

  // "UC205 규격 알려줘"처럼 붙은 말은 떼고 검색
  const cleaned = u.replace(/(규격|품번|형번|치수|사이즈|검색|견적|발주|주문|문의|찾아\s*줘|찾아\s*주세요|알려\s*줘|알려\s*주세요|있어요|있나요|\?)/g, " ").replace(/\s+/g, " ").trim() || u;
  let query = parse(cleaned);
  let rows = dedupe(search(query));
  let note = "";
  // 숫자만 붙여 쓴 경우: 그 숫자로 시작하는 형번이 없으면 치수로 나눠서 찾아봄 (2548 → 25×48)
  if (query.kind === "model" && /^\d{3,8}$/.test(cleaned) && !rows.some((r) => norm(r.m).startsWith(cleaned))) {
    const tries = splitDims(cleaned);
    if (tries.length === 1) {
      ({ q: query, rows } = tries[0]);
      note = `'${cleaned}'에 맞는 형번이 없어서 ${dimLabel(query)} 치수로 찾았어요.\n`;
    } else if (tries.length > 1) {
      return reply({
        outputs: [text(`'${cleaned}'에 맞는 형번이 없어요. 어떤 치수를 찾으세요?\n다음부터는 '25 48'처럼 띄어 쓰면 바로 찾을 수 있어요.`)],
        quick: [...tries.slice(0, 9).map((x) => ({ label: dimLabel(x.q) + ` (${x.rows.length}건)`, action: "message", messageText: dimLabel(x.q) })), QUICK[0]],
      });
    }
  }
  // "6205ZZ", "6205-2RS"처럼 실드·틈새 표기가 붙어 정확한 형번이 없으면 표기를 떼고 기본 형번으로 찾음
  let typed = null;
  if (query.kind === "model" && !rows.some((r) => norm(r.m) === norm(cleaned))) {
    const st = stripSuffix(cleaned);
    if (st) {
      const baseRows = dedupe(search({ kind: "model", q: st.base })).filter((r) => norm(r.m) === norm(st.base));
      if (baseRows.length) {
        rows = baseRows;
        typed = { base: st.base, full: cleaned.trim() };
        note = `'${cleaned}'에서 ${st.sfx} 표기를 떼고 ${st.base.trim()} 규격을 보여드려요. 견적·발주 양식에는 ${typed.full}로 들어가요.\n`;
      }
    }
  }
  if (!rows.length) {
    // 정확한 규격이 없으면 가까운 규격을 보여줄지 묻고, 바로 견적 문의도 할 수 있게
    const hasNear = approx(query).length > 0;
    return reply({
      outputs: [text(`'${u}'에 맞는 등록 규격을 찾지 못했어요.` +
        (hasNear ? "\n비슷한 규격을 찾아 드릴까요? 아래 [근사치 보기]를 눌러 주세요." : "\n형번은 일부만, 치수는 '내경 외경 두께' 순서로 입력해 보세요.") +
        "\n찾는 품목을 바로 문의하시려면 [이 품번으로 견적 문의]를 눌러 주세요.")],
      quick: [
        ...(hasNear ? [{ label: "근사치 보기", action: "message", messageText: "근사치: " + cleaned }] : []),
        { label: "이 품번으로 견적 문의", action: "message", messageText: "견적 문의: " + cleaned },
        QUICK[0],
      ],
    });
  }
  return showResults(rows, query, note, cleaned, false, typed);
}

// 규격 카드 목록 — [견적 문의]·[발주 문의]·[상세 보기]
function showResults(rows, query, note, q, isApprox, typed) {
  if (!rows.length) {
    return reply({
      outputs: [text(`'${q}'에 가까운 등록 규격도 찾지 못했어요.\n[이 품번으로 견적 문의]를 누르면 담당자가 확인해 드릴게요.`)],
      quick: [{ label: "이 품번으로 견적 문의", action: "message", messageText: "견적 문의: " + q }, QUICK[0]],
    });
  }
  // 오일씰은 형식(TC·SC·D …)을 알리지 않고 "그 치수 규격이 있다"는 것만 — 같은 치수는 카드 하나로
  const seen = {};
  rows = rows.flatMap((r) => {
    if (r.c !== "오일씰 형식 및 적용현황") return [r];
    const key = [r.d, r.D, r.h].join("|");
    if (seen[key]) return [];
    seen[key] = 1;
    return [Object.assign({}, r, { m: `오일씰 ${r.d}×${r.D}×${r.h}`, p: "oilseal_types.html", alts: [], seal: true })];
  });
  const cards = rows.slice(0, MAX_CARDS).map((r) => {
    // 손님이 "6205ZZ"처럼 실드까지 적었으면 그 형번 그대로 양식에 넣음
    const name = typed && norm(r.m) === norm(typed.base) ? typed.full : cardName(r);
    // 볼 베어링 실드 형식은 카드에서 묻지 않고, 양식 안내에서 비고에 적도록 함(오일씰 형식과 같은 방식)
    const btn = (kind) => ({ action: "message", label: kind + " 문의", messageText: `${kind} 문의: ${name}` });
    return {
      title: name.slice(0, 50),
      description: (r.seal
        ? `오일씰\nd ${fmt(r.d)} · D ${fmt(r.D)} · H ${fmt(r.h)} (mm)\n등록된 규격이 있어요.`
        : `${r.c}\nd ${fmt(r.d)} · D ${fmt(r.D)} · ${load().PAGE_GROUP[r.p] === "베어링" ? "B" : "H"} ${fmt(r.h)} (mm)` +
          r.alts.map((a) => "\n" + a).join("")).slice(0, 230),
      // 카드에서 바로 견적·발주(볼 베어링은 실드 형식을 먼저 고름), 상세 보기는 홈페이지 규격 페이지
      buttons: [btn("견적"), btn("발주"), { action: "webLink", label: "상세 보기", webLinkUrl: SITE + r.p }],
    };
  });
  const head = note + (
    rows.length > MAX_CARDS
      ? `${rows.length}건을 찾았어요. 앞의 ${MAX_CARDS}건을 보여드려요.`
      : `${rows.length}건을 찾았어요.`);
  const outputs = [text(head), { carousel: { type: "textCard", items: cards } }];
  if (rows.length > MAX_CARDS && !isApprox) {
    outputs.push({
      textCard: {
        title: "전체 결과 보기",
        description: "홈페이지 규격 검색에서 전체 결과를 볼 수 있어요.",
        buttons: [{ action: "webLink", label: "전체 결과", webLinkUrl: searchUrl(query) }],
      },
    });
  }
  return reply(outputs);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(200).json({ ok: true, info: "SWS TECH kakao skill — POST only" });
    return;
  }
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const utterance = body && body.userRequest ? body.userRequest.utterance : "";
  const userId = body && body.userRequest && body.userRequest.user ? body.userRequest.user.id : "";
  const blockName = (body && body.userRequest && body.userRequest.block && body.userRequest.block.name) ||
    (body && body.intent && body.intent.name) || "";
  try {
    const u = (utterance || "").trim();
    const parsed = parseForm(u);
    if (parsed) res.status(200).json(await submitForm(parsed, userId));
    else if (isImage(u)) res.status(200).json(reply([text("사진·파일은 챗봇이 받을 수 없어요. 채팅 입력창 아래 '상담 연결'을 누른 뒤 담당자에게 보내 주세요.")]));
    else res.status(200).json(answer(utterance, blockName));
  } catch (e) {
    res.status(200).json(reply([text("일시적인 오류로 답변하지 못했어요. 잠시 후 다시 시도하거나 02-2613-3040으로 연락 주세요.")]));
  }
};
module.exports.answer = answer;
