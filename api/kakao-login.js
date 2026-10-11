// 사장님 카카오 계정 연결 시작 — /api/kakao-login?key=SETUP_KEY 로 한 번만 접속
// (SETUP_KEY를 아는 사람만 연결할 수 있게 해서, 다른 사람이 자기 계정을 연결하는 것을 막음)
const kakao = require('./_lib/kakao');

module.exports = (req, res) => {
  const key = String((req.query && req.query.key) || '');
  if (!kakao.configured() || !process.env.SETUP_KEY) return res.status(503).send('설정이 끝나지 않았습니다. Vercel 환경변수를 확인해 주세요.');
  if (key !== process.env.SETUP_KEY) return res.status(403).send('연결 권한이 없습니다.');
  const url = new URL('https://kauth.kakao.com/oauth/authorize');
  url.searchParams.set('client_id', process.env.KAKAO_REST_KEY);
  url.searchParams.set('redirect_uri', kakao.redirectUri(req));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'talk_message');
  url.searchParams.set('state', key);
  res.writeHead(302, { Location: url.toString() });
  res.end();
};
