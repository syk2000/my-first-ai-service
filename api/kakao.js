// 카카오톡 챗봇 스킬 서버 — 카카오 i 오픈빌더의 "스킬"이 이 주소(/api/kakao)로 손님 메시지를 보내면
// 홈페이지 규격 데이터(company-homepage/assets/spec-data.js)에서 찾아 카카오 응답 형식(v2.0)으로 돌려줍니다.
//   형번 검색: "6205", "UC205", "NK8/12"
//   치수 검색: "25 52", "25*52*15", "25x52" (내경 외경 두께 순, 일부만 입력 가능)
const fs = require("fs");
const path = require("path");
const { PHONE, FAX, ADDRESS, FAQ, BUY_FAQ, PRODUCT_FAQ, PRODUCT_GROUPS } = require("./_faq-data");

const SITE = "https://my-first-ai-service-pi.vercel.app/company-homepage/";
// 견적·발주 접수 메일 — 홈페이지 견적문의와 같은 FormSubmit 받는 주소
const FORMSUBMIT_URL = "https://formsubmit.co/ajax/06c8bd050147ba661797f96176c179f7";
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
  // "FUN05SC · … (= FU05SC · …)"처럼 옛 표기를 함께 적은 형번은 카드 제목에서 뒤쪽을 떼고 설명에 따로 보여 줌
  const m = String(r.m).replace(/[○●△⬠★☆◎]/g, "").replace(/\s*\(=.*\)\s*$/, "").replace(/\s+/g, " ").trim();
  return (r.c === "오일씰 형식 및 적용현황" && !/^오일씰/.test(m) ? "오일씰 " : "") + m;
}

// 볼 베어링은 같은 형번이라도 실드 형식(개방·ZZ·DD)이 달라서, 견적·발주 양식 안내에 형식을 적도록 알려 줌
const SHIELD_CATS = { "깊은 홈 볼 베어링": 1, "미니어처 볼 베어링": 1 };
// 실드·실 표기(메이커별): 철판 Z·ZZ / 고무 D·DD(국산), DU·DDU·V·VV(NSK), LU·LLU·LB·LLB·LH·LLH(NTN), RS·2RS(공통), NSE·2NSE(NACHI)
const hasShield = (m) => /(ZZ|2Z|Z|DDU|DU|DD|D|VV|V|LLU|LU|LLB|LB|LLH|LH|2RS\w*|RS|2RU|RU|2NSE|NSE)$/i.test(m.replace(/\s+/g, ""));
const needsShield = (r) => SHIELD_CATS[r.c] && !hasShield(String(r.m));
// 양식에 들어갈 품번이 실드 표기 없는 볼 베어링 형번인지 (예: "6205" → true, "6205ZZ" → false)
function shieldItem(item) {
  if (!item) return false;
  const n = norm(item);
  return load().SPEC_DATA.some((r) => norm(r.m) === n && needsShield(r));
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

// 같은 치수·형번이라도 형식이 여러 가지인 품목 — 카드에서 묻지 않고, 양식 안내에서 비고에 적도록 알려 줌
function formNote(item) {
  const t = (item || "").replace(/\s+/g, "");
  if (/^오일씰/.test(t)) {
    return "※ 오일씰은 같은 치수라도 형식(립·스프링·외주 구조)이 여러 가지예요. 사용 중인 제품의 형식이나 품번을 아시면 비고에 적어 주세요. 모르시면 담당자가 확인해 맞는 형식을 안내드려요.";
  }
  // 볼 베어링(실드 표기 없는 형번)
  if (shieldItem(item)) {
    return "※ 볼 베어링은 실드 형식에 따라 품번이 달라요. 비고에 OPEN(개방형)·Z/ZZ(한쪽/양쪽 철판 실드)·D/DD(한쪽/양쪽 고무 실) 중 필요한 형식을 적어 주세요. 메이커 표기(NTN LU·LLU, NSK DU·DDU, 2RS 등)로 적으셔도 돼요. 모르시면 담당자가 확인해 안내드려요.";
  }
  // 리니어 부시(LM·LMF·LMK·LMH, 실 표기 없음)
  if (/^LM[FKH]?\d/i.test(t) && !/\d+L?(UU|U|OP|AJ)/i.test(t)) {
    return "※ 리니어 부시는 실 형식에 따라 품번이 달라요. 비고에 OPEN(실 없음)·UU(양쪽 고무 실)·U(한쪽 고무 실) 중 필요한 형식을 적어 주세요. 모르시면 담당자가 확인해 안내드려요.";
  }
  return "";
}

function formIntro(form, item, qty) {
  const note = formNote(item);
  return [
    text(
      `${form.name} 양식이에요.\n` +
      "아래 말풍선을 길게 눌러 복사한 뒤 내용을 채워서 이 채팅방에 보내 주세요.\n\n" +
      "품목이 여러 개면 품번/규격 칸에 '6205 10개, 6206 5개'처럼 이어서 적으시면 돼요." +
      (note ? "\n\n" + note : "")
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
  // 손님이 양식에 "이메일: …" 줄을 직접 덧붙였으면 메일 답장 주소로
  if (values["이메일"] || values["이메일(세금계산서)"]) payload._replyto = values["이메일"] || values["이메일(세금계산서)"];
  payload["카카오 사용자 ID"] = userId || "-";
  const { ok } = await postMail(payload);
  return { ok, docNo };
}

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

// ── 자주 하는 질문 (질문·답변 내용은 _faq-data.js)
const go = (label, messageText = label) => ({ label, action: "message", messageText });
const GO_GENERAL = go("일반 질문");
const GO_BUY = go("구매·배송", "구매·배송 질문");
const GO_PRODUCT = go("제품 질문");

// 질문 목록 화면: 번호 붙인 질문 + 질문 버튼 + 다른 분류로 가는 버튼
function questionList(intro, items, more) {
  return {
    outputs: [text(intro + "\n\n" + items.map((f, i) => `${i + 1}. ${f.q}`).join("\n"))],
    quick: [...items.map((f) => go(f.short, f.q)), ...more, QUICK[0]],
  };
}

// 자주 하는 질문 첫 화면: 일반 질문 / 구매·배송 / 제품 질문 고르기
function faqMenu() {
  return {
    outputs: [text("자주 하는 질문이에요. 어떤 질문이 궁금하세요?\n\n" +
      "■ 일반 질문: 취급 제품·브랜드, 형번 입력 방법, 견적·발주, 견적 회신 시간, 재고·납기·가격, 카탈로그, 영업시간, 위치\n\n" +
      "■ 구매·배송: 구매 수량·할인, 결제·세금계산서, 배송 기간·배송비, 방문 수령, 반품·교환, 성적서·정품 증명, 주문 제작\n\n" +
      "■ 제품 질문: 베어링·베어링 유닛·오일씰·오링·스냅링·너트·키·핀·파워록·스프링·오일레스·오일게이지·LM 등 품목별 질문")],
    quick: [GO_GENERAL, GO_BUY, GO_PRODUCT, QUICK[0]],
  };
}
const faqList = () => questionList("일반적으로 자주 하는 질문이에요. 아래에서 궁금한 질문을 눌러 주세요.", FAQ, [GO_BUY]);
const buyFaqList = () => questionList("구매·배송 관련 자주 하는 질문이에요. 아래에서 궁금한 질문을 눌러 주세요.", BUY_FAQ, [GO_GENERAL, GO_PRODUCT]);

// 제품 질문은 품목별로: 먼저 품목을 고르고 → 그 품목 질문 목록 (품목이 많아 두 페이지)
const PRODUCT_PAGES = [PRODUCT_GROUPS.slice(0, 8), PRODUCT_GROUPS.slice(8)];
function productFaqList(group, page) {
  if (group) {
    return questionList(`${group} 관련 자주 하는 질문이에요. 아래에서 궁금한 질문을 눌러 주세요.`, PRODUCT_FAQ.filter((f) => f.g === group),
      [go("다른 품목", PRODUCT_PAGES[1].includes(group) ? "제품 질문 2" : "제품 질문")]);
  }
  const p = page === 2 ? 1 : 0;
  const groups = PRODUCT_PAGES[p];
  return {
    outputs: [text("제품 문의 때 자주 하는 질문이에요. 품목을 골라 주세요." + (p ? " (2/2)" : " (1/2)") + "\n\n" +
      groups.map((g) => `■ ${g}: ` + PRODUCT_FAQ.filter((f) => f.g === g).map((f) => f.short).join(", ")).join("\n"))],
    quick: [...groups.map((g) => go(g, "제품 질문: " + g)), p ? go("이전 품목", "제품 질문") : go("다음 품목", "제품 질문 2"), QUICK[0]],
  };
}

// 답변 카드 — kind: "general" | "buy" | "product" (아래 바로가기 버튼이 다름)
function faqAnswer(f, kind) {
  const card = { title: ("Q. " + f.q).slice(0, 50), description: f.a.slice(0, 400) };
  const links = f.links || (f.link ? [f.link] : []);
  if (links.length) card.buttons = links.map(([label, path]) => ({ action: "webLink", label, webLinkUrl: SITE + path }));
  const more = kind === "buy" ? [GO_BUY, GO_GENERAL]
    : kind === "product" ? [go(f.g + " 질문", "제품 질문: " + f.g), go("다른 품목", "제품 질문")]
    : [GO_GENERAL, GO_PRODUCT];
  return { outputs: [{ textCard: card }], quick: [...more, QUICK[0]] };
}

// 직접 적은 질문의 키워드 → FAQ (위에서부터 먼저 맞는 것)
const FREE_FAQ = [
  [/주문\s*제작|제작\s*(되|가능|해)|샘플/, "buy", "주문 제작"],
  [/반품|교환|환불/, "buy", "반품·교환"],
  [/성적서|인증서|정품/, "buy", "성적서·정품 증명"],
  [/결제|카드|계좌|입금|세금\s*계산서|현금\s*영수증/, "buy", "결제·세금계산서"],
  [/배송|택배|배달|퀵|화물/, "buy", "배송 기간·배송비"],
  [/방문|직접\s*(받|가지|가서|사러)|수령|픽업/, "buy", "방문 수령"],
  [/할인|낱개|소량|(한|1)\s*개만/, "buy", "구매 수량·할인"],
  [/영업\s*시간|운영\s*시간|몇\s*시|휴무|쉬는\s*날|주말|토요일|일요일|공휴일/, "faq", "영업시간"],
  [/견적.*(언제|얼마나|오래)|(언제|얼마나).*견적/, "faq", "견적 회신 시간"],
  [/카탈로그|카다록|카달로그/, "faq", "카탈로그"],
  [/납기|재고|가격|단가/, "faq", "재고·납기·가격"],
  [/브랜드|메이커|어떤\s*제품|취급/, "faq", "제품·브랜드"],
];

function answer(utterance, blockName) {
  const u = (utterance || "").trim();
  if (/웰컴|welcome/i.test(blockName || "")) return reply([text(WELCOME)]);
  // 인사·메뉴 요청은 첫인사와 같은 안내로(이미 대화한 적 있는 손님은 웰컴 블록이 다시 나오지 않음)
  if (!u || /^(안녕|하이|시작|처음|메뉴|hi|hello)/i.test(u)) return reply([text(WELCOME)]);
  if (/^(도움말|사용법|규격 ?검색 ?방법)/.test(u)) return reply([text(HELP)]);
  // FAQ 질문 버튼 — "형번 및 규격…", "견적/발주…"가 아래 키워드 안내에 걸리지 않도록 먼저 확인
  const qkey = u.replace(/\s+/g, "").replace(/^Q\.?/, "");
  const faq = FAQ.find((f) => f.q.replace(/\s+/g, "") === qkey);
  if (faq) return reply(faqAnswer(faq, "general"));
  const bfaq = BUY_FAQ.find((f) => f.q.replace(/\s+/g, "") === qkey);
  if (bfaq) return reply(faqAnswer(bfaq, "buy"));
  if (/^구매\s*·?\s*배송(\s*질문)?$/.test(u)) return reply(buyFaqList());
  const pfaq = PRODUCT_FAQ.find((f) => f.q.replace(/\s+/g, "") === qkey);
  if (pfaq) return reply(faqAnswer(pfaq, "product"));
  if (/^(제품\s*(질문|FAQ|문의\s*FAQ)|제품\s*관련\s*질문)$/i.test(u)) return reply(productFaqList());
  if (/^제품\s*질문\s*2$/.test(u)) return reply(productFaqList(null, 2));
  const pg = u.match(/^제품\s*질문\s*[:：]\s*(.+)$/);
  if (pg && PRODUCT_GROUPS.includes(pg[1].trim())) return reply(productFaqList(pg[1].trim()));
  if (/^일반\s*질문$/.test(u)) return reply(faqList());
  // 버튼이 아니라 직접 적은 질문("반품 되나요?", "영업시간이요")도 해당 FAQ 답변으로 — 숫자가 있으면 형번 검색이 우선
  if (!/\d/.test(u)) {
    const hit = FREE_FAQ.find(([re]) => re.test(u));
    if (hit) {
      const [, list, short] = hit;
      const f = (list === "buy" ? BUY_FAQ : FAQ).find((x) => x.short === short);
      if (f) return reply(faqAnswer(f, list === "buy" ? "buy" : "general"));
    }
  }
  // 채팅방 하단 메뉴 [규격&품번] 등 — 숫자 없이 "규격/품번/형번/검색"만 오면 입력 안내
  if (!/\d/.test(u) && /규격|품번|형번|검색/.test(u)) {
    return reply([text(
      "찾으시는 형번이나 치수를 입력해 주세요.\n\n" +
      "■ 형번\n예) 6205, UC205, NK8/12\n\n" +
      "■ 치수 (내경 외경 두께)\n예) 25 52 15  또는  25*52"
    )]);
  }
  // "근사치: 25 48" — 정확한 규격이 없을 때 가까운 규격 보여주기
  const near = u.match(/^근사치\s*[:：]\s*(.+)$/);
  if (near) {
    const nq = near[1].trim();
    return showResults(approx(parse(nq)), parse(nq), `'${nq}'에 정확히 맞는 규격은 없어서 가까운 규격을 보여드려요.\n`, nq, true);
  }
  // 규격 카드의 [견적 문의]/[발주 문의] 버튼 → 품번이 채워진 양식
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
  if (/^(고객)?(상담|상담문의|상담하기|전화상담)$/.test(compact)) return reply(consult());
  if (/^(FAQ|자주(하는|묻는)질문)$/i.test(compact)) return reply(faqMenu());
  if (/연락처|전화|위치|주소|오시는|팩스/.test(u)) {
    return reply([{
      textCard: {
        title: "SWS TECH 연락처",
        description: `TEL ${PHONE} · FAX ${FAX}\n${ADDRESS}`,
        buttons: [
          { action: "phone", label: "전화 걸기", phoneNumber: PHONE },
          { action: "webLink", label: "찾아오시는 길", webLinkUrl: SITE + "introduce.html#directions" },
        ],
      },
    }]);
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
  // "TC 25*52*7"처럼 오일씰 형식 + 치수 — 홈페이지 오일씰 표는 형식 구분이 없으므로 형식은 떼고 오일씰 안에서 치수로 찾고,
  // 견적·발주 양식에는 손님이 적은 형식을 그대로 넣음
  let sealType = null;
  const sm = work.match(/^(TCV|TCN|TCS|TC|SC|TB|SB|VC|VB|TA|SA|MG|SM|DM|DA|PCS|SCB|S|D|V)\s*(?=\d)/i);
  if (sm && /^\d+(\.\d+)?([\s×xX*]+\d+(\.\d+)?){1,2}$/.test(work.slice(sm[0].length).trim())) {
    sealType = sm[1].toUpperCase();
    work = work.slice(sm[0].length).trim();
  }
  const cleaned = work;
  let query = parse(cleaned);
  let rows = dedupe(search(query));
  if (sealType) rows = rows.filter((r) => /^oilseal/.test(r.p));
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
      let inCat = rows.filter((r) => cat[1].test(r.c));
      // "반달키 3*10"처럼 치수가 그 분류의 호칭(형번)인 경우 — 형번으로 다시 찾음
      if (!inCat.length && query.kind === "dim") {
        inCat = dedupe(search({ kind: "model", q: dimLabel(query) })).filter((r) => cat[1].test(r.c) && norm(r.m).startsWith(norm(dimLabel(query))));
      }
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
  if (sealType && rows.length) {
    const r = rows[0], dims = `${r.d}×${r.D}×${r.h}`;
    typed = { base: `오일씰 ${dims}`, full: `오일씰 ${sealType} ${dims}` };
    note = `오일씰 ${dims} 규격이 있어요. 견적·발주 양식에는 ${sealType} 형식으로 들어가요.\n`;
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

// 카드에 보일 치수 — 키는 b(나비)·h(높이)·L(길이), 반달키는 d0(축 지름)·h, 베어링은 폭 B
function dimText(r) {
  if (/사각키|라운드 키/.test(r.c)) return `b ${fmt(r.d)} · h ${fmt(r.D)} · L ${fmt(r.h)}`;
  if (r.c === "반달키") return `d0 ${fmt(r.d)} · h ${fmt(r.h)}`;
  if (r.c === "테이퍼 핀" || r.c === "평행 핀") return `d ${fmt(r.d)} · L ${fmt(r.h)}`;
  if (load().PAGE_GROUP[r.p] === "커플링") return `${r.d == null ? "" : `d ${fmt(r.d)} · `}A ${fmt(r.D)} · W ${fmt(r.h)}`;
  return `d ${fmt(r.d)} · D ${fmt(r.D)} · ${load().PAGE_GROUP[r.p] === "베어링" ? "B" : "H"} ${fmt(r.h)}`;
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
        : `${r.c}\n${dimText(r)} (mm)` + (String(r.m).match(/\(=.*\)\s*$/) || [""]).map((a) => (a ? "\n" + a.trim() : ""))[0] +
          r.alts.map((a) => "\n" + a).join("")).slice(0, 230),
      // 카드에서 바로 견적·발주, 상세 보기는 홈페이지 규격 페이지
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
    res.status(200).json(reply([text(`일시적인 오류로 답변하지 못했어요. 잠시 후 다시 시도하거나 ${PHONE}으로 연락 주세요.`)]));
  }
};
module.exports.answer = answer;
