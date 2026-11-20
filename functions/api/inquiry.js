// Cloudflare Pages 함수 — 홈페이지 견적·발주 문의 → 회사 메일(네이버 SMTP)로 바로 발송
// 환경변수(Cloudflare 대시보드에서 입력): SMTP_USER(네이버 아이디 또는 메일 주소), SMTP_PASS(네이버 애플리케이션 비밀번호), INQUIRY_TO(받는 주소, 없으면 SMTP 계정)
// 악용 방지: 우리 사이트에서 온 요청만, 숨은 칸(봇) 차단, 길이 제한, 같은 IP 10분에 5건까지
import { connect } from "cloudflare:sockets";

const HOST = "smtp.naver.com";
const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;
const recent = new Map(); // ip -> [시각…] (서버 인스턴스별 대략적 제한)

// 같은 사이트(요청 주소와 같은 도메인)·로컬 테스트에서 온 요청만 허용
const allowed = (origin, self) => origin === self || /^http:\/\/localhost(:\d+)?$/.test(origin);

const b64 = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
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
async function smtpSend({ user, pass, from, to, raw }) {
  const sock = connect({ hostname: HOST, port: 465 }, { secureTransport: "on" });
  const writer = sock.writable.getWriter();
  const reader = sock.readable.getReader();
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let buf = "";
  const readReply = async () => {
    for (;;) {
      const lines = buf.split("\r\n");
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3} /.test(lines[i])) { // 여러 줄 응답의 마지막 줄
          buf = lines.slice(i + 1).join("\r\n");
          return Number(lines[i].slice(0, 3));
        }
      }
      const { value, done } = await reader.read();
      if (done) throw new Error("closed");
      buf += dec.decode(value, { stream: true });
    }
  };
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
  const run = async () => {
    for (const [cmd, want] of steps) {
      if (cmd != null) await writer.write(enc.encode(cmd + "\r\n"));
      const code = await readReply();
      if (code !== want) throw new Error("smtp " + code);
    }
  };
  let timer;
  try {
    await Promise.race([run(), new Promise((_, rej) => (timer = setTimeout(() => rej(new Error("timeout")), 15000)))]);
  } finally {
    clearTimeout(timer);
    try { await sock.close(); } catch (e) {}
  }
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

export async function onRequest({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const self = new URL(request.url).origin;
  const ok = allowed(origin, self);
  const headers = ok ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type" } : {};
  const json = (status, data) => Response.json(data, { status, headers });

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return json(405, { ok: false });
  if (!ok) return json(403, { ok: false });

  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  if (!user || !pass) return json(503, { ok: false, reason: "not_configured" });

  let body = {};
  try { body = await request.json(); } catch (e) {}
  if (body.hp) return json(200, { ok: true }); // 봇은 조용히 버림
  const d = {
    name: clean(body.name, 100),
    contact: clean(body.contact, 100),
    email: body.contactKind === "email",
    type: clean(body.type, 30) || "견적·단가 문의",
    message: clean(body.message, 3000),
  };
  if (!d.name || !d.contact || !d.message) return json(400, { ok: false, reason: "empty" });

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (tooMany(ip)) return json(429, { ok: false, reason: "too_many" });

  const from = user.includes("@") ? user : `${user}@naver.com`;
  const to = env.INQUIRY_TO || from;
  try {
    await smtpSend({ user, pass, from, to, raw: buildMail({ from, to, d }) });
    return json(200, { ok: true });
  } catch (e) {
    console.error("inquiry mail failed:", e.message);
    return json(502, { ok: false, reason: "send_failed" });
  }
}
