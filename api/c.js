// api/c.js - 최소 기능 테스트 버전
const sharp = require('sharp');

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

function decodeCharacter(charCode) {
  if (!charCode || charCode.length < 2) return null;
  
  const character = CHARACTER_CODES[charCode[0]];
  const emotion = EMOTION_CODES[charCode[1]];
  
  if (!character || !emotion) return null;
  
  return `${character}_${emotion}`;
}

export default async function handler(req, res) {
  try {
    console.log('API 시작, 쿼리:', req.query);
    
    const { p } = req.query;
    
    // 파라미터가 없으면 테스트 이미지 반환
    if (!p) {
      console.log('파라미터 없음, 테스트 이미지 생성');
      
      const testImage = sharp({
        create: {
          width: 1440,
          height: 960,
          channels: 4,
          background: { r: 100, g: 200, b: 100, alpha: 1 }
        }
      });
      
      const testBuffer = await testImage.png().toBuffer();
      
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Status', 'TEST');
      return res.send(testBuffer);
    }
    
    console.log('파라미터:', p);
    
    // 간단한 파싱
    const parts = p.split('.');
    console.log('파싱된 부분:', parts);
    
    let left = null, center = null, right = null, bg = null, active = null;
    
    // 안전한 파싱
    if (parts.length >= 5) {
      // 기존 방식 (하위 호환성)
      left = decodeCharacter(parts[0]);
      center = decodeCharacter(parts[1]);
      right = decodeCharacter(parts[2]);
      bg = BACKGROUND_CODES[parts[3]] || null;
      active = POSITION_CODES[parts[4]] || null;
    }
    
    console.log('디코딩 결과:', { left, center, right, bg, active });
    
    // 캐시 키 생성
    const cacheKey = `${left || 'none'}_${center || 'none'}_${right || 'none'}_${bg || 'none'}_${active || 'none'}`;
    console.log('캐시 키:', cacheKey);
    
    // 캐시 확인
    try {
      const cacheUrl = `https://raw.githubusercontent.com/reat333/generated-cache/main/generated/${cacheKey}.png`;
      const cacheCheck = await fetch(cacheUrl);
      
      if (cacheCheck.ok) {
        console.log('캐시 HIT');
        const imageBuffer = await cacheCheck.arrayBuffer();
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        res.setHeader('X-Cache-Status', 'HIT');
        return res.send(Buffer.from(imageBuffer));
      } else {
        console.log('캐시 MISS');
      }
    } catch (e) {
      console.log('캐시 확인 에러:', e.message);
    }
    
    // 기본 이미지 생성
    console.log('새 이미지 생성 시작');
    
    let baseImage = sharp({
      create: {
        width: 1440,
        height: 960,
        channels: 4,
        background: { r: 240, g: 240, b: 240, alpha: 1 }
      }
    });
    
    const imageBuffer = await baseImage.png().toBuffer();
    
    console.log('이미지 생성 완료, 크기:', imageBuffer.length);
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('X-Cache-Status', 'MISS');
    res.setHeader('X-Decoded-Params', JSON.stringify({left, center, right, bg, active}));
    res.send(imageBuffer);
    
  } catch (error) {
    console.error('전체 에러:', error);
    console.error('에러 스택:', error.stack);
    
    // 최후 수단 응답
    res.status(500).json({
      error: '이미지 생성 실패',
      message: error.message,
      stack: error.stack
    });
  }
}
