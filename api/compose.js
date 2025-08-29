// api/compose.js - Sharp 버전 (순수 코드 합성)
import sharp from 'sharp';

export default async function handler(req, res) {
  const { left, center, right, bg } = req.query;
  
  // 캐시 키 생성
  const cacheKey = `${left || 'none'}_${center || 'none'}_${right || 'none'}_${bg || 'none'}`;
  
  try {
    // 1. GitHub 캐시 확인
    const cacheUrl = `https://raw.githubusercontent.com/reat333/generated-cache/main/generated/${cacheKey}.png`;
    
    try {
      const cacheCheck = await fetch(cacheUrl);
      if (cacheCheck.ok) {
        const imageBuffer = await cacheCheck.arrayBuffer();
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        return res.send(Buffer.from(imageBuffer));
      }
    } catch (e) {
      // 캐시 없음, 새로 생성
    }
    
    // 2. 배경 이미지 로드 및 기본 캔버스 생성
    let baseImage;
    
    if (bg) {
      // 배경 이미지 다운로드
      const bgUrl = `https://raw.githubusercontent.com/reat333/character-assets/main/backgrounds/${bg}.jpg`;
      const bgResponse = await fetch(bgUrl);
      const bgBuffer = await bgResponse.arrayBuffer();
      
      // 배경을 600x400으로 리사이즈
      baseImage = sharp(Buffer.from(bgBuffer))
        .resize(600, 400)
        .jpeg({ quality: 90 });
    } else {
      // 기본 배경 (단색)
      baseImage = sharp({
        create: {
          width: 600,
          height: 400,
          channels: 4,
          background: { r: 240, g: 240, b: 240, alpha: 1 }
        }
      }).png();
    }
    
    // 3. 캐릭터 이미지들 로드 및 위치 계산
    const positions = {
      left: { left: 50, top: 100 },    // 왼쪽
      center: { left: 250, top: 100 }, // 가운데  
      right: { left: 450, top: 100 }   // 오른쪽
    };
    
    const overlays = []; // Sharp의 composite용 배열
    
    // 각 캐릭터 처리
    for (const [pos, charName] of Object.entries({ left, center, right })) {
      if (charName && charName !== 'none') {
        try {
          // 캐릭터 이미지 다운로드
          const charUrl = `https://raw.githubusercontent.com/reat333/character-assets/main/characters/${charName}.png`;
          const charResponse = await fetch(charUrl);
          const charBuffer = await charResponse.arrayBuffer();
          
          // 캐릭터 크기 조절 (최대 높이 250px)
          const resizedChar = await sharp(Buffer.from(charBuffer))
            .resize({ height: 250, withoutEnlargement: true })
            .png()
            .toBuffer();
          
          // 오버레이 배열에 추가
          overlays.push({
            input: resizedChar,
            left: positions[pos].left,
            top: positions[pos].top
          });
          
        } catch (e) {
          console.log(`캐릭터 로드 실패: ${charName}`);
        }
      }
    }
    
    // 4. 최종 합성
    let finalImage = baseImage;
    
    if (overlays.length > 0) {
      finalImage = baseImage.composite(overlays);
    }
    
    // PNG 버퍼로 변환
    const resultBuffer = await finalImage.png().toBuffer();
    
    // 5. GitHub에 저장 (선택사항)
    /*
    const base64Image = resultBuffer.toString('base64');
    await fetch(`https://api.github.com/repos/reat333/generated-cache/contents/generated/${cacheKey}.png`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Add generated image ${cacheKey}`,
        content: base64Image,
      }),
    });
    */
    
    // 6. 결과 반환
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(resultBuffer);
    
  } catch (error) {
    console.error('합성 에러:', error);
    
    // 에러 발생시 간단한 에러 이미지 생성
    const errorImage = sharp({
      create: {
        width: 600,
        height: 400,
        channels: 4,
        background: { r: 255, g: 200, b: 200, alpha: 1 }
      }
    }).png();
    
    const errorBuffer = await errorImage.toBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.send(errorBuffer);
  }
}

// package.json
{
  "name": "character-composer",
  "version": "1.0.0",
  "dependencies": {
    "sharp": "^0.33.2"
  }
}
