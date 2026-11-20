// Cloudflare Pages 함수 — 카카오톡 챗봇 스킬 주소(/api/kakao)
// 답변 로직은 api/kakao.js(Vercel과 공통)를 그대로 씀
import kakao from "../../api/kakao.js";

export async function onRequestPost({ request }) {
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const site = new URL(request.url).origin + "/";
  return Response.json(await kakao.handle(body, site));
}

export function onRequest() {
  return Response.json({ ok: true, info: "SWS TECH kakao skill — POST only" });
}
