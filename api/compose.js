// api/compose.js - 라벨 제거 버전
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
        console.log('배경 로드:', bgUrl);
        
        const bgResponse = await fetch(bgUrl);
        if (bgResponse.ok) {
          const bgBuffer = await bgResponse.arrayBuffer();
          
          baseImage = sharp(Buffer.from(bgBuffer))
            .resize(width, height)
            .png();
        } else {
          throw new Error('배경 이미지 로드 실패');
        }
      } catch (e) {
        console.log('배경 로드 실패, 기본 배경 사용:', e.message);
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
      baseImage = sharp({
        create: {
          width: width,
          height: height,
          channels: 4,
          background: { r: 240, g: 240, b: 240, alpha: 1 }
        }
      });
    }
    
    // 2. 캐릭터들 로드 및 배치 (하단 완전 정렬)
    const positions = {
      left: { x: 360, y: height },      // 왼쪽 (하단 완전 정렬)
      center: { x: 720, y: height },    // 가운데 (하단 완전 정렬)
      right: { x: 1080, y: height }     // 오른쪽 (하단 완전 정렬)
    };
    
    const overlays = [];
    
    // 각 캐릭터 처리
    for (const [pos, charName] of Object.entries({ left, center, right })) {
      if (charName && charName !== 'none') {
        try {
          const charUrl = `https://raw.githubusercontent.com/reat333/character-assets/main/characters/${charName}.png`;
          console.log('캐릭터 로드:', charUrl);
          
          const charResponse = await fetch(charUrl);
          if (charResponse.ok) {
            const charBuffer = await charResponse.arrayBuffer();
            
            // 캐릭터 크기 조절 (고해상도용 - 최대 높이 720px, 비율 유지)
            const resizedChar = await sharp(Buffer.from(charBuffer))
              .resize({ 
                height: 720, 
                withoutEnlargement: true,
                fit: 'contain'
              })
              .png()
              .toBuffer();
            
            const charMeta = await sharp(resizedChar).metadata();
            
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
    
    // 3. 색상 블록으로 디버그 정보 표시 (텍스트 없음)
    const activeChars = [left, center, right].filter(x => x && x !== 'none');
    if (activeChars.length > 0 || bg || active) {
      // active 파라미터 상태를 색상으로 표시
      let statusColor = 'gray';  // 기본: 회색 (active 없음)
      
      if (active === 'left') statusColor = 'red';      // 왼쪽 활성화: 빨강
      if (active === 'center') statusColor = 'green';  // 가운데 활성화: 초록  
      if (active === 'right') statusColor = 'blue';    // 오른쪽 활성화: 파랑
      
      const debugBlock = Buffer.from(`
        <svg width="200" height="50">
          <rect width="200" height="50" fill="black" stroke="white" stroke-width="3"/>
          <rect x="10" y="10" width="30" height="30" fill="${statusColor}" stroke="white" stroke-width="2"/>
          <rect x="50" y="10" width="20" height="30" fill="${left ? 'lightgreen' : 'darkred'}"/>
          <rect x="80" y="10" width="20" height="30" fill="${center ? 'lightgreen' : 'darkred'}"/>  
          <rect x="110" y="10" width="20" height="30" fill="${right ? 'lightgreen' : 'darkred'}"/>
          <rect x="140" y="10" width="50" height="30" fill="${bg ? 'orange' : 'purple'}"/>
        </svg>
      `);
      
      overlays.push({
        input: debugBlock,
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
    
    const errorSvg = Buffer.from(`
      <svg width="1440" height="960">
        <rect width="1440" height="960" fill="#ffebee"/>
        <text x="720" y="430" text-anchor="middle" font-size="48" fill="#c62828">
          🚨 이미지 생성 오류
        </text>
        <text x="720" y="530" text-anchor="middle" font-size="32" fill="#666">
          ${error.message}
        </text>
      </svg>
    `);
    
    const errorImage = await sharp(errorSvg).png().toBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.send(errorImage);
  }
}
