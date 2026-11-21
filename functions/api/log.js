// Cloudflare Pages 함수 — 홈페이지 이용 기록 받기(/api/log, 쓰기 전용)
// 정식 주소(sws-bearing.com)에서 온 기록만 받음. 검색 로봇은 기록하지 않음.
import { mask, record } from "../../functions-lib/stats.js";

const TYPES = new Set(["view", "search", "add", "dl", "inq", "kakao", "tel"]);
const BOT = /bot|crawl|spider|slurp|yeti|daum|preview|headless|lighthouse|monitor/i;

export async function onRequestPost({ request, env, waitUntil }) {
  const ok = new Response(null, { status: 204 });
  const self = new URL(request.url).origin;
  const origin = request.headers.get("Origin") || "";
  if (origin && origin !== self) return ok;
  if (BOT.test(request.headers.get("User-Agent") || "")) return ok;
  let b = {};
  try { b = JSON.parse((await request.text()).slice(0, 2000)); } catch (e) { return ok; }
  if (!TYPES.has(b.t)) return ok;
  waitUntil(record(env.DB, {
    src: "web",
    t: b.t,
    k: mask(b.k, 60),
    c: mask(b.c, 80),
    p: mask(b.p, 80),
    r: mask(b.r, 60),
    n: Number.isFinite(b.n) ? Math.max(0, Math.min(9999, Math.round(b.n))) : undefined,
  }));
  return ok;
}

export function onRequest() {
  return new Response(null, { status: 405 });
}
