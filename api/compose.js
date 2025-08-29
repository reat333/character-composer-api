// api/compose.js - 실제 이미지 로드 버전
const sharp = require('sharp');

export default async function handler(req, res) {
  try {
    const { left, center, right, bg } = req.query;
    
    const width = 600;
    const height = 400;
    
    // 1. 배경 이미지 로드
    let baseImage;
    
    if (bg) {
      try {
        // GitHub에서 배경 이미지 다운로드
        const bgUrl = `https://raw.githubusercontent.com/reat333/character-assets/main/backgrounds/${bg}.png`;
        console.log('배경 로드:', bgUrl);
        
        const bgResponse = await fetch(bgUrl);
        if (bgResponse.ok) {
          const bgBuffer = await bgResponse.arrayBuffer();
          
          // 배경을 600x400으로 리사이즈
          baseImage = sharp(Buffer.from(bgBuffer))
            .resize(width, height)
            .png();
        } else {
          throw new Error('배경 이미지 로드 실패');
        }
      } catch (e) {
        console.log('배경 로드 실패, 기본 배경 사용:', e.message);
        // 기본 배경색 사용
        const bgColors = {
          forest: { r: 45, g: 80, b: 22 },
          beach: { r: 135, g: 206, b: 235 },
        };
        const bgColor = bgColors[bg] || { r: 200, g: 200, b: 200 };
        
        baseImage = sharp({
          create: {
            width: width,
            height: height,
            channels: 4,
            background: { ...bgColor, alpha: 1 }
          }
        });
      }
    } else {
      // 기본 회색 배경
      baseImage = sharp({
        create: {
          width: width,
          height: height,
          channels: 4,
          background: { r: 240, g: 240, b: 240, alpha: 1 }
        }
      });
    }
    
    // 2. 캐릭터들 로드 및 배치
    const positions = {
      left: { x: 100, y: height - 50 },    // 왼쪽 하단
      center: { x: 300, y: height - 50 },  // 가운데 하단  
      right: { x: 500, y: height - 50 }    // 오른쪽 하단
    };
    
    const overlays = [];
    
    // 각 캐릭터 처리
    for (const [pos, charName] of Object.entries({ left, center, right })) {
      if (charName && charName !== 'none') {
        try {
          // GitHub에서 캐릭터 이미지 다운로드
          const charUrl = `https://raw.githubusercontent.com/reat333/character-assets/main/characters/${charName}.png`;
          console.log('캐릭터 로드:', charUrl);
          
          const charResponse = await fetch(charUrl);
          if (charResponse.ok) {
            const charBuffer = await charResponse.arrayBuffer();
            
            // 캐릭터 크기 조절 (최대 높이 300px, 비율 유지)
            const resizedChar = await sharp(Buffer.from(charBuffer))
              .resize({ 
                height: 300, 
                withoutEnlargement: true,
                fit: 'contain'
              })
              .png()
              .toBuffer();
            
            // 캐릭터 크기 정보 얻기
            const charMeta = await sharp(resizedChar).metadata();
            
            // 하단 중앙 정렬로 배치
            overlays.push({
              input: resizedChar,
              left: Math.round(positions[pos].x - (charMeta.width / 2)),
              top: Math.round(positions[pos].y - charMeta.height)
            });
            
            console.log(`${pos} 캐릭터 배치: ${charName} (${charMeta.width}x${charMeta.height})`);
          } else {
            console.log(`캐릭터 로드 실패: ${charName} (${charResponse.status})`);
          }
        } catch (e) {
          console.log(`캐릭터 처리 에러: ${charName}`, e.message);
        }
      }
    }
    
    // 3. 정보 라벨 추가 (선택사항)
    const activeChars = [left, center, right].filter(x => x && x !== 'none');
    if (activeChars.length > 0 || bg) {
      const label = Buffer.from(`
        <svg width="250" height="25">
          <rect width="250" height="25" fill="rgba(0,0,0,0.6)" rx="3"/>
          <text x="8" y="17" font-size="12" fill="white">
            🎭 ${bg || 'no-bg'} | ${activeChars.join(', ') || 'no-chars'}
          </text>
        </svg>
      `);
      
      overlays.push({
        input: label,
        left: 10,
        top: 10
      });
    }
    
    // 4. 최종 합성
    let finalImage = baseImage;
    
    if (overlays.length > 0) {
      finalImage = baseImage.composite(overlays);
    }
    
    // 5. PNG로 출력
    const imageBuffer = await finalImage.png({ quality: 90 }).toBuffer();
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(imageBuffer);
    
  } catch (error) {
    console.error('이미지 합성 에러:', error);
    
    // 에러 이미지 생성
    const errorSvg = Buffer.from(`
      <svg width="600" height="400">
        <rect width="600" height="400" fill="#ffebee"/>
        <text x="300" y="180" text-anchor="middle" font-size="20" fill="#c62828">
          🚨 이미지 생성 오류
        </text>
        <text x="300" y="220" text-anchor="middle" font-size="14" fill="#666">
          ${error.message}
        </text>
      </svg>
    `);
    
    const errorImage = await sharp(errorSvg).png().toBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.send(errorImage);
  }
}
