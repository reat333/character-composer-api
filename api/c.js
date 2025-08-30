// api/c.js - 기능 추가 및 정리 버전
const sharp = require('sharp');

// --- 매핑 테이블 ---
const CHARACTER_CODES = {
  'a': 'girlA',
  'b': 'girlB',
  'c': 'girlC'
};

// 캐릭터별 키(height) 고정 정의
const CHARACTER_HEIGHTS = {
    'a': 's', // girlA
    'b': 'm', // girlB
    'c': 'l'  // girlC
};

const EMOTION_CODES = {
  '1': 'angry',
  '4': 'smile',
  '7': 'v'
};

const BACKGROUND_CODES = {
  'f': 'forest',
  'b': 'beach',
  'h': 'home'
};

const POSITION_CODES = {
  'l': 'left',
  'c': 'center',
  'r': 'right'
};

// 키(height)에 따른 하단 잘림 비율 정의
const HEIGHT_CROP_MAPPING = {
  // 1인 또는 2인 구도일 때
  largeChar: { s: 0.10, m: 0.05, l: 0 },
  // 3인 구도일 때
  smallChar: { s: 0.05, m: 0.025, l: 0 }
};

// 로직 변경 시 이 버전을 올려주세요. v1:초기, v2:키버그수정, v3:3인구도수정
const CACHE_VERSION = 'v3';

/**
 * 캐릭터 코드를 파싱하여 이름과 키 정보를 반환합니다.
 * @param {string} charCode - 예: "a1" (캐릭터a, 감정1)
 * @returns {object|null} - 예: { name: "girlA_angry", height: "l" }
 */
function decodeCharacter(charCode) {
  if (!charCode || charCode.length < 2) return null;

  const charKey = charCode[0];
  const character = CHARACTER_CODES[charKey];
  const emotion = EMOTION_CODES[charCode[1]];
  const height = CHARACTER_HEIGHTS[charKey]; // URL에서 키를 받는 대신, 고정된 값 사용

  if (!character || !emotion || !height) return null;

  return {
    name: `${character}_${emotion}`,
    height: height,
  };
}

/**
 * URL 파라미터 전체를 디코딩합니다.
 * @param {string} paramString - 예: "a1.b4.c7.h.c"
 * @returns {object} - 파싱된 파라미터 객체
 */
function decodeParams(paramString) {
  if (!paramString) return {};

  const parts = paramString.split('.');
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
        return res.status(400).send('Parameter p is required.');
    }

    const { left, center, right, bg, active } = decodeParams(p);
    const cacheKey = `${p.replace(/\./g, '_')}_${CACHE_VERSION}`;

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
      // 캐시 없음
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
            baseImage = sharp({ create: { width, height, channels: 4, background: { r: 200, g: 200, b: 200, alpha: 1 } } });
        }
    } else {
      baseImage = sharp({ create: { width, height, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } } });
    }

    // 3. 구도 및 캐릭터 사이즈 결정
    const characters = [left, center, right];
    const presentCharsCount = characters.filter(Boolean).length;
    
    const isStrictlyTwoCharLayout = presentCharsCount === 2 && left && right && !center;
    const useLargeCharSize = presentCharsCount === 1 || isStrictlyTwoCharLayout;

    const characterResizeHeight = useLargeCharSize ? 840 : 740;
    const layoutType = useLargeCharSize ? 'largeChar' : 'smallChar';

    const positions = {
      left: { x: isStrictlyTwoCharLayout ? width / 4 : 260, y: height },
      center: { x: width / 2, y: height },
      right: { x: isStrictlyTwoCharLayout ? (width * 3) / 4 : 1180, y: height }
    };

    const inactiveOverlays = [];
    let activeOverlay = null;

    // 4. 캐릭터 처리
    for (const [index, charData] of characters.entries()) {
      if (!charData) continue;
      const pos = ['left', 'center', 'right'][index];
      try {
        const charUrl = `https://raw.githubusercontent.com/reat333/character-assets/main/characters/${charData.name}.png`;
        const charResponse = await fetch(charUrl);
        if (!charResponse.ok) continue;

        const charBuffer = await charResponse.arrayBuffer();
        
        // --- BUG FIX START ---
        // 1. 먼저 리사이즈하고, 효과 적용 전의 메타데이터를 확보합니다.
        const resizedCharBuffer = await sharp(charBuffer)
          .resize({ height: characterResizeHeight, fit: 'contain' })
          .png()
          .toBuffer();

        const charMeta = await sharp(resizedCharBuffer).metadata();

        // 2. 최종적으로 사용할 버퍼를 결정합니다 (비활성 시 효과 적용).
        let finalCharBuffer = resizedCharBuffer;
        const isActive = active === pos;
        if (!isActive && active) {
          finalCharBuffer = await sharp(resizedCharBuffer)
            .modulate({ brightness: 0.7, saturation: 0.6 })
            .png()
            .toBuffer();
        }
        
        // 3. 일관된 메타데이터로 위치를 계산합니다.
        const cropRatio = HEIGHT_CROP_MAPPING[layoutType][charData.height];
        const verticalOffset = Math.round(charMeta.height * cropRatio);

        const overlay = {
          input: finalCharBuffer, // 효과가 적용된 최종 이미지를 사용
          left: Math.round(positions[pos].x - (charMeta.width / 2)),
          top: Math.round(positions[pos].y - charMeta.height + verticalOffset) // 위치 계산은 원본 높이 기준
        };
        // --- BUG FIX END ---
        
        if (isActive) {
          activeOverlay = overlay;
        } else {
          inactiveOverlays.push(overlay);
        }
      } catch (e) {
        console.error(`Error processing character ${charData.name}:`, e.message);
      }
    }

    // 5. 최종 합성
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
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('X-Cache-Status', 'MISS');
    res.setHeader('X-Decoded-Params', JSON.stringify({left, center, right, bg, active}));
    res.send(imageBuffer);

  } catch (error) {
    console.error('API Error:', error);
    const errorImage = sharp({ create: { width: 1440, height: 960, channels: 4, background: { r: 255, g: 200, b: 200, alpha: 1 } } });
    const errorBuffer = await errorImage.png().toBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.status(500).send(errorBuffer);
  }
}

