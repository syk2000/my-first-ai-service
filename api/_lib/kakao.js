// 카카오 '나에게 보내기' — 사장님 카카오톡 '나와의 채팅'으로 메시지 전송 (무료)
// 환경변수: KAKAO_REST_KEY(REST API 키), KAKAO_CLIENT_SECRET(설정한 경우만), SITE_URL(예: https://도메인)
const { getJSON, setJSON } = require('./store');

const TOKEN_KEY = 'kakao_token';
const TEXT_LIMIT = 190; // 텍스트 메시지 1건 최대 200자 — 여유를 두고 나눔

function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  const host = req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host);
  return host ? `https://${host}` : '';
}

const redirectUri = (req) => siteUrl(req) + '/api/kakao-callback';

async function tokenRequest(params) {
  const body = new URLSearchParams({ client_id: process.env.KAKAO_REST_KEY, ...params });
  if (process.env.KAKAO_CLIENT_SECRET) body.set('client_secret', process.env.KAKAO_CLIENT_SECRET);
  const r = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) throw new Error('kakao_token ' + (data.error_code || data.error || r.status));
  return data;
}

// 처음 로그인(인가 코드)으로 받은 토큰 저장
async function saveFromCode(code, req) {
  const t = await tokenRequest({ grant_type: 'authorization_code', redirect_uri: redirectUri(req), code });
  await setJSON(TOKEN_KEY, {
    access_token: t.access_token,
    access_expires: Date.now() + (t.expires_in - 60) * 1000,
    refresh_token: t.refresh_token,
    refresh_expires: Date.now() + (t.refresh_token_expires_in || 0) * 1000,
  });
}

// 리프레시 토큰으로 갱신 — 카카오가 새 리프레시 토큰을 주면 함께 교체(만료 1개월 전부터 발급됨)
async function refresh(saved) {
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: saved.refresh_token });
  const next = {
    ...saved,
    access_token: t.access_token,
    access_expires: Date.now() + (t.expires_in - 60) * 1000,
  };
  if (t.refresh_token) {
    next.refresh_token = t.refresh_token;
    next.refresh_expires = Date.now() + (t.refresh_token_expires_in || 0) * 1000;
  }
  await setJSON(TOKEN_KEY, next);
  return next;
}

async function accessToken() {
  const saved = await getJSON(TOKEN_KEY);
  if (!saved) throw new Error('not_linked');
  if (saved.access_token && Date.now() < saved.access_expires) return saved.access_token;
  return (await refresh(saved)).access_token;
}

// 긴 글은 줄 단위로 190자 이하 조각으로 나눔
function chunks(text) {
  const out = [];
  let cur = '';
  for (const line of text.split('\n')) {
    let rest = line;
    while (rest.length > TEXT_LIMIT) {
      if (cur) { out.push(cur); cur = ''; }
      out.push(rest.slice(0, TEXT_LIMIT));
      rest = rest.slice(TEXT_LIMIT);
    }
    const next = cur ? cur + '\n' + rest : rest;
    if (next.length > TEXT_LIMIT) { out.push(cur); cur = rest; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

async function sendToMe(text, link) {
  const token = await accessToken();
  const parts = chunks(text);
  for (let i = 0; i < parts.length; i++) {
    const body = parts.length > 1 ? `(${i + 1}/${parts.length}) ${parts[i]}` : parts[i];
    const template = {
      object_type: 'text',
      text: body.slice(0, 200),
      link: { web_url: link, mobile_web_url: link },
      button_title: '홈페이지 열기',
    };
    const r = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: new URLSearchParams({ template_object: JSON.stringify(template) }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.result_code !== 0) throw new Error('kakao_send ' + (data.code || r.status) + ' ' + (data.msg || ''));
  }
}

const configured = () => Boolean(process.env.KAKAO_REST_KEY && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

module.exports = { siteUrl, redirectUri, saveFromCode, refresh, accessToken, sendToMe, chunks, configured, getJSON, TOKEN_KEY };
