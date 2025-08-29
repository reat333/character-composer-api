// api/compose.js - 실제 이미지 생성 버전
const sharp = require('sharp');

export default async function handler(req, res) {
  try {
    const { left, center, right, bg } = req.query;
    
    // 1. 기본 캔버스 생성 (600x400 흰색)
    const width = 600;
    const height = 400;
    
    // 배경색 선택
    const bgColors = {
      forest: { r: 45, g: 80, b: 22 },
      room: { r: 139, g: 69, b: 19 },
      beach: { r: 135, g: 206, b: 235 },
      city: { r: 112, g: 128, b: 144 },
      space: { r: 25, g: 25, b: 112 },
    };
    
    const bgColor = bgColors[bg] || { r: 240, g: 240, b: 240 };
    
    // 2. 기본 배경 이미지 생성
    let baseImage = sharp({
      create: {
        width: width,
        height: height,
        channels: 4,
        background: { ...bgColor, alpha: 1 }
      }
    });
    
    // 3. 텍스트 오버레이로 캐릭터 시뮬레이션 (일단 테스트용)
    const overlays = [];
    
    // 캐릭터 위치 정의
    const positions = {
      left: { x: 100, y: 200 },
      center: { x: 300, y: 200 },
      right: { x: 500, y: 200 }
    };
    
    // 각 캐릭터 위치에 색깔 원 그리기 (테스트용)
    for (const [pos, charName] of Object.entries({ left, center, right })) {
      if (charName && charName !== 'none') {
        // 캐릭터별 색상
        const charColors = {
          'girl_happy': { r: 255, g: 105, b: 180 },  // 핑크
          'girl_sad': { r: 200, g: 100, b: 150 },    // 어두운 핑크
          'boy_happy': { r: 65, g: 105, b: 225 },    // 파란색
          'boy_sad': { r: 50, g: 80, b: 180 },       // 어두운 파란색
          'cat_happy': { r: 218, g: 165, b: 32 },    // 골드
        };
        
        const color = charColors[charName] || { r: 128, g: 128, b: 128 };
        
        // 간단한 원형 캐릭터 생성
        const circle = Buffer.from(`
          <svg width="80" height="80">
            <circle cx="40" cy="40" r="35" 
                    fill="rgb(${color.r},${color.g},${color.b})" 
                    stroke="white" stroke-width="3"/>
            <text x="40" y="50" text-anchor="middle" 
                  font-size="20" fill="white">${charName.includes('happy') ? '😊' : charName.includes('sad') ? '😢' : '🙂'}</text>
          </svg>
        `);
        
        overlays.push({
          input: circle,
          left: positions[pos].x - 40,
          top: positions[pos].y - 40
        });
      }
    }
    
    // 4. 배경 라벨 추가
    const label = Buffer.from(`
      <svg width="200" height="30">
        <rect width="200" height="30" fill="rgba(0,0,0,0.7)" rx="5"/>
        <text x="10" y="20" font-size="14" fill="white">
          🎭 ${bg || 'default'} / ${[left, center, right].filter(x => x).length}명
        </text>
      </svg>
    `);
    
    overlays.push({
      input: label,
      left: 10,
      top: 10
    });
    
    // 5. 모든 레이어 합성
    let finalImage = baseImage;
    
    if (overlays.length > 0) {
      finalImage = baseImage.composite(overlays);
    }
    
    // 6. PNG로 변환하여 반환
    const imageBuffer = await finalImage.png().toBuffer();
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5분 캐시
    res.send(imageBuffer);
    
  } catch (error) {
    console.error('이미지 생성 에러:', error);
    
    // 에러 발생시 간단한 에러 이미지
    const errorImage = sharp({
      create: {
        width: 600,
        height: 400,
        channels: 4,
        background: { r: 255, g: 200, b: 200, alpha: 1 }
      }
    });
    
    const errorBuffer = await errorImage.png().toBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.send(errorBuffer);
  }
}
