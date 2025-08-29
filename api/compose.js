// api/compose.js - 간단한 테스트 버전
export default async function handler(req, res) {
  try {
    const { left, center, right, bg } = req.query;
    
    // 일단 파라미터 확인용 텍스트 응답
    const params = {
      left: left || 'none',
      center: center || 'none', 
      right: right || 'none',
      bg: bg || 'none'
    };
    
    // 간단한 HTML 응답으로 파라미터 확인
    const html = `
      <html>
        <body style="font-family: Arial; padding: 20px;">
          <h2>🎭 Character Composer API 작동 중!</h2>
          <p><strong>받은 파라미터:</strong></p>
          <ul>
            <li>Left: ${params.left}</li>
            <li>Center: ${params.center}</li>
            <li>Right: ${params.right}</li>
            <li>Background: ${params.bg}</li>
          </ul>
          <p><strong>테스트 URL들:</strong></p>
          <ul>
            <li><a href="/api/compose?bg=forest">배경만 테스트</a></li>
            <li><a href="/api/compose?left=girl_happy&bg=forest">캐릭터+배경 테스트</a></li>
          </ul>
          <p>✅ API가 정상 작동합니다!</p>
        </body>
      </html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
    
  } catch (error) {
    console.error('API 에러:', error);
    res.status(500).json({ 
      error: 'API 에러 발생',
      message: error.message 
    });
  }
}
