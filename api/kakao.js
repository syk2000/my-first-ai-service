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
  { label: "연락처·위치", action: "message", messageText: "연락처" },
];

function reply(outputs) {
  return { version: "2.0", template: { outputs, quickReplies: QUICK } };
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

function answer(utterance, blockName) {
  const u = (utterance || "").trim();
  if (/웰컴|welcome/i.test(blockName || "")) return reply([text(WELCOME)]);
  // 인사·메뉴 요청은 첫인사와 같은 안내로(이미 대화한 적 있는 손님은 웰컴 블록이 다시 나오지 않음)
  if (!u || /^(안녕|하이|시작|처음|메뉴|hi|hello)/i.test(u)) return reply([text(WELCOME)]);
  if (/^(도움말|사용법|규격 ?검색 ?방법)/.test(u)) return reply([text(HELP)]);
  if (/견적|주문|문의/.test(u)) {
    return reply([
      {
        textCard: {
          title: "견적 문의",
          description: "형번·수량을 이 채팅에 남겨 주시면 담당자가 확인 후 답변드립니다.\n홈페이지 견적문의 양식으로도 접수할 수 있어요.",
          buttons: [
            { action: "webLink", label: "견적문의 양식", webLinkUrl: SITE + "board.html" },
            { action: "phone", label: "전화 문의", phoneNumber: "02-2613-3040" },
          ],
        },
      },
    ]);
  }
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

  const query = parse(u);
  const rows = search(query);
  if (!rows.length) {
    return reply([
      text(`'${u}'에 맞는 등록 규격을 찾지 못했어요.\n형번은 일부만, 치수는 '내경 외경 두께' 순서로 입력해 보세요.\n찾는 품목이 없으면 '견적 문의'를 눌러 주세요.`),
    ]);
  }
  const cards = rows.slice(0, MAX_CARDS).map((r) => ({
    title: String(r.m).slice(0, 50),
    description: `${r.c}\nd ${fmt(r.d)} · D ${fmt(r.D)} · ${load().PAGE_GROUP[r.p] === "베어링" ? "B" : "H"} ${fmt(r.h)} (mm)`.slice(0, 230),
    buttons: [{ action: "webLink", label: "규격표 보기", webLinkUrl: SITE + r.p + "#pick=" + encodeURIComponent(r.m) }],
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

module.exports = (req, res) => {
  if (req.method !== "POST") {
    res.status(200).json({ ok: true, info: "SWS TECH kakao skill — POST only" });
    return;
  }
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const utterance = body && body.userRequest ? body.userRequest.utterance : "";
  const blockName = (body && body.userRequest && body.userRequest.block && body.userRequest.block.name) ||
    (body && body.intent && body.intent.name) || "";
  try {
    res.status(200).json(answer(utterance, blockName));
  } catch (e) {
    res.status(200).json(reply([text("일시적인 오류로 답변하지 못했어요. 잠시 후 다시 시도하거나 02-2613-3040으로 연락 주세요.")]));
  }
};
module.exports.answer = answer;
