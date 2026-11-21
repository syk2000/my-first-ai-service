// Cloudflare Pages 함수 — 통계 자료(/stats/data). Cloudflare Access 로그인을 통과한 요청만 응답
// 환경변수: ACCESS_TEAM(예: 팀이름.cloudflareaccess.com), ACCESS_AUD(Access 애플리케이션의 AUD 태그)
// 둘 중 하나라도 없거나 로그인 토큰이 맞지 않으면 자료를 주지 않음(잠금 설정 전에는 아무도 못 봄)

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const dec = (s) => JSON.parse(new TextDecoder().decode(b64url(s)));
let certCache = { at: 0, keys: [] };

async function allowed(request, env) {
  const team = String(env.ACCESS_TEAM || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const aud = String(env.ACCESS_AUD || "").trim();
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion") || "";
  if (!team || !aud || !jwt) return false;
  try {
    const [h, p, s] = jwt.split(".");
    const header = dec(h);
    const body = dec(p);
    const auds = Array.isArray(body.aud) ? body.aud : [body.aud];
    if (!auds.includes(aud)) return false;
    if (body.iss !== `https://${team}`) return false;
    if (!body.exp || body.exp * 1000 < Date.now()) return false;
    if (Date.now() - certCache.at > 3600 * 1000) {
      const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
      certCache = { at: Date.now(), keys: (await r.json()).keys || [] };
    }
    const jwk = certCache.keys.find((k) => k.kid === header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(s), new TextEncoder().encode(h + "." + p));
  } catch (e) {
    return false;
  }
}

const KST = "'+9 hours'";

export async function onRequestGet({ request, env }) {
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (!(await allowed(request, env))) return Response.json({ ok: false, reason: "locked" }, { status: 403, headers });
  if (!env.DB) return Response.json({ ok: false, reason: "no_db" }, { status: 503, headers });

  const days = Math.max(1, Math.min(366, Number(new URL(request.url).searchParams.get("days")) || 30));
  const since = Date.now() - days * 86400 * 1000;
  const db = env.DB;
  const q = (sql, ...args) => db.prepare(sql).bind(since, ...args);
  const top = (src, t, n, col = "k") =>
    q(`SELECT ${col} AS k, MAX(c) AS c, COUNT(*) AS cnt, ROUND(AVG(n), 1) AS hits FROM ev WHERE ts >= ? AND src = ? AND t = ? AND ${col} IS NOT NULL AND ${col} != '' GROUP BY ${col} ORDER BY cnt DESC LIMIT ?`, src, t, n);

  try {
    const res = await db.batch([
      q(`SELECT src, t, COUNT(*) AS cnt FROM ev WHERE ts >= ? GROUP BY src, t`),
      q(`SELECT date(ts / 1000, 'unixepoch', ${KST}) AS day, src, COUNT(*) AS cnt FROM ev WHERE ts >= ? AND ((src = 'web' AND t = 'view') OR src = 'kakao') GROUP BY day, src ORDER BY day`),
      top("web", "view", 30, "p"),
      top("web", "search", 30),
      top("web", "add", 30),
      top("web", "dl", 20),
      q(`SELECT COALESCE(NULLIF(r, ''), '(직접 입력·즐겨찾기)') AS k, COUNT(*) AS cnt FROM ev WHERE ts >= ? AND src = 'web' AND t = 'view' GROUP BY 1 ORDER BY cnt DESC LIMIT 15`),
      top("kakao", "ksearch", 30),
      top("kakao", "kpick", 20),
      top("kakao", "kmenu", 20),
      q(`SELECT k, COUNT(*) AS cnt FROM ev WHERE ts >= ? AND src = 'web' AND t = 'search' AND n = 0 AND k != '' GROUP BY k ORDER BY cnt DESC LIMIT 20`),
      q(`SELECT k, COUNT(*) AS cnt FROM ev WHERE ts >= ? AND src = 'kakao' AND t = 'ksearch' AND n = 0 GROUP BY k ORDER BY cnt DESC LIMIT 20`),
    ]);
    const r = res.map((x) => x.results || []);
    return Response.json({
      ok: true, days,
      totals: r[0], daily: r[1], pages: r[2], searches: r[3], adds: r[4], downloads: r[5], referrers: r[6],
      kSearches: r[7], kPicks: r[8], kMenus: r[9], webMisses: r[10], kMisses: r[11],
    }, { headers });
  } catch (e) {
    // 아직 기록이 한 건도 없으면 표가 없음
    if (/no such table/i.test(e.message)) return Response.json({ ok: true, days, empty: true }, { headers });
    return Response.json({ ok: false, reason: "query_failed" }, { status: 500, headers });
  }
}
