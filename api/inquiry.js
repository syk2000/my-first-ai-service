// 홈페이지 견적·발주 문의 → 회사 메일(네이버 SMTP)로 바로 발송
// Vercel 환경변수: SMTP_USER(네이버 아이디 또는 메일 주소), SMTP_PASS(네이버 애플리케이션 비밀번호), INQUIRY_TO(받는 주소, 없으면 SMTP 계정)
// 악용 방지: 우리 사이트에서 온 요청만, 숨은 칸(봇) 차단, 길이 제한, 같은 IP 10분에 5건까지
const tls = require("tls");

const HOST = "smtp.naver.com";
const ALLOWED_ORIGINS = [/^https:\/\/my-first-ai-service-pi\.vercel\.app$/, /^http:\/\/localhost(:\d+)?$/];
const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;
const recent = new Map(); // ip -> [시각…] (서버 인스턴스별 대략적 제한)

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const clean = (s, max) => String(s == null ? "" : s).replace(/\r/g, "").trim().slice(0, max);

function tooMany(ip) {
  const now = Date.now();
  const list = (recent.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  recent.set(ip, list);
  return list.length > LIMIT;
}

// 최소 SMTP 클라이언트(465 SSL, AUTH LOGIN) — 외부 패키지 없이
function smtpSend({ user, pass, from, to, raw }) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect(465, HOST, { servername: HOST });
    const steps = [
      [null, 220],
      ["EHLO sws-tech", 250],
      ["AUTH LOGIN", 334],
      [b64(user), 334],
      [b64(pass), 235],
      [`MAIL FROM:<${from}>`, 250],
      [`RCPT TO:<${to}>`, 250],
      ["DATA", 354],
      [raw.replace(/\n/g, "\r\n").replace(/^\./gm, "..") + "\r\n.", 250],
      ["QUIT", 221],
    ];
    let i = 0;
    let buf = "";
    const timer = setTimeout(() => { sock.destroy(); reject(new Error("timeout")); }, 15000);
    const next = () => {
      if (i >= steps.length) { clearTimeout(timer); sock.end(); return resolve(); }
      if (steps[i][0] != null) sock.write(steps[i][0] + "\r\n");
    };
    sock.on("data", (d) => {
      buf += d.toString("utf8");
      const lines = buf.split("\r\n").filter(Boolean);
      const last = lines[lines.length - 1] || "";
      if (!/^\d{3} /.test(last)) return; // 여러 줄 응답이 끝날 때까지
      buf = "";
      const code = Number(last.slice(0, 3));
      if (code !== steps[i][1]) { clearTimeout(timer); sock.destroy(); return reject(new Error("smtp " + code)); }
      i++;
      next();
    });
    sock.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

function buildMail({ from, to, d }) {
  const subject = `[SWS 홈페이지] 견적·발주 요청서 - ${d.name}`;
  const rows = [
    ["요청일시", new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ")],
    ["요청 업체/성함", d.name],
    [`회신 연락처(${d.email ? "이메일" : "전화번호"})`, d.contact],
    ["문의 유형", d.type],
    ["요청 품목 및 수량", d.message],
    ["회신 방법", d.email ? "위 이메일로 회신 — 이 메일에서 '답장'을 누르면 손님 이메일로 보내집니다" : "위 전화번호로 연락 후 회신"],
  ];
  const html = `<h3 style="margin:0 0 10px">견적·발주 요청서</h3><table border="1" cellpadding="8" style="border-collapse:collapse;font-size:14px">` +
    rows.map(([k, v]) => `<tr><th style="background:#f2f4f8;text-align:left;white-space:nowrap">${esc(k)}</th><td>${esc(v).replace(/\n/g, "<br>")}</td></tr>`).join("") +
    `</table>`;
  const replyTo = d.email && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(d.contact) ? `Reply-To: <${d.contact}>\n` : "";
  return (
    `From: =?UTF-8?B?${b64("SWS 홈페이지 문의")}?= <${from}>\n` +
    `To: <${to}>\n` +
    replyTo +
    `Subject: =?UTF-8?B?${b64(subject)}?=\n` +
    `MIME-Version: 1.0\n` +
    `Content-Type: text/html; charset=UTF-8\n` +
    `Content-Transfer-Encoding: base64\n\n` +
    b64(html).replace(/.{76}/g, "$&\n")
  );
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.some((re) => re.test(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!ALLOWED_ORIGINS.some((re) => re.test(origin))) return res.status(403).json({ ok: false });

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return res.status(503).json({ ok: false, reason: "not_configured" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  if (body.hp) return res.status(200).json({ ok: true }); // 봇은 조용히 버림
  const d = {
    name: clean(body.name, 100),
    contact: clean(body.contact, 100),
    email: body.contactKind === "email",
    type: clean(body.type, 30) || "견적·단가 문의",
    message: clean(body.message, 3000),
  };
  if (!d.name || !d.contact || !d.message) return res.status(400).json({ ok: false, reason: "empty" });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (tooMany(ip)) return res.status(429).json({ ok: false, reason: "too_many" });

  const from = user.includes("@") ? user : `${user}@naver.com`;
  const to = process.env.INQUIRY_TO || from;
  try {
    await smtpSend({ user, pass, from, to, raw: buildMail({ from, to, d }) });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("inquiry mail failed:", e.message);
    return res.status(502).json({ ok: false, reason: "send_failed" });
  }
};
