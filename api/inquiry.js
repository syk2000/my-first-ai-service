// 견적문의 → 사장님 카카오톡 '나와의 채팅'으로 자동 전송 (카카오 '나에게 보내기', 무료)
// 설정 전·실패 시 503/502를 돌려주고, 홈페이지는 '복사 + 채널 상담창' 방식으로 자동 전환
const kakao = require('./_lib/kakao');

const LIMIT = { name: 60, phone: 30, type: 30, message: 1000 };
const RATE_WINDOW_MS = 60 * 1000; // 같은 IP에서 1분에 한 번
const recent = new Map();

const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, max);
const digits = (v) => String(v || '').replace(/[^0-9]/g, '');
const kstNow = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method' });
  }
  if (!kakao.configured()) return res.status(503).json({ ok: false, error: 'not_configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  // 봇이 채우는 숨김 칸 — 값이 있으면 성공한 척하고 버림
  if (body.website) return res.status(200).json({ ok: true });

  const name = clean(body.name, LIMIT.name);
  const phone = clean(body.phone, LIMIT.phone);
  const type = clean(body.type, LIMIT.type) || '-';
  const message = clean(body.message, LIMIT.message);
  if (!name || digits(phone).length < 8 || !message || body.agree !== true) {
    return res.status(400).json({ ok: false, error: 'invalid' });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (Date.now() - (recent.get(ip) || 0) < RATE_WINDOW_MS) return res.status(429).json({ ok: false, error: 'too_many' });
  recent.set(ip, Date.now());

  const text = [
    '[SWS 홈페이지 견적 문의]',
    `회사명/성함: ${name}`,
    `연락처: ${phone}`,
    `문의 유형: ${type}`,
    `접수: ${kstNow()}`,
    '문의 내용:',
    message,
  ].join('\n');

  try {
    await kakao.sendToMe(text, kakao.siteUrl(req) + '/company-homepage/board.html');
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('inquiry send', e && e.message);
    const notLinked = /not_linked/.test(String(e && e.message));
    return res.status(notLinked ? 503 : 502).json({ ok: false, error: notLinked ? 'not_linked' : 'send_failed' });
  }
};
