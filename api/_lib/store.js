// 카카오 토큰 보관용 무료 저장소 (Upstash Redis REST API)
// 환경변수: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
async function command(args) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('store_not_configured');
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error('store_error ' + (data.error || r.status));
  return data.result;
}

async function getJSON(key) {
  const v = await command(['GET', key]);
  return v ? JSON.parse(v) : null;
}

async function setJSON(key, value) {
  await command(['SET', key, JSON.stringify(value)]);
}

module.exports = { getJSON, setJSON };
