// api/compose.js - Vercel 서버리스 함수
import { createCanvas, loadImage } from 'canvas';

export default async function handler(req, res) {
  const { left, center, right, bg } = req.query;
  
  // 캐시 파일명 생성
  const cacheKey = `${left || 'none'}_${center || 'none'}_${right || 'none'}_${bg || 'none'}.png`;
  
  try {
    // 1. 먼저 GitHub에서 캐시된 파일이 있는지 확인
    const cacheUrl = `https://raw.githubusercontent.com/username/cache-repo/main/generated/${cacheKey}`;
    
    try {
      const cacheCheck = await fetch(cacheUrl);
      if (cacheCheck.ok) {
        // 캐시된 파일이 있으면 바로 반환
        const imageBuffer = await cacheCheck.arrayBuffer();
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1년 캐시
        return res.send(Buffer.from(imageBuffer));
      }
    } catch (e) {
      // 캐시 파일 없음 → 새로 생성
    }
    
    // 2. 새로 합성하기
    const canvas = createCanvas(600, 400);
    const ctx = canvas.getContext('2d');
    
    // 배경 그리기
    if (bg) {
      const bgImage = await loadImage(`https://raw.githubusercontent.com/username/assets-repo/main/backgrounds/${bg}.jpg`);
      ctx.drawImage(bgImage, 0, 0, 600, 400);
    } else {
      // 기본 배경
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, 600, 400);
    }
    
    // 캐릭터들 그리기
    const positions = {
      left: { x: 100, y: 280 },
      center: { x: 300, y: 280 }, 
      right: { x: 500, y: 280 }
    };
    
    for (const [pos, charData] of Object.entries({ left, center, right })) {
      if (charData && charData !== 'none') {
        try {
          const charImage = await loadImage(`https://raw.githubusercontent.com/username/assets-repo/main/characters/${charData}.png`);
          const position = positions[pos];
          
          // 캐릭터 크기 조절하며 그리기
          const charWidth = charImage.width * 0.8;
          const charHeight = charImage.height * 0.8;
          
          ctx.drawImage(
            charImage, 
            position.x - charWidth/2, 
            position.y - charHeight, 
            charWidth, 
            charHeight
          );
        } catch (e) {
          console.log(`캐릭터 로드 실패: ${charData}`);
        }
      }
    }
    
    // 3. 합성 결과를 GitHub에 저장 (GitHub API 사용)
    const imageBuffer = canvas.toBuffer('image/png');
    
    // GitHub에 저장하는 로직 (실제로는 GitHub API 토큰 필요)
    const githubSaveUrl = `https://api.github.com/repos/username/cache-repo/contents/generated/${cacheKey}`;
    const base64Image = imageBuffer.toString('base64');
    
    await fetch(githubSaveUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Add generated image ${cacheKey}`,
        content: base64Image,
      })
    });
    
    // 4. 이미지 반환
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(imageBuffer);
    
  } catch (error) {
    console.error('합성 에러:', error);
    res.status(500).json({ error: 'Image composition failed' });
  }
}

// package.json
{
  "dependencies": {
    "canvas": "^2.11.2"
  }
}
