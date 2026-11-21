// Cloudflare Pages 함수 — 카카오톡 챗봇 스킬 주소(/api/kakao)
// 답변 로직은 api/kakao.js(Vercel과 공통)를 그대로 씀. 질문 종류·검색어만 익명으로 통계에 남김
import kakao from "../../api/kakao.js";
import { mask, record } from "../../functions-lib/stats.js";

export async function onRequestPost({ request, env, waitUntil }) {
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const site = new URL(request.url).origin + "/";
  const out = await kakao.handle(body, site);
  const ev = kakao.classify(body, out);
  if (ev && env.DB) waitUntil(record(env.DB, { src: "kakao", t: ev.t, k: mask(ev.k, 60), n: ev.n }));
  return Response.json(out);
}

export function onRequest() {
  return Response.json({ ok: true, info: "SWS TECH kakao skill — POST only" });
}
