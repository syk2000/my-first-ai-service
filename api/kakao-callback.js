// 카카오 로그인 후 돌아오는 주소 — 토큰을 저장하고 시험 메시지를 보냄
const kakao = require('./_lib/kakao');

const page = (title, msg) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:sans-serif;max-width:520px;margin:60px auto;padding:0 20px;line-height:1.6"><h2>${title}</h2><p>${msg}</p></body></html>`;

module.exports = async (req, res) => {
  const q = req.query || {};
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!process.env.SETUP_KEY || q.state !== process.env.SETUP_KEY) return res.status(403).send(page('연결 실패', '연결 권한이 없습니다.'));
  if (q.error || !q.code) return res.status(400).send(page('연결 실패', '카카오 로그인 또는 메시지 전송 동의가 취소되었습니다. 다시 시도해 주세요.'));
  try {
    await kakao.saveFromCode(String(q.code), req);
    await kakao.sendToMe('[SWS 홈페이지] 카카오톡 연결이 완료되었습니다.\n이제 홈페이지 견적 문의가 이 대화방으로 도착합니다.', kakao.siteUrl(req) + '/company-homepage/board.html');
    return res.status(200).send(page('연결 완료', '카카오톡 \'나와의 채팅\'에 시험 메시지를 보냈습니다. 이제 홈페이지 견적 문의가 이 계정으로 도착합니다. 이 창은 닫으셔도 됩니다.'));
  } catch (e) {
    console.error('kakao callback', e && e.message);
    return res.status(500).send(page('연결 실패', '토큰 저장 또는 시험 메시지 전송에 실패했습니다. 카카오 개발자 앱의 Redirect URI·동의항목(카카오톡 메시지 전송) 설정을 확인해 주세요.'));
  }
};
