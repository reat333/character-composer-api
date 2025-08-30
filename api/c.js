// api/c.js - 기능 추가 버전
const sharp = require('sharp');

// --- 매핑 테이블 ---
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

// 키(height)에 따른 하단 잘림 비율 정의
// [s, m, l]
const HEIGHT_CROP_MAPPING = {
  // 2인 구도일 때
  twoChar: { s: 0.10, m: 0.05, l: 0 },
  // 3인 구도(또는 1인)일 때
  threeChar: { s: 0.05, m: 0.025, l: 0 }
};


/**
 * 캐릭터 코드를 파싱하여 이름과 키 정보를 반환합니다.
 * @param {string} charCode - 예: "a1s" (캐릭터a, 감정1, 키s)
 * @returns {object|null} - 예: { name: "girlA_angry", height: "s" }
 */
function decodeCharacter(charCode) {
  if (!charCode || charCode.length < 2) return null;

  const character = CHARACTER_CODES[charCode[0]];
  const emotion = EMOTION_CODES[charCode[1]];
  // 키(height) 코드가 없으면 'l'(large)을 기본값으로 사용
  const height = charCode.length > 2 ? charCode[2] : 'l';

  if (!character || !emotion || !['s', 'm', 'l'].includes(height)) return null;

  return {
    name: `${character}_${emotion}`,
    height: height,
  };
}

/**
 * URL 파라미터 전체를 디코딩합니다.
 * @param {string} paramString - 예: "a1s.b4m.c2l.h.c"
 * @returns {object} - 파싱된 파라미터 객체
 */
function decodeParams(paramString) {
  if (!paramString) return {};

  const parts = paramString.split('.');
  // URL 파라미터가 5개 미만일 경우를 대비해 기본값 할당
  const [leftCode, centerCode, rightCode, bgCode, activeCode] = parts.concat(Array(5 - parts.length).fill(''));

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
    if (!p) {
        // p 파라미터가 없을 경우 400 Bad Request 반환
        return res.status(400).send('Parameter p is required.');
    }

    const { left, center, right, bg, active } = decodeParams(p);

    // 캐시 키는 입력된 p값을 기반으로 생성하여 모든 파라미터 조합을 고유하게 식별
    const cacheKey = p.replace(/\./g, '_');

    // 1. 캐시 확인
    try {
      const cacheUrl = `https://raw.githubusercontent.com/reat333/generated-cache/main/generated/${cacheKey}.png`;
      const cacheCheck = await fetch(cacheUrl);

      if (cacheCheck.ok) {
        const imageBuffer = await cacheCheck.arrayBuffer();
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
        res.setHeader('X-Cache-Status', 'HIT');
        res.setHeader('X-Decoded-Params', JSON.stringify({left, center, right, bg, active}));
        return res.send(Buffer.from(imageBuffer));
      }
    } catch (e) {
      // 캐시 없음, 새로 생성 진행
    }

    const width = 1440;
    const height = 960;

    // 2. 배경 처리
    let baseImage;
    if (bg) {
        try {
            const bgUrl = `https://raw.githubusercontent.com/reat333/character-assets/main/backgrounds/${bg}.png`;
            const bgResponse = await fetch(bgUrl);
            if (!bgResponse.ok) throw new Error('Background image not found');
            const bgBuffer = await bgResponse.arrayBuffer();
            baseImage = sharp(Buffer.from(bgBuffer)).resize(width, height);
        } catch (e) {
            // 배경 로드 실패 시 단색 배경 생성
            baseImage = sharp({ create: { width, height, channels: 4, background: { r: 200, g: 200, b: 200, alpha: 1 } } });
        }
    } else {
      baseImage = sharp({ create: { width, height, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } } });
    }

    // 3. 구도 및 캐릭터 사이즈 결정
    const characters = [left, center, right];
    const presentCharsCount = characters.filter(Boolean).length;
    
    // 2인 구도: left와 right 캐릭터만 존재하고 center는 비어있을 때
    const isTwoCharLayout = presentCharsCount === 2 && left && right && !center;
    const layoutType = isTwoCharLayout ? 'twoChar' : 'threeChar';
    const characterResizeHeight = isTwoCharLayout ? 840 : 740;

    const positions = {
      left: { x: isTwoCharLayout ? width / 4 : 360, y: height },
      center: { x: width / 2, y: height },
      right: { x: isTwoCharLayout ? (width * 3) / 4 : 1080, y: height }
    };

    const inactiveOverlays = [];
    let activeOverlay = null;

    // 4. 캐릭터 처리 (비활성 캐릭터 먼저, 활성 캐릭터는 나중에)
    for (const [index, charData] of characters.entries()) {
      if (!charData) continue;

      const pos = ['left', 'center', 'right'][index];
      
      try {
        const charUrl = `https://raw.githubusercontent.com/reat333/character-assets/main/characters/${charData.name}.png`;
        const charResponse = await fetch(charUrl);
        if (!charResponse.ok) continue;

        const charBuffer = await charResponse.arrayBuffer();
        let charProcessor = sharp(Buffer.from(charBuffer))
          .resize({ height: characterResizeHeight, fit: 'contain' });

        // 비활성 캐릭터 어둡게 처리
        const isActive = active === pos;
        if (!isActive && active) {
          charProcessor = charProcessor.modulate({ brightness: 0.7, saturation: 0.6 });
        }

        const processedCharBuffer = await charProcessor.png().toBuffer();
        const charMeta = await sharp(processedCharBuffer).metadata();
        
        // 키에 따른 y축 위치 조정
        const cropRatio = HEIGHT_CROP_MAPPING[layoutType][charData.height];
        const verticalOffset = Math.round(charMeta.height * cropRatio);

        const overlay = {
          input: processedCharBuffer,
          left: Math.round(positions[pos].x - (charMeta.width / 2)),
          top: Math.round(positions[pos].y - charMeta.height + verticalOffset)
        };
        
        if (isActive) {
          activeOverlay = overlay;
        } else {
          inactiveOverlays.push(overlay);
        }
      } catch (e) {
        console.error(`Error processing character ${charData.name}:`, e.message);
      }
    }

    // 5. 최종 합성 (활성 캐릭터를 마지막에 추가하여 최상단에 오도록 함)
    const finalOverlays = [...inactiveOverlays];
    if (activeOverlay) {
      finalOverlays.push(activeOverlay);
    }
    
    const finalImage = baseImage.composite(finalOverlays);
    const imageBuffer = await finalImage.png({ quality: 90 }).toBuffer();

    // 6. 캐시 저장
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
          message: `Cache generated image for key: ${cacheKey}`,
          content: base64Image,
        })
      });
    } catch (cacheError) {
      console.error('Failed to save cache:', cacheError.message);
    }

    // 7. 결과 전송
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes for new images
    res.setHeader('X-Cache-Status', 'MISS');
    res.setHeader('X-Decoded-Params', JSON.stringify({left, center, right, bg, active}));
    res.send(imageBuffer);

  } catch (error) {
    console.error('API Error:', error);
    // 에러 발생 시 에러 이미지 반환
    const errorImage = sharp({ create: { width: 1440, height: 960, channels: 4, background: { r: 255, g: 200, b: 200, alpha: 1 } } });
    const errorBuffer = await errorImage.png().toBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.status(500).send(errorBuffer);
  }
}
