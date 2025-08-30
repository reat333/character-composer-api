// api/c.js - 수정된 버전 (import 문제 해결)
const sharp = require('sharp');

// 매핑 테이블들
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
  'p': 'park',
  'h': 'home'
};

const POSITION_CODES = {
  'l': 'left',
  'c': 'center', 
  'r': 'right'
};

// api/c.js - 다중 구도 및 키 시스템 추가
const sharp = require('sharp');

// 매핑 테이블들
const CHARACTER_CODES = {
  'a': 'girlA',
  'b': 'girlB', 
  'c': 'girlC'
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
  'p': 'park',
  'h': 'home'
};

const POSITION_CODES = {
  'l': 'left',
  'c': 'center', 
  'r': 'right'
};

const LAYOUT_CODES = {
  '2': 'two_person',    // 2인 구도
  '3': 'three_person'   // 3인 구도 (기본값)
};

// 캐릭터별 고정 키 설정
const CHARACTER_HEIGHTS = {
  'girlA': 's',   // 작은 키
  'girlB': 'm',   // 중간 키
  'girlC': 'l'    // 큰 키
};

const HEIGHT_CROP_RATIOS = {
  's': { two_person: 0.10, three_person: 0.05 },    // 작은 키
  'm': { two_person: 0.05, three_person: 0.025 },   // 중간 키
  'l': { two_person: 0.00, three_person: 0.00 }     // 큰 키
};

function decodeCharacter(charCode) {
  if (!charCode || charCode.length < 2) return null;
  
  const character = CHARACTER_CODES[charCode[0]];
  const emotion = EMOTION_CODES[charCode[1]];
  
  if (!character || !emotion) return null;
  
  return `${character}_${emotion}`;
}

function decodeParams(paramString) {
  if (!paramString) return { layout: 'three_person' }; // 기본값
  
  const parts = paramString.split('.');
  
  // 마지막 파트로 레이아웃 판단
  const lastPart = parts[parts.length - 1];
  const layout = LAYOUT_CODES[lastPart] || 'three_person';
  
  if (layout === 'two_person') {
    // 2인 구도: left.right.bg.active.2
    const [leftCode, rightCode, bgCode, activeCode, layoutCode] = parts;
    return {
      left: decodeCharacter(leftCode),
      center: null,
      right: decodeCharacter(rightCode),
      bg: BACKGROUND_CODES[bgCode] || null,
      active: POSITION_CODES[activeCode] || null,
      layout: layout
    };
  } else {
    // 3인 구도: left.center.right.bg.active.3
    const [leftCode, centerCode, rightCode, bgCode, activeCode, layoutCode] = parts;
    return {
      left: decodeCharacter(leftCode),
      center: decodeCharacter(centerCode),
      right: decodeCharacter(rightCode),
      bg: BACKGROUND_CODES[bgCode] || null,
      active: POSITION_CODES[activeCode] || null,
      layout: layout
    };
  }
}

function getLayoutConfig(layout) {
  const width = 1440;
  const height = 960;
  
  if (layout === 'two_person') {
    return {
      characterSize: 840,
      positions: {
        left: { x: width * 0.25, y: height },    // 1/4 지점
        right: { x: width * 0.75, y: height }    // 3/4 지점
      }
    };
  } else { // three_person
    return {
      characterSize: 740,
      positions: {
        left: { x: 360, y: height },
        center: { x: 720, y: height },
        right: { x: 1080, y: height }
      }
    };
  }
}

function getHeightAdjustment(characterName, layout) {
  if (!characterName) return 0;
  
  // 캐릭터명에서 실제 캐릭터 추출 (예: 'girlA_angry' -> 'girlA')
  const baseCharacter = characterName.split('_')[0];
  const heightType = CHARACTER_HEIGHTS[baseCharacter] || 'l'; // 기본값: 큰 키
  
  const layoutConfig = getLayoutConfig(layout);
  const cropRatio = HEIGHT_CROP_RATIOS[heightType][layout] || 0;
  
  return Math.floor(layoutConfig.characterSize * cropRatio);
}

export default async function handler(req, res) {
  try {
    const { p } = req.query;
    
    // 짧은 코드를 원래 파라미터로 변환
    const { left, center, right, bg, active, layout } = decodeParams(p);
    
    // 레이아웃 설정 가져오기
    const layoutConfig = getLayoutConfig(layout);
    
    // 캐시 키 생성
    const cacheKey = `${left || 'none'}_${center || 'none'}_${right || 'none'}_${bg || 'none'}_${active || 'none'}_${layout}`;
    
    // 1. 캐시 확인
    try {
      const cacheUrl = `https://raw.githubusercontent.com/reat333/generated-cache/main/generated/${cacheKey}.png`;
      const cacheCheck = await fetch(cacheUrl);
      
      if (cacheCheck.ok) {
        const imageBuffer = await cacheCheck.arrayBuffer();
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        res.setHeader('X-Cache-Status', 'HIT');
        res.setHeader('X-Decoded-Params', JSON.stringify({left, center, right, bg, active, layout}));
        return res.send(Buffer.from(imageBuffer));
      }
    } catch (e) {
      // 캐시 없음, 새로 생성
    }
    
    const width = 1440;
    const height = 960;
    
    // 2. 배경 처리
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
    
    // 3. 캐릭터 처리 - 액티브하지 않은 캐릭터들 먼저 처리
    const overlays = [];
    const activeCharacterOverlay = []; // 액티브 캐릭터는 별도 저장
    
    const characters = {};
    if (layout === 'two_person') {
      characters.left = left;
      characters.right = right;
    } else {
      characters.left = left;
      characters.center = center;
      characters.right = right;
    }
    
    for (const [pos, charName] of Object.entries(characters)) {
      if (charName && charName !== 'none' && layoutConfig.positions[pos]) {
        try {
          const charUrl = `https://raw.githubusercontent.com/reat333/character-assets/main/characters/${charName}.png`;
          const charResponse = await fetch(charUrl);
          
          if (charResponse.ok) {
            const charBuffer = await charResponse.arrayBuffer();
            
            // 캐릭터 키에 따른 하단 크롭
            const heightAdjustment = getHeightAdjustment(charName, layout);
            
            let charProcessor = sharp(Buffer.from(charBuffer))
              .resize({ height: layoutConfig.characterSize, withoutEnlargement: true, fit: 'contain' });
            
            // 키에 따른 하단 크롭
            if (heightAdjustment > 0) {
              const metadata = await charProcessor.metadata();
              charProcessor = charProcessor.extract({
                left: 0,
                top: 0,
                width: metadata.width,
                height: Math.max(1, metadata.height - heightAdjustment)
              });
            }
            
            // 활성화 상태에 따른 어둡게 처리
            const isActive = active === pos;
            if (!isActive && active) {
              charProcessor = charProcessor
                .linear(0.5, -15)
                .modulate({ brightness: 0.7, saturation: 0.6 });
            }
            
            const processedCharBuffer = await charProcessor.png().toBuffer();
            const charMeta = await sharp(processedCharBuffer).metadata();
            
            const overlay = {
              input: processedCharBuffer,
              left: Math.round(layoutConfig.positions[pos].x - (charMeta.width / 2)),
              top: Math.round(layoutConfig.positions[pos].y - charMeta.height)
            };
            
            // 액티브 캐릭터는 별도 저장, 나머지는 바로 추가
            if (isActive) {
              activeCharacterOverlay.push(overlay);
            } else {
              overlays.push(overlay);
            }
            
          }
        } catch (e) {
          console.log(`캐릭터 처리 에러: ${charName}`, e.message);
        }
      }
    }
    
    // 액티브 캐릭터를 마지막에 추가 (최상위 레이어)
    overlays.push(...activeCharacterOverlay);
    
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
    res.setHeader('X-Decoded-Params', JSON.stringify({left, center, right, bg, active, layout}));
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
