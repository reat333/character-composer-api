// api/compose.js - 극단적 디버깅 버전
const sharp = require('sharp');

export default async function handler(req, res) {
  try {
    const { left, center, right, bg, active } = req.query;
    
    console.log('=== API 호출 시작 ===');
    console.log('파라미터:', { left, center, right, bg, active });
    
    const width = 1440;
    const height = 960;
    
    // 1. 배경 생성
    let baseImage = sharp({
      create: {
        width: width,
        height: height,
        channels: 4,
        background: { r: 100, g: 150, b: 100, alpha: 1 }
      }
    });
    
    const positions = {
      left: { x: 360, y: height },
      center: { x: 720, y: height },
      right: { x: 1080, y: height }
    };
    
    const overlays = [];
    
    // 2. 각 캐릭터 처리 - 극도로 단순화
    for (const [pos, charName] of Object.entries({ left, center, right })) {
      if (charName && charName !== 'none') {
        
        console.log(`\n--- ${pos} 캐릭터 처리 시작 ---`);
        console.log(`원본 캐릭터명: ${charName}`);
        console.log(`active 파라미터: ${active}`);
        console.log(`현재 위치: ${pos}`);
        
        const isActive = active === pos;
        console.log(`isActive 계산: ${active} === ${pos} = ${isActive}`);
        
        let fileName;
        if (!isActive && active) {
          fileName = `${charName}_dark`;
          console.log(`🌫️ 어두운 버전 사용: ${fileName}`);
        } else {
          fileName = charName;
          console.log(`🌟 밝은 버전 사용: ${fileName}`);
        }
        
        const charUrl = `https://raw.githubusercontent.com/reat333/character-assets/main/characters/${fileName}.png`;
        console.log(`최종 URL: ${charUrl}`);
        
        try {
          const charResponse = await fetch(charUrl);
          console.log(`HTTP 응답 상태: ${charResponse.status}`);
          
          if (charResponse.ok) {
            const charBuffer = await charResponse.arrayBuffer();
            console.log(`이미지 데이터 크기: ${charBuffer.byteLength} bytes`);
            
            const resizedCharBuffer = await sharp(Buffer.from(charBuffer))
              .resize({ height: 720, withoutEnlargement: true, fit: 'contain' })
              .png()
              .toBuffer();
            
            const charMeta = await sharp(resizedCharBuffer).metadata();
            console.log(`리사이즈된 크기: ${charMeta.width}x${charMeta.height}`);
            
            overlays.push({
              input: resizedCharBuffer,
              left: Math.round(positions[pos].x - (charMeta.width / 2)),
              top: Math.round(positions[pos].y - charMeta.height)
            });
            
            console.log(`✅ ${pos} 캐릭터 성공적으로 추가됨`);
            
          } else {
            console.log(`❌ HTTP 에러: ${charResponse.status}`);
            
            // 폴백 시도
            if (fileName.includes('_dark')) {
              console.log(`폴백 시도: ${charName}.png`);
              const fallbackUrl = `https://raw.githubusercontent.com/reat333/character-assets/main/characters/${charName}.png`;
              const fallbackResponse = await fetch(fallbackUrl);
              
              if (fallbackResponse.ok) {
                console.log(`폴백 성공: ${fallbackResponse.status}`);
                // 폴백 로직...
              } else {
                console.log(`폴백도 실패: ${fallbackResponse.status}`);
              }
            }
          }
          
        } catch (e) {
          console.log(`💥 fetch 에러: ${e.message}`);
        }
        
        console.log(`--- ${pos} 캐릭터 처리 완료 ---\n`);
      }
    }
    
    console.log(`총 overlays 개수: ${overlays.length}`);
    
    // 3. 최종 합성
    let finalImage = baseImage;
    if (overlays.length > 0) {
      finalImage = baseImage.composite(overlays);
    }
    
    const imageBuffer = await finalImage.png({ quality: 90 }).toBuffer();
    console.log('=== API 처리 완료 ===');
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(imageBuffer);
    
  } catch (error) {
    console.log('💥💥💥 전체 에러:', error.message);
    console.log(error.stack);
    
    // 에러 응답
    res.status(500).json({ 
      error: 'API 처리 실패',
      message: error.message,
      stack: error.stack 
    });
  }
}
