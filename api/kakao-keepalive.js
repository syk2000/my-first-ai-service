// 매주 자동 실행(Vercel Cron) — 토큰을 갱신해 문의가 없는 기간에도 카카오 연결이 끊기지 않게 함
const kakao = require('./_lib/kakao');

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ ok: false });
  if (!kakao.configured()) return res.status(503).json({ ok: false, error: 'not_configured' });
  try {
    const saved = await kakao.getJSON(kakao.TOKEN_KEY);
    if (!saved) return res.status(409).json({ ok: false, error: 'not_linked' });
    await kakao.refresh(saved);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('kakao keepalive', e && e.message);
    return res.status(502).json({ ok: false, error: 'refresh_failed' });
  }
};
