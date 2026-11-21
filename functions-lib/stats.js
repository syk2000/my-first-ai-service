// 사이트·챗봇 이용 통계 — 익명 기록(D1 데이터베이스, 바인딩 이름 DB)
// IP·카카오 사용자 ID·쿠키는 저장하지 않음. 전화번호·메일 주소처럼 보이는 글자는 지우고 저장.

let ready = false;
async function ensure(db) {
  if (ready) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS ev (ts INTEGER NOT NULL, src TEXT, t TEXT, k TEXT, c TEXT, p TEXT, r TEXT, n INTEGER)"),
    db.prepare("CREATE INDEX IF NOT EXISTS ev_ts ON ev (ts)"),
  ]);
  ready = true;
}

// 개인정보로 보이는 부분 지우기
export function mask(s, max) {
  return String(s == null ? "" : s)
    .replace(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/g, "[메일]")
    .replace(/(?<!\d)0\d{1,2}[\s.\-)]*\d{3,4}[\s.\-]*\d{4}(?!\d)/g, "[번호]")
    .replace(/\d{9,}/g, "[번호]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, max || 60);
}

export async function record(db, e) {
  if (!db || !e || !e.t) return;
  try {
    await ensure(db);
    await db.prepare("INSERT INTO ev (ts, src, t, k, c, p, r, n) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(Date.now(), e.src || "web", e.t, e.k || null, e.c || null, e.p || null, e.r || null, Number.isFinite(e.n) ? e.n : null)
      .run();
  } catch (err) {
    console.error("stats record failed:", err.message);
  }
}
