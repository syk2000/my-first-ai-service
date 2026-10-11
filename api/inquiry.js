// 견적문의 → 담당자 카카오톡 알림톡 전송 (Vercel 서버리스 함수, Solapi 사용)
//
// 필요한 Vercel 환경변수 (Project → Settings → Environment Variables):
//   SOLAPI_API_KEY      솔라피 API Key
//   SOLAPI_API_SECRET   솔라피 API Secret
//   SOLAPI_PFID         솔라피에 연결한 카카오톡 채널의 pfId (KA01PF…)
//   SOLAPI_TEMPLATE_ID  승인된 알림톡 템플릿 ID (KA01TP…)
//   SOLAPI_FROM         솔라피에 등록한 발신번호 (알림톡 실패 시 문자 대체 발송용)
//   INQUIRY_TO          알림을 받을 담당자 휴대폰 번호 (여러 명이면 쉼표로 구분)
//
// 템플릿 변수: #{회사명} #{연락처} #{유형} #{내용} #{일시}
const crypto = require('crypto');

const LIMIT = { name: 60, phone: 30, type: 30, message: 600 };
const RATE_WINDOW_MS = 60 * 1000; // 같은 IP에서 1분에 한 번
const recent = new Map();

const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, max);
const digits = (v) => String(v || '').replace(/[^0-9]/g, '');

function authHeader(key, secret) {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString('hex');
  const signature = crypto.createHmac('sha256', secret).update(date + salt).digest('hex');
  return `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}`;
}

function kstNow() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method' });
  }
  const env = process.env;
  const configured = ['SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_PFID', 'SOLAPI_TEMPLATE_ID', 'SOLAPI_FROM', 'INQUIRY_TO'].every((k) => env[k]);
  if (!configured) return res.status(503).json({ ok: false, error: 'not_configured' });

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
  const last = recent.get(ip) || 0;
  if (Date.now() - last < RATE_WINDOW_MS) return res.status(429).json({ ok: false, error: 'too_many' });
  recent.set(ip, Date.now());

  const variables = { '#{회사명}': name, '#{연락처}': phone, '#{유형}': type, '#{내용}': message, '#{일시}': kstNow() };
  const messages = env.INQUIRY_TO.split(',').map(digits).filter(Boolean).map((to) => ({
    to,
    from: digits(env.SOLAPI_FROM),
    kakaoOptions: { pfId: env.SOLAPI_PFID, templateId: env.SOLAPI_TEMPLATE_ID, variables, disableSms: false },
  }));

  try {
    const r = await fetch('https://api.solapi.com/messages/v4/send-many/detail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader(env.SOLAPI_API_KEY, env.SOLAPI_API_SECRET) },
      body: JSON.stringify({ messages }),
    });
    const data = await r.json().catch(() => ({}));
    const failed = Array.isArray(data.failedMessageList) ? data.failedMessageList.length : 0;
    if (!r.ok || failed >= messages.length) {
      console.error('solapi error', r.status, JSON.stringify(data).slice(0, 500));
      return res.status(502).json({ ok: false, error: 'send_failed' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('solapi exception', e && e.message);
    return res.status(502).json({ ok: false, error: 'send_failed' });
  }
};
