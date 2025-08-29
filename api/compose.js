// api/compose.js - Sharp 실시간 어둡게 처리 버전
const sharp = require('sharp');

export default async function handler(req, res) {
  try {
    const { left, center, right, bg, active } = req.query;
    
    const width = 1440;
    const height = 960;
    
    // 1. 배경 이미지 로드
    let baseImage;
    
    if (bg) {
      try {
        const bgUrl = `https://raw.githubusercontent.com/reat333/character-assets/main/backgrounds/${bg}.png`;
        const bgResponse = await fetch(bgUrl);
        
        if (bgResponse.ok) {
          const bgBuffer = await bgResponse.arrayBuffer();
          baseImage = sharp(Buffer.from(bgBuffer)).resize(width, height).png();
        } else {
          throw new Error('배경 이미지 로드 실패');
        }
      } catch (e) {
        // 기본 배경색 사용
        const bgColors = {
          forest: { r: 45, g: 80, b: 22 },
          beach: { r: 135, g: 206, b: 235 },
        };
        const bgColor = bgColors[bg] || { r: 200, g: 200, b: 200 };
        
        baseImage = sharp({
          create: { width, height, channels: 4, background: { ...bgColor, alpha: 1 } }
        });
      }
    } else {
      baseImage = sharp({
        create: { width, height, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } }
      });
    }
    
    const positions = {
      left: { x: 360, y: height },
      center: { x: 720, y: height },
      right: { x: 1080, y: height }
    };
    
    const overlays = [];
    
    // 2. 각 캐릭터 처리
    for (const [pos, charName] of Object.entries({ left, center, right })) {
      if (charName && charName !== 'none') {
        try {
          const charUrl = `https://raw.githubusercontent.com/reat333/character-assets/main/characters/${charName}.png`;
          const charResponse = await fetch(charUrl);
          
          if (charResponse.ok) {
            const charBuffer = await charResponse.arrayBuffer();
            
            // Sharp 파이프라인 시작
            let charProcessor = sharp(Buffer.from(charBuffer))
              .resize({ height: 720, withoutEnlargement: true, fit: 'contain' });
            
            // 활성화 상태 확인 및 어둡게 처리
            const isActive = active === pos;
            
            if (!isActive && active) {
              // 비활성화 캐릭터: 실시간 어둡게 처리
              charProcessor = charProcessor
                .linear(0.5, -15)  // 밝기 50% 감소, 약간의 대비 감소
                .modulate({ brightness: 0.7, saturation: 0.6 });  // 추가 밝기/채도 조정
            }
            
            // 최종 버퍼 생성
            const processedCharBuffer = await charProcessor.png().toBuffer();
            const charMeta = await sharp(processedCharBuffer).metadata();
            
            overlays.push({
              input: processedCharBuffer,
              left: Math.round(positions[pos].x - (charMeta.width / 2)),
              top: Math.round(positions[pos].y - charMeta.height)
            });
            
          } else {
            console.log(`캐릭터 로드 실패: ${charName} (${charResponse.status})`);
          }
        } catch (e) {
          console.log(`캐릭터 처리 에러: ${charName}`, e.message);
        }
      }
    }
    
    // 3. 최종 합성
    let finalImage = baseImage;
    if (overlays.length > 0) {
      finalImage = baseImage.composite(overlays);
    }
    
    const imageBuffer = await finalImage.png({ quality: 90 }).toBuffer();
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(imageBuffer);
    
  } catch (error) {
    console.error('이미지 합성 에러:', error);
    
    // 에러 이미지 생성
    const errorImage = sharp({
      create: { width: 1440, height: 960, channels: 4, background: { r: 255, g: 200, b: 200, alpha: 1 } }
    });
    
    const errorBuffer = await errorImage.png().toBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.send(errorBuffer);
  }
}
