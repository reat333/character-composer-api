// api/config/mappings.js - 매핑 테이블 설정 파일

// 캐릭터 코드 매핑
export const CHARACTER_CODES = {
  'a': 'girlA',
  'b': 'girlB', 
  'c': 'boyC',
  'd': 'catD',
  'e': 'girlE',
  'f': 'boyF'
};

// 감정 코드 매핑
export const EMOTION_CODES = {
  '1': 'angry',      // 화남
  '2': 'happy',      // 기쁨  
  '3': 'sad',        // 슬픔
  '4': 'smile',      // 미소
  '5': 'surprised',  // 놀람
  '6': 'sleepy',     // 졸림
  '7': 'blush',      // 부끄러움
  '8': 'cry',        // 울음
  '9': 'laugh'       // 웃음
};

// 배경 코드 매핑
export const BACKGROUND_CODES = {
  'f': 'forest',     // 숲
  'b': 'beach',      // 해변
  'c': 'classroom',  // 교실
  'r': 'bedroom',    // 방
  'p': 'park',       // 공원
  's': 'street',     // 거리
  'h': 'home',       // 집
  'l': 'library'     // 도서관
};

// 위치 코드 매핑
export const POSITION_CODES = {
  'l': 'left',       // 왼쪽
  'c': 'center',     // 가운데
  'r': 'right'       // 오른쪽
};

// 디코딩 헬퍼 함수
export function decodeCharacter(charCode) {
  if (!charCode || charCode.length < 2) return null;
  
  const character = CHARACTER_CODES[charCode[0]];
  const emotion = EMOTION_CODES[charCode[1]];
  
  if (!character || !emotion) return null;
  
  return `${character}_${emotion}`;
}

// 전체 파라미터 디코딩 함수
export function decodeParams(paramString) {
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

// 코드 검증 함수
export function validateCode(charCode) {
  if (!charCode || charCode.length !== 2) return false;
  
  const [char, emotion] = charCode.split('');
  return CHARACTER_CODES[char] && EMOTION_CODES[emotion];
}

// 사용 가능한 모든 조합 생성 (참고용)
export function getAllCombinations() {
  const combinations = [];
  
  Object.keys(CHARACTER_CODES).forEach(charKey => {
    Object.keys(EMOTION_CODES).forEach(emotionKey => {
      combinations.push({
        code: charKey + emotionKey,
        name: `${CHARACTER_CODES[charKey]}_${EMOTION_CODES[emotionKey]}`
      });
    });
  });
  
  return combinations;
}
