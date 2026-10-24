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
// 실드·실 표기(메이커별): 철판 Z·ZZ / 고무 D·DD(국산), DU·DDU·V·VV(NSK), LU·LLU·LB·LLB·LH·LLH(NTN), RS·2RS(공통), NSE·2NSE(NACHI)
const hasShield = (m) => /(ZZ|2Z|Z|DDU|DU|DD|D|VV|V|LLU|LU|LLB|LB|LLH|LH|2RS\w*|RS|2RU|RU|2NSE|NSE)$/i.test(m.replace(/\s+/g, ""));
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

// 손님 말에 들어 있는 품목 이름 → [찾을 때 뗄 말, 분류(r.c) 조건, 안내용 이름]
const CATEGORY_WORDS = [
  [/E\s*링|이\s*링|E형\s*멈춤\s*링/i, /E형 멈춤링/, "E형 멈춤링"],
  [/C형\s*멈춤\s*링|스냅\s*링|멈춤\s*링|C\s*링|씨\s*링|스톱\s*링/i, /멈춤링|스냅링|스톱링/, "스냅링·멈춤링"],
  [/오링|O\s*링|o-?ring/i, /오링/, "오링"],
  [/스프링\s*핀|핀/, /핀/, "핀"],
  [/로크\s*너트|록\s*너트|너트/, /너트/, "너트"],
  [/와셔/, /와셔/, "와셔"],
  [/반달\s*키|사각\s*키|라운드\s*키|키\s*홈|(^|\s)키(?=\s|\d|$)/, /키/, "키"],
  [/금형\s*스프링|접시\s*스프링|스프링/, /스프링/, "스프링"],
  [/부쉬|부시|부싱/, /부쉬|부시|부싱/, "부시"],
  [/하우징/, /하우징/, "하우징"],
];

// 형번 뒤에 붙는 실드·틈새 표기(6205ZZ, 6205-2RS, 6205 C3 …)를 떼어 기본 형번을 찾음
// (리니어 부시: UU 양쪽 실, U 한쪽 실, OP 개방형, AJ 조정형 — LM20UU, LM20U, LM20UU-OP, LMF20LUU)
const SUFFIX_RE = /[\s\-]*(2RSH|2RS1|2RS|DDU|DU|LLU|LU|LLB|LB|LLH|LH|VV|2NSE|NSE|2RU|RU|ZZ|2Z|DD|RS|Z|D|V|NR|ZNR|C3|C4|CM|OPEN|OP|UU|U|AJ)$/i;
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
      (shieldItem(item) ? "\n\n※ 볼 베어링은 실드 형식에 따라 품번이 달라요. 비고에 OPEN(개방형)·Z/ZZ(한쪽/양쪽 철판 실드)·D/DD(한쪽/양쪽 고무 실) 중 필요한 형식을 적어 주세요. 메이커 표기(NTN LU·LLU, NSK DU·DDU, 2RS 등)로 적으셔도 돼요. 모르시면 담당자가 확인해 안내드려요." : "") +
      // 리니어 부시(LM·LMF·LMK·LMH, 실 표기 없음)는 실 유무를 비고에 적도록 안내
      (/^LM[FKH]?\d/i.test((item || "").replace(/\s+/g, "")) && !/\d+L?(UU|U|OP|AJ)/i.test((item || "").replace(/\s+/g, "")) ? "\n\n※ 리니어 부시는 실 형식에 따라 품번이 달라요. 비고에 OPEN(실 없음)·UU(양쪽 고무 실)·U(한쪽 고무 실) 중 필요한 형식을 적어 주세요. 모르시면 담당자가 확인해 안내드려요." : "")
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
// 공휴일(평일에 걸린 날만, 대체공휴일 포함) — 해마다 인사혁신처 공휴일 발표에 맞춰 추가
const HOLIDAYS = {
  "2026-01-01": "신정", "2026-02-16": "설날 연휴", "2026-02-17": "설날", "2026-02-18": "설날 연휴",
  "2026-03-02": "삼일절 대체공휴일", "2026-05-01": "노동절", "2026-05-05": "어린이날", "2026-05-25": "부처님오신날 대체공휴일",
  "2026-06-03": "지방선거일", "2026-07-17": "제헌절", "2026-08-17": "광복절 대체공휴일",
  "2026-09-24": "추석 연휴", "2026-09-25": "추석", "2026-10-05": "개천절 대체공휴일", "2026-10-09": "한글날", "2026-12-25": "성탄절",
  "2027-01-01": "신정", "2027-02-08": "설날 연휴", "2027-02-09": "설날 대체공휴일", "2027-03-01": "삼일절",
  "2027-05-03": "노동절 대체공휴일", "2027-05-05": "어린이날", "2027-05-13": "부처님오신날", "2027-07-19": "제헌절 대체공휴일",
  "2027-08-16": "광복절 대체공휴일", "2027-09-14": "추석 연휴", "2027-09-15": "추석", "2027-09-16": "추석 연휴",
  "2027-10-04": "개천절 대체공휴일", "2027-10-11": "한글날 대체공휴일", "2027-12-27": "성탄절 대체공휴일",
};

function closedNote() {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const day = now.getUTCDay();
  const h = now.getUTCHours();
  const holiday = HOLIDAYS[now.toISOString().slice(0, 10)];
  if (holiday) return `\n\n오늘은 ${holiday}이라 쉬어요. 다음 영업일 오전부터 순서대로 답변드릴게요.`;
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
    short: "재고·납기·가격",
    q: "재고·납기·가격은 어떻게 알 수 있나요?",
    a: "품목과 수량에 따라 달라서, 견적 문의를 남겨 주시면 담당자가 재고·납기·단가를 확인해 안내드려요.\n\n" +
      "규격 검색 결과 카드의 [견적 문의]를 누르면 품번이 채워진 양식이 바로 나와요.",
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
// ── 제품 문의 자주 하는 질문 (일반적인 기술 정보 + 문의 방법만 — 회사 정책은 넣지 않음)
const PRODUCT_FAQ = [
  {
    short: "실드 형식 차이",
    g: "베어링",
    q: "볼 베어링 실드 형식(OPEN·ZZ·DD)은 어떻게 다른가요?",
    a: "• OPEN(개방형): 실드가 없어요. 윤활유를 직접 관리하는 곳에 써요.\n" +
      "• Z/ZZ(철판 실드): 한쪽/양쪽에 철판 덮개. 회전이 가볍고 고속에 유리하지만 물·미세먼지 차단은 약해요.\n" +
      "• D/DD(고무 실): 한쪽/양쪽에 고무 실. 먼지·물 차단이 좋고 회전 저항은 조금 커요.\n\n" +
      "기존 제품에 적힌 표기를 그대로 알려 주시면 같은 형식으로 안내드려요.",
  },
  {
    short: "DD·VV 차이",
    g: "베어링",
    q: "일제 베어링의 DD(DDU)와 VV는 어떻게 다른가요?",
    a: "둘 다 양쪽 고무 실이지만 실이 닿는 방식이 달라요.\n" +
      "• DDU(NSK)·LLU(NTN): 접촉식 — 실 립이 내륜에 닿아요. 먼지·물 차단이 가장 좋지만 회전 저항과 열이 조금 있어 고속에는 불리해요.\n" +
      "• VV(NSK)·LLB(NTN): 비접촉식 — 실이 내륜에 닿지 않고 아주 좁은 틈을 둬요. 회전이 가볍고 고속에 유리하며, 먼지 차단은 접촉식보다 약하지만 철판 실드(ZZ)보다는 좋아요.\n\n" +
      "기존 품번의 표기를 그대로 알려 주시면 같은 방식으로 안내드려요.",
  },
  {
    short: "메이커별 표기",
    g: "베어링",
    q: "메이커마다 실드 표기가 다른데 같은 형식인가요?",
    a: "같은 형식을 메이커마다 다르게 표기해요.\n" +
      "• 양쪽 철판 실드: ZZ (SKF는 2Z)\n" +
      "• 양쪽 고무 실: DD(국산), DDU(NSK), LLU(NTN), 2RS(SKF 등), 2NSE(NACHI)\n" +
      "• 한쪽만 있는 형식: Z, D, DU, LU, RS 등\n\n" +
      "세부 구조(접촉·비접촉 등)는 메이커마다 조금씩 달라서, 기존 품번을 알려 주시면 맞는 제품으로 안내드려요.",
  },
  {
    short: "다른 메이커 대체",
    g: "베어링",
    q: "다른 메이커 제품으로 바꿔 써도 되나요?",
    a: "같은 형번이면 국제 규격(ISO)에 따라 내경·외경·폭 같은 주요 치수가 같아서 대부분 바꿔 쓸 수 있어요.\n" +
      "다만 정밀도 등급, 내부틈새(C3 등), 케이지·그리스 사양은 다를 수 있어요. 사용하시는 기계나 조건을 함께 알려 주시면 맞는 제품을 안내드려요.",
  },
  {
    short: "C3·CM 뜻",
    g: "베어링",
    q: "형번 뒤의 C3·CM은 무슨 뜻인가요?",
    a: "베어링 안쪽 틈새(내부틈새)의 크기를 나타내요.\n" +
      "• 표기 없음(CN): 보통 틈새\n" +
      "• C2: 보통보다 작음\n" +
      "• C3: 보통보다 큼 — 열이 많이 나거나 단단히 끼워 쓰는 곳에 써요.\n" +
      "• C4·C5: C3보다 더 큼\n" +
      "• CM: 전동기(모터)용 틈새 — 소음·진동을 줄이도록 틈새 범위를 좁게 관리한 것으로, 일본 메이커(NSK·NTN 등)가 써요.\n\n" +
      "기존 제품에 적힌 틈새 표기를 견적·발주 때 품번에 그대로 적어 주세요.",
  },
  {
    short: "오일씰 형식",
    g: "오일씰",
    q: "오일씰 형식(TC·SC·VC 등)은 어떻게 고르나요?",
    a: "기존 제품에 적힌 형식을 그대로 쓰시는 게 가장 확실해요. 형식은 구조에 따라 나뉘어요.\n" +
      "• TC: 외주고무 + 먼지막이 립 + 스프링\n" +
      "• SC: 외주고무 + 단일 립 + 스프링\n" +
      "• TB·SB: TC·SC와 같은 구조에 외주가 금속\n" +
      "• VC·VB: 스프링 없음 — 압력이 걸리는 곳에는 쓸 수 없어요.\n\n" +
      "형식을 모르시면 치수(내경·외경·두께)와 쓰는 곳을 알려 주세요. 담당자가 확인해 안내드려요.",
  },
  {
    short: "TC·TB·TCV 차이",
    g: "오일씰",
    q: "오일씰 TC·TB(외철)·TCV는 어떻게 다른가요?",
    a: "셋 다 먼지막이 립과 스프링이 있어요. (NOK 카탈로그 기준)\n" +
      "• TC: 외주 고무 — 하우징에 밀착돼 밀봉이 좋고 알루미늄 하우징에도 써요. 압력 0.03MPa(0.3kgf/cm²) 이하.\n" +
      "• TB(외철): 외주 금속 — 잘 빠지지 않고 위치가 정확해요. 압력이 걸리는 곳과 알루미늄처럼 열에 많이 늘어나는 하우징에는 안 맞아요.\n" +
      "• TCV: 립을 단단하게 한 내압형 — 비교적 작은 축, 중간 압력용. 순간 최대 압력 0.3MPa(3kgf/cm²)까지. 더 높으면 TCN(0.98MPa)·TCZ(2.0MPa)를 써요.",
  },
  {
    short: "오일씰 재질·온도",
    g: "오일씰",
    q: "오일씰 립 재질별 사용 온도는 어떻게 되나요?",
    a: "NOK 오일씰 카탈로그 기준이에요.\n" +
      "• NBR(니트릴): -30~120℃ — 표준 재질, 기름·그리스용\n" +
      "• HNBR(수소화 니트릴): -25~130℃ — NBR보다 열·기름에 강함\n" +
      "• ACM(아크릴): -15~150℃ — 기름에 강하고 열에도 강함, 물에는 약함\n" +
      "• 실리콘(VMQ): -45~170℃ — 고온·저온에 강함, 물·알칼리에는 약함\n" +
      "• FKM(바이톤): -15~200℃ — 열·기름·약품에 모두 강함\n\n" +
      "립은 회전 마찰열로 주변보다 뜨거워질 수 있어요. 쓰는 곳의 온도와 기름 종류를 알려 주시면 맞는 재질로 안내드려요.",
  },
  {
    short: "오링 계열 차이",
    g: "오링·유압씰",
    q: "오링 P·G·S·V·AN 계열은 어떻게 다른가요?",
    a: "• P계열: 운동용 — 유압·공압 실린더의 피스톤·로드처럼 움직이는 곳\n" +
      "• G계열: 고정용 — 플랜지·커버처럼 움직이지 않는 곳\n" +
      "• S계열: 단면이 가는 소형 치수 계열\n" +
      "• V계열: 진공 플랜지용 — 단면이 굵은 대형\n" +
      "• AN계열: 미국 AS568 표준 — 미국·유럽 장비에 많이 써요.\n\n" +
      "P·G·S·V는 일본 JIS B 2401 기준이에요. 기존 오링의 계열과 번호(예: P20)를 알려 주시면 같은 규격으로 안내드려요.",
  },
  {
    short: "오링 재질·온도",
    g: "오링·유압씰",
    q: "오링 재질(NBR·FKM 등)별 사용 온도는 어떻게 되나요?",
    a: "NOK 오링 카탈로그 기준이에요. (괄호: 잠깐 견디는 최고 온도)\n" +
      "• NBR(니트릴, JIS 1종A): -24~100℃ (120℃) — 가장 많이 쓰는 기본 재질, 기름·그리스용\n" +
      "• HNBR(수소화 니트릴): -22~110℃ (130℃) — NBR보다 열·기름에 강함\n" +
      "• FKM(바이톤, JIS 4종D): -16~200℃ (220℃) — 고온, 연료·합성유·약품용\n" +
      "• EPDM: -49~130℃ (150℃) — 물·스팀·브레이크액용, 기름(광유)에는 못 씀\n" +
      "• 실리콘(VMQ): -48~200℃ (220℃) — 고온·저온 모두 강함\n\n" +
      "쓰는 곳의 온도와 닿는 유체를 알려 주시면 맞는 재질로 안내드려요.",
  },
  {
    short: "멈춤링 종류",
    g: "스냅링",
    q: "멈춤링 S형·R형·E형·C형은 어떻게 다른가요?",
    a: "• S형(축용 C형): 축 바깥 홈에 끼워 부품이 축 방향으로 빠지지 않게 잡아요.\n" +
      "• R형(구멍용 C형): 구멍 안쪽 홈에 끼워 하우징 속 베어링 등을 잡아요.\n" +
      "S·R형은 전용 플라이어로 벌리거나 오므려서 끼워요.\n" +
      "• E형(E링): 축 홈에 옆에서 눌러 끼워요. 공구 없이도 끼울 수 있어 소형 부품에 많이 써요.\n" +
      "• C형(크레센트): E형처럼 옆에서 끼우지만 몸체가 넓어 더 큰 힘을 견뎌요.",
  },
  {
    short: "멈춤링 호칭",
    g: "스냅링",
    q: "멈춤링 호칭 번호(S-20, ETW-5 등)는 무엇을 뜻하나요?",
    a: "• S형: 끼우는 축의 지름 (S-20 = 축 지름 20mm)\n" +
      "• R형: 끼우는 구멍의 지름 (R-20 = 구멍 지름 20mm)\n" +
      "• E형: 축에 판 홈의 지름 기준이라 축 지름보다 작아요. (ETW-5 = 홈 지름 5mm)\n\n" +
      "축이나 구멍 지름을 알려 주시면 맞는 호칭으로 안내드려요. 이 채팅에 '스냅링 20'처럼 보내셔도 찾아드려요.",
  },
  {
    short: "재질·표면처리",
    g: "스냅링",
    q: "멈춤링 재질·경도·표면처리는 어떻게 되나요?",
    a: "C형 멈춤링(S·R형 등) 당사 규격 기준이에요.\n" +
      "• 재질: 스프링강이 기본, 스프링용 스테인리스강은 주문 생산\n" +
      "• 경도: HRC 44~52\n" +
      "• 표면처리: 인산피막처리(A.C.P)가 표준, 요청하시면 아연(Zn) 도금도 가능\n\n" +
      "녹이 걱정되는 곳이면 견적 문의 때 비고에 '스테인리스' 또는 '아연 도금'이라고 적어 주세요.",
  },
  {
    short: "홈 없는 축",
    g: "스냅링",
    q: "축에 홈이 없어도 쓸 수 있는 멈춤링이 있나요?",
    a: "네, 홈 가공 없이 쓰는 형식이 있어요.\n" +
      "• G형(그립 링, GTW): 링이 축을 조이는 힘으로 고정해요. 원하는 위치에 끼울 수 있지만 강한 축 방향 힘에는 맞지 않아요.\n" +
      "• K형(T5304): 여러 개의 스프링 발톱이 축을 물어 강한 축 방향(스러스트) 힘도 견뎌요.\n\n" +
      "힘이 많이 걸리는 곳이면 축에 홈을 내고 S형·E형을 쓰시는 게 가장 확실해요.",
  },
  {
    short: "홈 치수",
    g: "스냅링",
    q: "멈춤링을 끼울 홈 치수는 어디서 보나요?",
    a: "홈페이지 각 멈춤링 규격표에 홈 지름(d2)·홈 폭(m)·여유(n)가 함께 나와 있어요. 축(또는 구멍) 지름에 맞는 줄을 보시면 돼요.\n\n" +
      "예) 축 지름 20mm용 S-20이면 같은 줄의 홈 지름·홈 폭대로 가공하시면 돼요.",
    link: ["스냅링 규격 보기", "snapring_page.html"],
  },
  {
    short: "베어링용 NR형",
    g: "스냅링",
    q: "베어링 바깥에 끼우는 스냅링(NR형)은 어떻게 고르나요?",
    a: "NR형은 베어링 외륜에 홈이 있는 베어링(형번 끝에 N·NR이 붙은 것)에 끼워, 하우징 안에서 베어링을 축 방향으로 고정해요.\n\n" +
      "호칭 번호가 베어링 외경 기준이라 고르기 쉬워요. 예) 외경 52mm 베어링(6205N 등) → NR-52\n\n" +
      "베어링 형번이나 외경을 알려 주시면 맞는 NR형으로 안내드려요.",
  },
  {
    short: "WR·WS·U형",
    g: "스냅링",
    q: "WR·WS 동심형이나 U형은 일반 멈춤링과 무엇이 다른가요?",
    a: "• WR(구멍용)·WS(축용) 동심형: 링이 완전한 원형으로 가공돼, 끼운 뒤에도 중심이 어긋나지 않고 힘을 고르게 받아요. (KS B 1338 계열)\n" +
      "• U형(UTW): E형처럼 옆에서 끼우는 형식이에요. 드라이버 같은 일반 공구로 뺄 수 있지만, 한 번 뺀 제품은 다시 쓸 수 없어요.",
  },
  {
    short: "리니어 부시 표기",
    g: "리니어·LM",
    q: "리니어 부시 UU·OP·AJ는 무슨 뜻인가요?",
    a: "• 표기 없음: 실 없음 / U: 한쪽 고무 실 / UU: 양쪽 고무 실\n" +
      "• OP: 개방형 — 몸체 한쪽이 트여 있어 받침대가 있는 축에 써요.\n" +
      "• AJ: 조정형 — 슬릿이 있어 틈새를 조절할 수 있어요.\n" +
      "• L: 몸체가 긴 롱 타입 (예: LM20L)\n\n" +
      "예) LM20UU = 내경 20mm 표준형, 양쪽 고무 실",
  },
  {
    short: "형번이 안 보일 때",
    g: "기타",
    q: "제품의 형번이 지워져서 안 보이면 어떻게 하나요?",
    a: "내경·외경·두께(폭)를 재서 이 채팅에 '25 52 15'처럼 보내 주시면 맞는 규격을 찾아드려요.\n\n" +
      "제품 사진을 보내시려면 채팅 입력창 아래 '상담 연결'을 누른 뒤 담당자에게 보내 주세요.",
  },
  // ── 전체 품목 추가분 (홈페이지 각 규격 페이지 설명 기준)
  {"short":"미니어처 기준","g":"베어링 형번","q":"미니어처 베어링과 소경 베어링은 어떻게 나누나요?","a":"• 미니어처 베어링: 외경 9mm 미만\n• 소경 베어링: 외경 9mm 이상, 내경 10mm 미만\n• 형식: 개방형·플랜지형·실드형으로 공급\n\n미니어처 베어링은 IJK·NTN·NMB·NSK·KOYO 등 제조사 형번으로 안내드립니다.","link":["미니어처 베어링 보기","miniature_ball.html"]},
  {"short":"클러치 베어링","g":"베어링 형번","q":"원웨이 클러치 베어링은 어떤 종류가 있나요?","a":"한쪽 방향으로만 회전을 전달하고 반대 방향으로는 공회전하는 베어링입니다.\n• 베어링형: TSS·TFS·BB·LD — 일반 베어링처럼 보어에 압입. BB는 키홈 옵션(-1K 내륜, -2K 내·외륜)\n• 드로운컵형: FC·HF·RC·RCB·FCB — 얇은 타발 외륜의 소형 구조\n• 케이지형: X·BW·BWC — 외륜 없이 케이지만 공급, 축·하우징이 궤도 역할","link":["클러치 베어링 보기","clutch_bearing.html"]},
  {"short":"인서트 종류","g":"베어링 유닛","q":"베어링 유닛 인서트 UC·UK·SA·SB는 어떻게 다른가요?","a":"축에 고정하는 방식이 다릅니다.\n• UC: 내경 표준, 세트스크류(고정나사)로 고정\n• UK: 테이퍼 내경, 어댑터 슬리브로 고정 (슬리브는 별도 부품)\n• SA(CSA)·HC: 편심고정링(칼라)으로 고정\n• SB(CSB): 세트스크류로 고정. C가 붙으면 원통 외륜(CSB·CSA)\n• UCX: UC보다 폭이 넓은 중하중용","link":["베어링 유닛 보기","ball_bearing_unit.html"]},
  {"short":"하우징 형식","g":"베어링 유닛","q":"하우징 P·F·FL·FC·C·T형은 어떻게 다른가요?","a":"설치 방식에 따라 나뉩니다.\n• P(필로우 블록): 바닥면을 볼트로 고정. PA는 내로우 베이스, PH는 하이센터\n• F(사각 플랜지): 볼트 4개로 벽면에 고정\n• FL·FA·FB(장원형 플랜지): 볼트 2개로 벽면에 고정하는 소형·경량형\n• FC(원형 플랜지): 원형 플랜지로 벽면에 고정\n• C(카트리지): 원통형 슬리브만 있는 형태, 기계 프레임에 끼워 사용\n• T(테이크업): 벨트·체인 장력을 조절하도록 위치를 옮길 수 있는 형태","link":["유닛 케이스 보기","unit_case.html"]},
  {"short":"플라스틱 유닛","g":"베어링 유닛","q":"플라스틱 베어링 유닛은 언제 쓰나요?","a":"하우징을 엔지니어링 플라스틱으로 만든 유닛입니다.\n• 장점: 주철 하우징보다 무자성·내식성·경량\n• 사용처: 식품·제약·화학 설비, 물기가 많은 환경\n• 형식·크기: P·FL·F형, 축경 12~50mm","link":["플라스틱 유닛 보기","plastic_unit.html"]},
  {"short":"테이크업 종류","g":"베어링 유닛","q":"테이크업 유닛은 어떤 종류가 있나요?","a":"컨베이어 등에서 축 위치를 옮겨 벨트·체인 장력을 맞추는 유닛입니다.\n• UCT(TM): UC 인서트용. 짧은(A)·긴(B) 조정거리, 벨트 컨베이어용\n• UCTN: 축 중심이 한쪽으로 치우친 오프셋형, 벽면·좁은 공간용\n• CTS: 베어링 없이 샤프트만 고정, 체인 컨베이어용\n• 알루미늄·스틸: 알루미늄은 축경 12~20mm 경량·내식, 스틸은 축경 20~50mm","link":["테이크업 유닛 보기","takeup_unit.html"]},
  {"short":"플러머 블록","g":"베어링 유닛","q":"플러머 블록 SN2·SN3·SN5·SN6은 어떻게 다른가요?","a":"들어가는 베어링과 축 고정 방식이 다릅니다. 하우징 외형 치수 기준은 같습니다.\n• SN2·SN3: 원통 내경 베어링을 직접 장착 (SN2: 자동조심 볼 12xx·22xx / SN3: 구면 롤러 13xx·22xx)\n• SN5·SN6: 어댑터 슬리브로 축에 고정 (SN5: 12xxK / SN6: 13xxK 테이퍼 내경 베어링)\n\n컨베이어·제지·시멘트 설비처럼 하중이 큰 긴 축에 주로 씁니다.","link":["플러머 블록 보기","plummer_block.html"]},
  {"short":"엔드캡","g":"오일씰","q":"축이 없는 구멍을 막는 엔드캡(막힘 리데나)은 무엇인가요?","a":"축이 지나가지 않는 하우징 구멍을 완전히 막는 마개형 리데나입니다. 철판 컵에 고무를 입혀 오일씰처럼 압입합니다.\n• 규격 표기: 외경(A) × 두께(B)\n• 장착: 구멍 공차 H8, 장착 깊이 B+0.5mm, 구멍 입구 모따기 10~20°\n• 사용처: 기어박스·감속기·펌프 등의 구멍 막음","link":["엔드캡 규격 보기","oilseal_endcap.html"]},
  {"short":"패킹 종류","g":"오링·유압씰","q":"U패킹·V패킹·더스트씰은 어떻게 다른가요?","a":"유압·공압 실린더에서 쓰는 위치와 역할이 다릅니다.\n• U패킹: KY·SKY·GLY형 — 피스톤·로드 겸용 실링\n• V패킹: VF형 — 피스톤·로드 겸용, 외경×내경으로 규격 구분\n• 로드씰·피스톤씰: PNY형은 로드용, PGY형은 피스톤용\n• 더스트씰: SER·SFR·DKI·SCB형 등 — 바깥 이물질이 들어오지 않게 막음","link":["유압씰 보기","seal.html"]},
  {"short":"비규격 오링","g":"오링·유압씰","q":"표준에 없는 치수의 오링도 구할 수 있나요?","a":"네, JIS·KS·ISO 등 표준 규격에 없는 비규격 오링도 취급합니다.\n\n내경(d)·굵기(W)를 알려 주시면 재고와 납기를 확인해 견적으로 안내드립니다.","link":["비규격 오링 보기","oring_nonstandard.html"]},
  {"short":"풀림방지 와셔","g":"와셔·풋시너트","q":"풀림 방지 와셔는 어떤 종류가 있나요?","a":"• E와셔(톱니 와셔): 안쪽·바깥쪽 톱니가 체결면을 파고들어 풀림 방지 (KS B 1325)\n• 스핀 와셔: 회오리 모양 톱니로, 일반 스프링 와셔보다 진동 풀림에 강함\n• 노드 록: 두 장이 한 쌍으로 조립된 상태로 공급, 노란 크로메이트 도금이 표준\n• 웨이브 와셔: 풀림 방지보다는 예압을 주거나 축 방향 유격을 흡수 (베어링용 BWW)"},
  {"short":"풋시너트","g":"와셔·풋시너트","q":"풋시너트(SPN·RPN)와 스톱링(CSTW·CRTW)은 어떻게 쓰나요?","a":"홈 가공 없이 원하는 위치에 밀어 넣기만 하면 발톱이 파고들어 고정됩니다.\n• 축용: SPN·CSTW (스톱링은 발톱이 많아 힘을 더 고르게 받음)\n• 구멍용: RPN·CRTW\n• 주의: 한 번 끼우면 다시 쓸 수 없고, 상대 부품이 너무 단단하거나 도금돼 있으면 고정이 어려울 수 있음"},
  {"short":"어댑터 슬리브","g":"너트·슬리브","q":"어댑터 슬리브(H)와 인발 슬리브(AH)는 어떻게 다른가요?","a":"• 어댑터 슬리브(H): 테이퍼 내경 베어링을 원통 축에 고정. 바깥이 1/12 테이퍼라 로크너트로 밀면 축에 단단히 조여짐\n• 인발 슬리브(AH): 베어링을 쉽게 빼낼(철거) 수 있도록 쓰는 슬리브\n• 계열 선택: 베어링 형번에 맞춰 H2·H3·H23·H30·H31·H32 중 선택. 예) UK205 → H2305X","link":["어댑터 슬리브 보기","hah_sleeve.html"]},
  {"short":"로크너트 AN·ANL","g":"너트·슬리브","q":"로크너트 AN과 ANL, 로크와셔는 어떻게 쓰나요?","a":"어댑터 슬리브·베어링을 축에 고정할 때 함께 쓰는 너트입니다.\n• AN: 로크와셔(AW)와 함께 사용\n• ANL: 락 클립(AL·ALL)을 나사구멍에 끼워 풀림 방지\n• 로크와셔 사용법: 안쪽 텅을 축 홈에 맞춰 끼운 뒤, 바깥 끝을 너트 홈에 구부려 넣음","link":["로크너트 보기","lock_nut.html"]},
  {"short":"풀림방지 너트","g":"너트·슬리브","q":"풀림 방지 너트는 어떤 종류가 있나요?","a":"• 나일론 링 너트(GUK): 안쪽 나일론 링이 나사를 잡아, 세트스크류가 필요 없음\n• 트윈 너트: 2단 구조로 와셔 없이 단독으로 풀림 방지\n• 파인 너트: 키 가공이나 와셔 없이 로킹되는 정밀 너트\n• 6각 로크너트: 나사 안쪽 홈이 축 나사부를 살짝 눌러 풀림 방지. 1종·2종·캡형 등"},
  {"short":"키 종류","g":"키·핀","q":"사각키·반달키·라운드키는 어떻게 다른가요?","a":"• 사각키: 축과 보스를 회전 방향으로 고정하는 기본 키. 일반강(SM45C)과 스테인리스(STS304, 300mm 봉재로 공급해 잘라 사용)\n• 반달키: 반달 모양으로 홈 안에서 기울어져 가공 오차를 흡수. 소형 축·테이퍼 축용\n• 라운드키(1R·2R): 끝을 반원으로 가공해 둥근 키홈에 그대로 맞음. 1R은 한쪽, 2R은 양쪽","link":["키·핀 보기","key_pin.html"]},
  {"short":"핀 종류","g":"키·핀","q":"평행핀·테이퍼핀·스프링핀·R핀은 어떻게 다른가요?","a":"• 평행핀: 지름이 일정한 원통형, 두 부품의 위치를 정확히 맞춤\n• 테이퍼핀: 1/50 비율로 가늘어지는 원뿔형, 정확한 위치 고정\n• 스프링핀: 말린 강판의 탄성으로 구멍에 눌려 고정 (평행형·경하중용)\n• R핀: 손으로 끼우고 빼는 빠짐 방지 핀, 탈부착이 잦은 곳","link":["키·핀 보기","key_pin.html"]},
  {"short":"파워록이란","g":"파워록","q":"파워록은 무엇이고 언제 쓰나요?","a":"볼트를 조이면 링이 축과 보스(허브) 사이를 조여, 키 없이 기어·풀리·스프라켓 등을 축에 고정하는 체결 부품입니다.\n• 장점: 위치를 자유롭게 정할 수 있고, 붙이고 떼기 쉬움. 센터링 기능이 있는 형식이 많음\n\n축 지름과 보스(허브) 지름을 알려 주시면 맞는 형식을 안내드립니다.","link":["파워록 보기","power_lock.html"]},
  {"short":"파워록 고르기","g":"파워록","q":"파워록 형식(DR 시리즈)은 어떻게 고르나요?","a":"• 보스 외경이 작을 때: DR110\n• 정밀한 위치 결정: DR133B (보스 축방향 이동 없음, 고정도 센터링)\n• 범용: DR200 (설치·해체가 쉬움)\n• 공간이 좁을 때: DR300 (씰링 효과), DR300C (컷팅형, 조립 쉽고 토크 우수)\n• 큰 하중: DR400 (대용량), DR603 (보스 바깥에서 체결, 큰 토크)\n• 축과 축 연결: DR500 (커플링형)","link":["파워록 보기","power_lock.html"]},
  {"short":"금형 스프링","g":"스프링·플런저","q":"금형 스프링은 시리즈(색상)를 어떻게 고르나요?","a":"금형의 녹아웃·이젝터·캠·슬라이드 등에 쓰는 사각 단면 코일 스프링입니다.\n• 시리즈: 하중(부하 용량)과 압축 가능 범위에 따라 SF·SSF·SL·SM·SH 등 13개 시리즈, 색상으로도 구분\n• 예) SF: 경소하중, 황색. 사용 변형량은 자유장의 40~50%\n• 주의: 완전히 눌린 밀착 높이까지는 사용하면 안 됨\n\n외경·자유장과 필요한 하중을 알려 주시면 맞는 시리즈로 안내드립니다.","link":["금형 스프링 보기","mold_spring.html"]},
  {"short":"접시 스프링","g":"스프링·플런저","q":"접시 스프링은 언제 쓰고 H·L은 무엇인가요?","a":"접시(원뿔) 모양 강판 와셔를 겹치거나 쌓아 예압·완충 스프링으로 씁니다. 같은 부피에 비해 큰 하중을 낼 수 있어 좁은 공간의 예압 조정에 알맞습니다.\n• H: 중하중용 두께\n• L: 경하중용 두께","link":["접시 스프링 보기","dish_spring.html"]},
  {"short":"볼 플런저","g":"스프링·플런저","q":"볼 플런저는 무엇이고 어떤 종류가 있나요?","a":"나사 몸체 안의 스프링이 볼을 밀어내는 부품으로, 금형·지그 등에서 '딸깍' 하는 위치 고정·인덱싱에 씁니다.\n• 국산 BP 시리즈: 표준형 볼 플런저 (회전방지 로크 구조)\n• Halder 2203: 독일 정품. 쾌삭강·스테인리스 × 표준·강화 스프링 4가지 사양","link":["볼 플런저 보기","ball_plunger.html"]},
  {"short":"DU·오일레스","g":"오일레스·DU","q":"DU 드라이 베어링과 오일레스 부시는 어떻게 다른가요?","a":"둘 다 따로 기름을 넣지 않고 쓰는 부시입니다.\n• DU: 강 배면에 PTFE 합금층을 붙인 얇은 드라이 메탈. 형번은 DU+내경 2자리+길이 2자리 (DU1006 = 내경 10·길이 6). 하우징 H7, 축 h7\n• 오일레스 부시(#500SP): 청동에 고체 윤활제를 박아 넣은 자체 윤활 부시. 회전·왕복 운동 모두 사용","link":["오일레스 보기","oiless.html"]},
  {"short":"플랜지·와셔형","g":"오일레스·DU","q":"플랜지형·와셔형 드라이 베어링은 언제 쓰나요?","a":"• DUF·오일레스 플랜지 부시: 플랜지가 있어 축 방향 위치 결정과 하중 지지를 함께 함\n• DWC·TW(와셔형): 축 방향(스러스트) 하중을 받는 곳\n• DWCK: 와셔형에 핀홀을 더해 회전 방지\n• DWK: 사각 하우징에 압입하는 사각형","link":["오일레스 보기","oiless.html"]},
  {"short":"오일게이지 종류","g":"오일게이지","q":"오일게이지 MH·MHS·MHL은 어떻게 다른가요?","a":"• MH: 특수 강화 수지 본체, 잘 보이고 압력·약품에 강함 (모든 약품에 쓸 수 있는 것은 아님)\n• MHS: 파손·누유 걱정을 줄인 형식, 압력과 고열에 강함. O링이 있어 끝까지 돌려 끼우면 됨\n• MHL: 충격에 강하고, 빨간 눈금과 흰 반사판으로 기름 양을 확인하기 쉬움\n\n설치할 때는 나사산에 그리스를 바르고, 공구로 세게 두드리지 마세요.","link":["오일게이지 보기","oil_gage.html"]},
  {"short":"오일캡","g":"오일게이지","q":"오일캡(공기빼기 캡)은 무엇인가요?","a":"공작기계·기어박스·크랭크실에서 기름이 튀면서 생기는 내부 압력을 공기구멍으로 빼 주어, 누유와 씰 파손을 막는 제품입니다. 오래 써도 공기구멍이 막히지 않습니다.\n• 나사: PF 나사형, M 나사형 2종","link":["오일캡 보기","oil_cap.html"]},
  {"short":"부시·LM가이드","g":"리니어·LM","q":"리니어 부시와 LM 가이드는 어떻게 다른가요?","a":"• 리니어 부시: 둥근 축 위를 볼이 굴러 직선 왕복 운동을 지지\n• LM 가이드: 사각 레일 위를 블록이 움직여 상하·좌우 하중과 모멘트까지 지지하는 고강성 가이드","link":["LM 가이드 보기","lm_guide.html"]},
  {"short":"HSR·SR 차이","g":"리니어·LM","q":"LM 가이드 HSR과 SR 블록은 어떻게 다른가요?","a":"국내에서는 삼익THK의 HSR·SR 형번이 사실상 표준입니다.\n• HSR: 볼이 45°로 배치돼 상하·좌우 하중을 고르게 받는 범용 고강성형 (C형 플랜지·R형 슬림)\n• SR: 90° 접촉으로 위아래(레이디얼) 하중에 특화, 높이가 낮음 (V·W·TB형)","link":["LM 가이드 보기","lm_guide.html"]},
  {"short":"강구·볼캐스터","g":"기타","q":"강구·볼 리테이너·볼 캐스터는 어떤 제품인가요?","a":"• 강구: 정밀 강구를 재질별로 취급, 금·은·아연·니켈 도금도 가능\n• 볼 리테이너: 강구를 원형 궤도에 박은 케이지, 왕복·회전부 마찰을 줄임. 황동·알루미늄·POM 재질\n• 볼 캐스터: 컨베이어 분기점 등에서 화물 방향을 자유롭게 바꿈. 사각(4홀)·장원형(2홀) 플랜지","link":["강구 보기","steel_ball.html"]},
  {"short":"형번 읽는 법","g":"베어링 형번","q":"베어링 형번(6205 등)은 어떻게 읽나요?","a":"6205를 예로 들면 이렇게 읽습니다.\n• 6: 형식 — 깊은 홈 볼 베어링 (7은 앵귤러, N은 원통 롤러 등)\n• 2: 크기 계열 — 같은 내경에서 68·69·60·62·63 순으로 외경·폭이 커짐\n• 05: 내경 번호 — 00=10, 01=12, 02=15, 03=17mm, 04부터는 ×5 (05=25mm, 10=50mm)\n\n뒤에 붙는 ZZ·DD는 실드 형식, C3는 내부틈새입니다."},
  {"short":"인치 보어","g":"베어링 형번","q":"UC205-16처럼 뒤에 붙은 숫자는 무엇인가요?","a":"인치 내경을 1/16인치 단위로 나타냅니다.\n• -16: 16/16인치 = 1인치 (25.4mm)\n• -14: 14/16인치 = 7/8인치 (22.2mm)\n• -12: 12/16인치 = 3/4인치 (19.1mm)\n\n숫자가 없는 UC205는 미터 내경 25mm입니다. 바깥 치수는 같아서 같은 하우징에 들어갑니다."},
  {"short":"정밀도 등급","g":"베어링 형번","q":"베어링 정밀도 등급(P0·P6·P5·P4)은 무엇인가요?","a":"국제 규격(ISO 492)의 치수·회전 정밀도 등급입니다.\n• P0(보통급): 일반 기계용. 형번에 따로 표기하지 않음\n• P6 → P5 → P4: 숫자가 작을수록 더 정밀. 공작기계 주축 등에는 P5·P4를 씀\n\n기존 베어링에 P5·P4 같은 표기가 있으면 견적·발주 때 꼭 함께 적어 주세요."},
  {"short":"장착 방향","g":"오일씰","q":"오일씰은 어느 방향으로 끼우나요?","a":"• 주 립(스프링 쪽): 밀봉할 기름(유체) 쪽을 향하게\n• 먼지막이 립(TC 등): 바깥(먼지) 쪽을 향하게\n• 주의: 반대로 끼우면 기름이 바깥으로 샐 수 있음. 하우징에 똑바로 압입하고, 축 끝은 모따기해서 립이 다치지 않게"},
];
// 제품 질문은 품목별로: 먼저 품목을 고르고 → 그 품목 질문 목록
const PRODUCT_GROUPS = ["베어링","베어링 형번","베어링 유닛","오일씰","오링·유압씰","스냅링","와셔·풋시너트","너트·슬리브","키·핀","파워록","스프링·플런저","오일레스·DU","오일게이지","리니어·LM","기타"];
const PRODUCT_PAGES = [PRODUCT_GROUPS.slice(0, 8), PRODUCT_GROUPS.slice(8)];
function productFaqList(group, page) {
  if (!group) {
    const p = page === 2 ? 1 : 0;
    const groups = PRODUCT_PAGES[p];
    return {
      outputs: [text("제품 문의 때 자주 하는 질문이에요. 품목을 골라 주세요." + (p ? " (2/2)" : " (1/2)") + "\n\n" +
        groups.map((g) => `■ ${g}: ` + PRODUCT_FAQ.filter((f) => f.g === g).map((f) => f.short).join(", ")).join("\n"))],
      quick: [...groups.map((g) => ({ label: g, action: "message", messageText: "제품 질문: " + g })),
        p ? { label: "이전 품목", action: "message", messageText: "제품 질문" } : { label: "다음 품목", action: "message", messageText: "제품 질문 2" },
        QUICK[0]],
    };
  }
  const items = PRODUCT_FAQ.filter((f) => f.g === group);
  return {
    outputs: [text(`${group} 관련 자주 하는 질문이에요. 아래에서 궁금한 질문을 눌러 주세요.\n\n` + items.map((f, i) => `${i + 1}. ${f.q}`).join("\n"))],
    quick: [...items.map((f) => ({ label: f.short, action: "message", messageText: f.q })),
      { label: "다른 품목", action: "message", messageText: PRODUCT_PAGES[1].includes(group) ? "제품 질문 2" : "제품 질문" }, QUICK[0]],
  };
}

// 자주 하는 질문 첫 화면: 일반 질문 / 제품 질문 고르기
function faqMenu() {
  return {
    outputs: [text("자주 하는 질문이에요. 어떤 질문이 궁금하세요?\n\n" +
      "■ 일반 질문: 취급 제품·브랜드, 형번 입력 방법, 견적·발주, 재고·납기·가격, 카탈로그, 영업시간, 위치\n\n" +
      "■ 제품 질문: 베어링·베어링 유닛·오일씰·오링·스냅링·너트·키·핀·파워록·스프링·오일레스·오일게이지·LM 등 품목별 질문")],
    quick: [
      { label: "일반 질문", action: "message", messageText: "일반 질문" },
      { label: "제품 질문", action: "message", messageText: "제품 질문" },
      QUICK[0],
    ],
  };
}
function faqList() {
  return {
    outputs: [text("일반적으로 자주 하는 질문이에요. 아래에서 궁금한 질문을 눌러 주세요.\n\n" + FAQ.map((f, i) => `${i + 1}. ${f.q}`).join("\n"))],
    quick: [...FAQ.map((f) => ({ label: f.short, action: "message", messageText: f.q })),
      { label: "제품 질문", action: "message", messageText: "제품 질문" }, QUICK[0]],
  };
}
function faqAnswer(f, product) {
  const card = { title: ("Q. " + f.q).slice(0, 50), description: f.a.slice(0, 400) };
  const links = f.links || (f.link ? [f.link] : []);
  if (links.length) card.buttons = links.map(([label, path]) => ({ action: "webLink", label, webLinkUrl: SITE + path }));
  return product
    ? { outputs: [{ textCard: card }], quick: [{ label: f.g + " 질문", action: "message", messageText: "제품 질문: " + f.g }, { label: "다른 품목", action: "message", messageText: "제품 질문" }, QUICK[0]] }
    : { outputs: [{ textCard: card }], quick: [{ label: "일반 질문", action: "message", messageText: "일반 질문" }, { label: "제품 질문", action: "message", messageText: "제품 질문" }, QUICK[0]] };
}

function answer(utterance, blockName) {
  const u = (utterance || "").trim();
  if (/웰컴|welcome/i.test(blockName || "")) return reply([text(WELCOME)]);
  // 인사·메뉴 요청은 첫인사와 같은 안내로(이미 대화한 적 있는 손님은 웰컴 블록이 다시 나오지 않음)
  if (!u || /^(안녕|하이|시작|처음|메뉴|hi|hello)/i.test(u)) return reply([text(WELCOME)]);
  if (/^(도움말|사용법|규격 ?검색 ?방법)/.test(u)) return reply([text(HELP)]);
  // FAQ 질문 버튼 — "형번 및 규격…", "견적/발주…"가 아래 키워드 안내에 걸리지 않도록 먼저 확인
  const qkey = u.replace(/\s+/g, "").replace(/^Q\.?/, "");
  const faq = FAQ.find((f) => f.q.replace(/\s+/g, "") === qkey);
  if (faq) return reply(faqAnswer(faq));
  const pfaq = PRODUCT_FAQ.find((f) => f.q.replace(/\s+/g, "") === qkey);
  if (pfaq) return reply(faqAnswer(pfaq, true));
  if (/^(제품\s*(질문|FAQ|문의\s*FAQ)|제품\s*관련\s*질문)$/i.test(u)) return reply(productFaqList());
  if (/^제품\s*질문\s*2$/.test(u)) return reply(productFaqList(null, 2));
  const pg = u.match(/^제품\s*질문\s*[:：]\s*(.+)$/);
  if (pg && PRODUCT_GROUPS.includes(pg[1].trim())) return reply(productFaqList(pg[1].trim()));
  if (/^일반\s*질문$/.test(u)) return reply(faqList());
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
  if (/^(FAQ|자주(하는|묻는)질문)$/i.test(compact)) return reply(faqMenu());
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

  // 인사·대답·잡담(숫자·영문 없음)은 검색하지 않고 안내
  if (/감사|고맙|수고/.test(u) && !/\d/.test(u)) {
    return reply([text("감사합니다 😊\n더 필요하신 규격이 있으면 형번이나 치수를 보내 주세요.")]);
  }
  // "6205 10개", "베어링 6205 재고 있나요?", "SKF 6205", "내경 25 외경 52", "25 52 15mm"처럼
  // 붙은 말·수량·브랜드·단위는 떼고 검색 (수량은 견적·발주 양식에 채워 줌)
  // 품목 이름이 함께 오면("스냅링 20", "오링 P20", "E링 5") 그 분류 안에서 찾음
  const cat = CATEGORY_WORDS.find(([re]) => re.test(u));
  let work = u.replace(/[^\p{L}\p{N}\s\-\/.*×"'()#+,~]/gu, " ").replace(/(\d)\s*(mm|㎜)/gi, "$1");
  let qty = null;
  const qm = work.match(/(\d+)\s*(개|ea|pcs|세트|set|박스|box|본|롤)(?![a-z])/i);
  if (qm) { qty = qm[1] + qm[2]; work = work.replace(qm[0], " "); }
  work = work.replace(/(규격|품번|형번|치수|사이즈|검색|견적|발주|주문|문의(?:드립니다|드려요)?|찾아\s*줘|찾아\s*주세요|알려\s*줘|알려\s*주세요|부탁(?:드립니다|드려요|합니다|해요)?|해\s*주세요|주세요|있어요|있나요|있습니까|있을까요|재고|가격|단가|얼마(?:예요|인가요|에요)?|필요(?:합니다|해요)?|구매|구입|요청|혹시|수량|내경|외경|두께|폭|높이|볼\s*베어링|베어링|오일\s*씰|리데나|오링|O링|유니트|유닛|\?|!)/gi, " ");
  work = work.replace(/(^|\s)(NACHI|SKF|NSK|NTN|FAG|KOYO|JTEKT|NMB|IKO|THK|TIMKEN|INA|KBC|JIB|WBC|IBC|TYB|ILJIN|ASAHI|FYH|EZO|KYK|JNS|ISC|NOK|일진|나치|bearings?|oil\s*seals?|seals?|o-?rings?|price|stock|please|quote|order|need|want|qty)(?=\s|$)/gi, " ");
  // 분류 이름(스냅링·멈춤링·E링·키·핀 …)도 검색어에서는 뗌 — 위에서 분류로 따로 걸러 줌
  if (cat) work = work.replace(cat[0], " ");
  work = work.replace(/\s+/g, " ").trim();
  // "25-52-15"처럼 숫자만 '-'로 이은 것은 치수
  if (/^\d+(\.\d+)?(\s*-\s*\d+(\.\d+)?){1,2}$/.test(work)) work = work.replace(/\s*-\s*/g, " ");
  if (!work || !/[0-9a-z]/i.test(work) || work.replace(/\s+/g, "").length < 2 && !/^\d$/.test(work)) {
    return reply([text("찾으시는 형번이나 치수를 보내 주시면 바로 찾아드려요.\n예) 6205, UC205, 25 52 15\n\n담당자와 대화하시려면 채팅 입력창 아래 '상담 연결'을 눌러 주세요." + closedNote())]);
  }
  const cleaned = work;
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
  // 분류 이름이 있었으면 그 분류 결과만 — 없으면 "스냅링 20"처럼 숫자를 그 분류의 호칭(축·구멍 지름)이나 형번 숫자로 찾음
  if (cat) {
    if (/^\d+(\.\d+)?$/.test(cleaned)) {
      // 숫자 하나: 호칭(d)이 같거나 형번에 그 숫자가 따로 들어간 것만 (20 → S-20, R-20 / 120·200은 제외)
      const n = Number(cleaned);
      const numRe = new RegExp(`(^|[^0-9.])${cleaned.replace(".", "\\.")}([^0-9.]|$)`);
      rows = dedupe(load().SPEC_DATA.filter((r) => cat[1].test(r.c) && ((r.d != null && Math.abs(r.d - n) < 0.01) || numRe.test(r.m))))
        .sort((a, b) => groupRank(a) - groupRank(b));
      if (rows.length) note = `${cat[2]} 중 ${cleaned} 규격을 찾았어요.\n`;
      query = { kind: "model", q: cleaned };
    } else {
      const inCat = rows.filter((r) => cat[1].test(r.c));
      if (inCat.length) rows = inCat;
    }
  }
  // "6205 6206 6207"처럼 여러 형번을 한 번에 보내면 형번마다 찾아서 모아 보여줌
  // (숫자만 여러 개면 치수로 먼저 찾고, 치수로 없을 때 형번 여러 개로 봄)
  if (!rows.length && cleaned.split(/[\s,]+/).filter(Boolean).length > 1) {
    const parts = cleaned.split(/[\s,]+/).filter((p) => p.length >= 2);
    const found = parts.flatMap((p) => {
      const q = norm(p);
      return dedupe(search({ kind: "model", q: p })).filter((r) => norm(r.m) === q).slice(0, 2);
    });
    if (found.length) { rows = found; query = { kind: "model", q: cleaned }; note = `보내 주신 형번 ${parts.length}개 중 등록된 규격을 모았어요.\n`; }
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
        { label: "이 품번으로 견적 문의", action: "message", messageText: "견적 문의: " + cleaned + (qty ? " | 수량 " + qty : "") },
        QUICK[0],
      ],
    });
  }
  return showResults(rows, query, note, cleaned, false, typed, qty);
}

// 규격 카드 목록 — [견적 문의]·[발주 문의]·[상세 보기]
function showResults(rows, query, note, q, isApprox, typed, qty) {
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
    const btn = (kind) => ({ action: "message", label: kind + " 문의", messageText: `${kind} 문의: ${name}` + (qty ? ` | 수량 ${qty}` : "") });
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
