// api/c.js - 짧은 URL용 API
const sharp = require('sharp');

// 코드 매핑 테이블 - 캐릭터와 감정 분리
const CHARACTER_CODES = {
  'a': 'girlA',
  'b': 'girlB', 
  'c': 'boyC',
  'd': 'catD'
};

const EMOTION_CODES = {
  '1': 'angry',
  '2': 'happy',
  '3': 'sad', 
  '4': 'smile',
  '5': 'surprised',
  '6': 'sleepy'
};

const BACKGROUND_CODES = {
  'f': 'forest',
  'b': 'beach', 
  'c': 'classroom',
  'r': 'bedroom',
  'p': 'park'
};

const POSITION_CODES = {
  'l': 'left',
  'c': 'center', 
  'r': 'right'
};

function decodeCharacter(charCode) {
  if (!charCode || charCode.length < 2) return null;
  
  const character = CHARACTER_CODES[charCode[0]];
  const emotion = EMOTION_CODES[charCode[1]];
  
  if (!character || !emotion) return null;
  
  return `${character}_${emotion}`;
}

const BACKGROUND_CODES = {
  'f': 'forest',
  'b': 'beach', 
  'c': 'classroom',
  'r': 'bedroom',
  'p': 'park'
};

const POSITION_CODES = {
  'l': 'left',
  'c': 'center', 
  'r': 'right'
};

function decodeParams(paramString) {
  if (!paramString) return {};
  
  // 패턴: left.center.right.bg.active
  const parts = paramString.split('.');
  const [leftCode, centerCode, rightCode, bgCode, activeCode] = parts;
  
  return {
    left: decodeCharacter(leftCode),
    center: decodeCharacter(centerCode), 
    right: decodeCharacter(rightCode),
    bg: BACKGROUND_CODES[bgCode] || null,
    active: POSITION_CODES[activeCode] || null
  };
}

export default async function handler(req, res) {
  try {
    const { p } = req.query;
    
    // 짧은 코드를 원래 파라미터로 변환
    const { left, center, right, bg, active } = decodeParams(p);
    
    // 캐시 키 생성
    const cacheKey = `${left || 'none'}_${center || 'none'}_${right || 'none'}_${bg || 'none'}_${active || 'none'}`;
    
    // 1. 캐시 확인
    try {
      const cacheUrl = `https://raw.githubusercontent.com/reat333/generated-cache/main/generated/${cacheKey}.png`;
      const cacheCheck = await fetch(cacheUrl);
      
      if (cacheCheck.ok) {
        const imageBuffer = await cacheCheck.arrayBuffer();
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        res.setHeader('X-Cache-Status', 'HIT');
        res.setHeader('X-Decoded-Params', JSON.stringify({left, center, right, bg, active}));
        return res.send(Buffer.from(imageBuffer));
      }
    } catch (e) {
      // 캐시 없음, 새로 생성
    }
    
    const width = 1440;
    const height = 960;
    
    // 2. 배경 처리 (기존과 동일)
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
        const bgColors = { forest: { r: 45, g: 80, b: 22 }, beach: { r: 135, g: 206, b: 235 } };
        const bgColor = bgColors[bg] || { r: 200, g: 200, b: 200 };
        baseImage = sharp({ create: { width, height, channels: 4, background: { ...bgColor, alpha: 1 } } });
      }
    } else {
      baseImage = sharp({ create: { width, height, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } } });
    }
    
    const positions = {
      left: { x: 360, y: height },
      center: { x: 720, y: height },
      right: { x: 1080, y: height }
    };
    
    const overlays = [];
    
    // 3. 캐릭터 처리 (기존 로직과 동일)
    for (const [pos, charName] of Object.entries({ left, center, right })) {
      if (charName && charName !== 'none') {
        try {
          const charUrl = `https://raw.githubusercontent.com/reat333/character-assets/main/characters/${charName}.png`;
          const charResponse = await fetch(charUrl);
          
          if (charResponse.ok) {
            const charBuffer = await charResponse.arrayBuffer();
            
            let charProcessor = sharp(Buffer.from(charBuffer))
              .resize({ height: 720, withoutEnlargement: true, fit: 'contain' });
            
            const isActive = active === pos;
            if (!isActive && active) {
              charProcessor = charProcessor
                .linear(0.5, -15)
                .modulate({ brightness: 0.7, saturation: 0.6 });
            }
            
            const processedCharBuffer = await charProcessor.png().toBuffer();
            const charMeta = await sharp(processedCharBuffer).metadata();
            
            overlays.push({
              input: processedCharBuffer,
              left: Math.round(positions[pos].x - (charMeta.width / 2)),
              top: Math.round(positions[pos].y - charMeta.height)
            });
            
          }
        } catch (e) {
          console.log(`캐릭터 처리 에러: ${charName}`, e.message);
        }
      }
    }
    
    // 4. 최종 합성
    let finalImage = baseImage;
    if (overlays.length > 0) {
      finalImage = baseImage.composite(overlays);
    }
    
    const imageBuffer = await finalImage.png({ quality: 90 }).toBuffer();
    
    // 5. 캐시 저장
    try {
      const base64Image = imageBuffer.toString('base64');
      const githubSaveUrl = `https://api.github.com/repos/reat333/generated-cache/contents/generated/${cacheKey}.png`;
      
      await fetch(githubSaveUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${process.env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Add cached image ${cacheKey}`,
          content: base64Image,
        })
      });
    } catch (cacheError) {
      console.log('캐시 저장 실패:', cacheError.message);
    }
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('X-Cache-Status', 'MISS');
    res.setHeader('X-Decoded-Params', JSON.stringify({left, center, right, bg, active}));
    res.send(imageBuffer);
    
  } catch (error) {
    console.error('API 에러:', error);
    
    const errorImage = sharp({
      create: { width: 1440, height: 960, channels: 4, background: { r: 255, g: 200, b: 200, alpha: 1 } }
    });
    
    const errorBuffer = await errorImage.png().toBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.send(errorBuffer);
  }
}
