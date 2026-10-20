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
  DATA = new Function(src + ";return { SPEC_DATA, PAGE_GROUP, GROUP_ORDER };")();
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

// 치수와 형태가 같은 규격은 한 번만 — 같은 오일씰이 NOK 호환표·삼정 규격표 등 여러 표에 실린 경우 등
//  · 오일씰 형식표(oilseal_types)는 형식(TC·D·D3…)이 형태, NOK·삼정 표는 형식 표기가 없어 하나의 형태로 봄
//  · 그 밖의 제품은 같은 형번 + 같은 치수일 때만 중복(예: 플라스틱 유닛과 볼 베어링 유닛의 UC205)
const SEAL_PAGES = { "page_nok.html": 1, "oilseal_samjung.html": 1, "oilseal_types.html": 1 };
function dedupe(rows) {
  const seen = new Map();
  const out = [];
  for (const r of rows) {
    const form = SEAL_PAGES[r.p]
      ? "seal:" + (r.p === "oilseal_types.html" ? String(r.m).split(" ")[0] : "")
      : "m:" + norm(String(r.m).replace(/[○●△⬠★☆◎]/g, ""));
    const key = [form, r.d, r.D, r.h].join("|");
    const hit = seen.get(key);
    if (hit) {
      // 국산(삼정) 표를 대표 카드로, 나머지(NOK 등)는 호환 형번으로 함께 표시
      if (prio(r) < prio(hit)) {
        hit.alts.unshift(hit.c + ": " + hit.m);
        Object.assign(hit, r, { sources: [r.c, ...hit.sources.filter((c) => c !== r.c)] });
      } else {
        if (!hit.sources.includes(r.c)) hit.sources.push(r.c);
        if (r.m !== hit.m) hit.alts.push(r.c + ": " + r.m);
      }
      continue;
    }
    const item = Object.assign({}, r, { sources: [r.c], alts: [] });
    seen.set(key, item);
    out.push(item);
  }
  return out;
}
const PRIO = { "oilseal_samjung.html": 0, "page_nok.html": 2, "plastic_unit_uc.html": 2 };
const prio = (r) => (r.p in PRIO ? PRIO[r.p] : 1);

// 양식에 넣을 품번 표기 — 기호(○ 등)는 빼고, 삼정 오일씰은 "오일씰 25×52×10"처럼
function cardName(r) {
  const m = String(r.m).replace(/[○●△⬠★☆◎]/g, "").replace(/\s+/g, " ").trim();
  return (r.p === "oilseal_samjung.html" ? "오일씰 " : "") + m;
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
  { label: "견적 문의", action: "message", messageText: "견적 문의" },
  { label: "발주 문의", action: "message", messageText: "발주 문의" },
  { label: "상담", action: "message", messageText: "상담" },
  { label: "FAQ", action: "message", messageText: "FAQ" },
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
    note: "📎 사업자등록증 사진도 이 채팅방에 함께 보내 주세요. (채팅창 아래 + 또는 사진 버튼)",
  },
};

function formIntro(form, item, qty) {
  return [
    text(
      `${form.name} 양식이에요.\n` +
      "아래 말풍선을 길게 눌러 복사한 뒤, 각 항목 ':' 뒤에 내용을 적어서 이 채팅방에 보내 주세요.\n\n" +
      "품목이 여러 개면 품번/규격 칸에 '6205 10개, 6206 5개'처럼 이어서 적으시면 돼요." +
      (form.note ? "\n\n" + form.note : "")
    ),
    text(form.tag + "\n" + form.fields.map((f) => f + ": " + ((f === "품번/규격" && item) || (f === "수량" && qty) || "")).join("\n")),
  ];
}

// 양식을 채워 보낸 메시지인지 확인하고 항목별로 나눔
function parseForm(u) {
  const form = Object.values(FORMS).find((f) => u.startsWith(f.tag));
  if (!form) return null;
  const values = {};
  for (const line of u.split(/\r?\n/).slice(1)) {
    const m = line.match(/^\s*([^:：]+)[:：]\s*(.*)$/);
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

// 손님이 채팅방에 보낸 사진(카카오가 이미지 주소로 전달) → 담당자 메일로 링크 전달
function isImage(u) {
  return /^https?:\/\/\S+$/i.test(u) && /(kakaocdn|kakao\.com|\.(jpe?g|png|gif|webp|heic)(\?|$))/i.test(u);
}
async function forwardImage(url, userId) {
  const { ok } = await postMail({
    _subject: "[SWS 카카오톡] 첨부 사진 (사업자등록증 등)",
    _template: "table",
    _captcha: "false",
    "문서 구분": "카카오톡 챗봇으로 받은 사진",
    "사진 주소": url,
    "카카오 사용자 ID": userId || "-",
    "안내": "같은 카카오 사용자 ID로 접수된 발주서·견적서와 함께 확인해 주세요. 사진 주소는 일정 기간이 지나면 열리지 않을 수 있어요.",
  });
  return reply([text(ok
    ? "사진을 받았어요. 발주서와 함께 담당자에게 전달했어요."
    : "사진을 전달하지 못했어요. 번거로우시겠지만 '상담 연결' 후 다시 보내 주시거나 " + PHONE + "으로 연락 주세요.")]);
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
        description: `접수번호 ${docNo}\n담당자가 확인 후 이 카카오톡으로 견적서를 보내드릴게요.\n견적서를 받고 주문하실 때 아래 [발주하기]를 눌러 주세요.`,
        buttons: [
          { action: "message", label: "발주하기", messageText: "발주 문의: " + item + (qty ? " | 수량 " + qty : "") },
          { action: "phone", label: "전화 문의", phoneNumber: PHONE },
        ],
      },
    }]);
  }
  if (ok) {
    return reply([text(`${form.name}가 접수되었어요. (접수번호 ${docNo})\n${values["연락처"] ? "담당자가 확인 후 적어 주신 연락처로 빠르게 회신드릴게요." : "담당자가 확인 후 이 카카오톡으로 빠르게 회신드릴게요."}\n급하시면 ${PHONE}으로 전화 주세요.` +
      (form.note ? "\n\n사업자등록증 사진을 아직 안 보내셨다면 이 채팅방에 보내 주세요." : ""))]);
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
      description: `• 카톡 상담: 담당자와 1:1 채팅\n• 전화 상담: ${PHONE}`,
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
    short: "취급 제품",
    q: "어떤 제품을 취급하나요?",
    a: "베어링·베어링 유닛을 중심으로 아답타·로크너트·와셔, 키&핀, 파워록, 강구·볼 리테이너, 테이크업 유닛, 스냅링, 오일씰·오링·유압씰, 오일게이지, 오일레스 부시, 접시·금형 스프링, 볼 플런저, 유닛 하우징, LM가이드 블록을 취급해요.",
    link: ["취급 제품 보기", "about-product.html"],
  },
  {
    short: "브랜드·정품",
    q: "정품인가요? 어떤 브랜드가 있나요?",
    a: "NACHI·IBC·JIB·WBC·JMC·ILJIN·TYB 제품을 공식 대리점 자격으로 직접 공급해요. 그 밖의 국내외 브랜드도 취급해요.",
    link: ["취급 브랜드 보기", "brands.html"],
  },
  {
    short: "형번 모를 때",
    q: "형번을 모르면 어떻게 찾나요?",
    a: "치수만 알아도 찾을 수 있어요. 이 채팅에 '내경 외경 두께' 순서로 보내 주세요.\n예) 25 52 15  또는  25*52",
  },
  {
    short: "견적 방법",
    q: "견적은 어떻게 받나요?",
    a: "하단 메뉴의 '견적문의'를 누르면 견적 문의서 양식이 나와요. 양식을 채워 보내 주시면 담당자가 확인 후 회신드려요.",
  },
  {
    short: "발주 방법",
    q: "발주는 어떻게 하나요?",
    a: "하단 메뉴의 '발주문의'를 누르면 발주서 양식이 나와요. 회사명·연락처·품번·수량을 적어 보내 주시면 접수돼요.",
  },
  {
    short: "카탈로그",
    q: "카탈로그를 볼 수 있나요?",
    a: "홈페이지 카탈로그 페이지에서 볼 수 있어요.",
    link: ["카탈로그 보기", "catalog.html"],
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
  if (f.link) card.buttons = [{ action: "webLink", label: f.link[0], webLinkUrl: SITE + f.link[1] }];
  return [{ textCard: card }, text("다른 질문은 'FAQ'를 눌러 주세요.")];
}

function answer(utterance, blockName) {
  const u = (utterance || "").trim();
  if (/웰컴|welcome/i.test(blockName || "")) return reply([text(WELCOME)]);
  // 인사·메뉴 요청은 첫인사와 같은 안내로(이미 대화한 적 있는 손님은 웰컴 블록이 다시 나오지 않음)
  if (!u || /^(안녕|하이|시작|처음|메뉴|hi|hello)/i.test(u)) return reply([text(WELCOME)]);
  if (/^(도움말|사용법|규격 ?검색 ?방법)/.test(u)) return reply([text(HELP)]);
  // 채팅방 하단 메뉴 [규격&품번] 등 — 숫자 없이 "규격/품번/형번/검색"만 오면 입력 안내
  if (!/\d/.test(u) && /규격|품번|형번|검색/.test(u)) {
    return reply([text(
      "찾으시는 형번이나 치수를 입력해 주세요.\n\n" +
      "■ 형번\n예) 6205, UC205, NK8/12\n\n" +
      "■ 치수 (내경 외경 두께)\n예) 25 52 15  또는  25*52"
    )]);
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
  if (/^카톡상담$/.test(compact)) return reply([text(KAKAO_CONSULT)]);
  if (/^(상담|상담문의|상담하기|전화상담)$/.test(compact)) return reply(consult(compact === "전화상담"));
  if (/^(FAQ|자주(하는|묻는)질문)$/i.test(compact)) return reply(faqList());
  const faq = FAQ.find((f) => f.q.replace(/\s+/g, "") === compact.replace(/^Q\.?/, ""));
  if (faq) return reply(faqAnswer(faq));
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
  const query = parse(cleaned);
  const rows = dedupe(search(query));
  if (!rows.length) {
    return reply([
      text(`'${u}'에 맞는 등록 규격을 찾지 못했어요.\n형번은 일부만, 치수는 '내경 외경 두께' 순서로 입력해 보세요.\n찾는 품목이 없으면 '견적 문의'를 눌러 주세요.`),
    ]);
  }
  const cards = rows.slice(0, MAX_CARDS).map((r) => ({
    title: ((r.p === "oilseal_samjung.html" ? "삼정 오일씰 " : "") + r.m).slice(0, 50),
    description: (`${r.c}\nd ${fmt(r.d)} · D ${fmt(r.D)} · ${load().PAGE_GROUP[r.p] === "베어링" ? "B" : "H"} ${fmt(r.h)} (mm)` +
      r.alts.map((a) => "\n" + a.replace(/^오일씰 NOK 호환표:/, "NOK 호환:")).join("")).slice(0, 230),
    // 카드에서 바로 견적·발주 — 누르면 품번이 채워진 양식이 나옴
    buttons: [
      { action: "message", label: "견적 문의", messageText: "견적 문의: " + cardName(r) },
      { action: "message", label: "발주 문의", messageText: "발주 문의: " + cardName(r) },
    ],
  }));
  const head =
    rows.length > MAX_CARDS
      ? `${rows.length}건을 찾았어요. 앞의 ${MAX_CARDS}건을 보여드려요.`
      : `${rows.length}건을 찾았어요.`;
  const outputs = [text(head), { carousel: { type: "textCard", items: cards } }];
  if (rows.length > MAX_CARDS) {
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
    else if (isImage(u)) res.status(200).json(await forwardImage(u, userId));
    else res.status(200).json(answer(utterance, blockName));
  } catch (e) {
    res.status(200).json(reply([text("일시적인 오류로 답변하지 못했어요. 잠시 후 다시 시도하거나 02-2613-3040으로 연락 주세요.")]));
  }
};
module.exports.answer = answer;
