const sharp = require('sharp');

const CACHE_VERSION = 'v14'; // 캐시 재생성을 위한 버전 업데이트

// --- 매핑 테이블 (변경 없음) ---
const CHARACTER_CODES = { 'a': 'girlA', 'b': 'girlB', 'c': 'girlC' };
const EMOTION_CODES = { '1': 'angry', '4': 'smile', '7': 'v' };
const BACKGROUND_CODES = { 'f': 'forest', 'b': 'beach', 'h': 'home' };
const POSITION_CODES = { 'l': 'left', 'c': 'center', 'r': 'right' };
const CHARACTER_HEIGHTS = { 'girlA': 's', 'girlB': 'm', 'girlC': 'l' };
const HEIGHT_CROP_MAPPING = {
    largeChar: { s: 0.10, m: 0.05, l: 0.00 },
    smallChar: { s: 0.05, m: 0.025, l: 0.00 }
};

// --- URL 파싱 함수 ( '*' 처리 기능 추가) ---
function decodeCharacter(charCode) {
    if (!charCode || charCode.length < 2 || charCode === '*') return null;
    const character = CHARACTER_CODES[charCode[0]];
    const emotion = EMOTION_CODES[charCode[1]];
    if (!character || !emotion) return null;
    return `${character}_${emotion}`;
}

function decodeParams(paramString) {
    if (!paramString) return {};
    const parts = paramString.split('.');
    const [leftCode, centerCode, rightCode, bgCode, activeCode] = parts;
    return {
        left: decodeCharacter(leftCode),
        center: decodeCharacter(centerCode),
        right: decodeCharacter(rightCode),
        bg: bgCode === '*' ? null : BACKGROUND_CODES[bgCode] || null,
        active: activeCode === '*' ? null : POSITION_CODES[activeCode] || null
    };
}


export default async function handler(req, res) {
    try {
        const { p } = req.query;

        // URL 파라미터를 각 변수로 분해
        const parts = p ? p.split('.') : ['*', '*', '*', '*', '*'];
        const [leftCode, centerCode, rightCode, bgCode, activeCode] = parts;
        const { left, center, right, bg, active } = decodeParams(p);

        // 캐시 키 생성 (오류 수정됨)
        const cacheKey = `${CACHE_VERSION}_${leftCode}_${centerCode}_${rightCode}_${bgCode}_${activeCode}`;

        // 1. 캐시 확인 (변경 없음)
        try {
            const cacheUrl = `https://raw.githubusercontent.com/reat333/generated-cache/main/generated/${cacheKey}.png`;
            const cacheCheck = await fetch(cacheUrl);
            if (cacheCheck.ok) {
                const imageBuffer = await cacheCheck.arrayBuffer();
                res.setHeader('Content-Type', 'image/png');
                res.setHeader('Cache-Control', 'public, max-age=31536000');
                res.setHeader('X-Cache-Status', 'HIT');
                res.setHeader('X-Decoded-Params', JSON.stringify({ left, center, right, bg, active }));
                return res.send(Buffer.from(imageBuffer));
            }
        } catch (e) { /* 캐시 없음, 새로 생성 */ }

        const width = 1440;
        const height = 960;

        // 2. 배경 처리 (변경 없음)
        let baseImage;
        if (bg) {
            const bgUrl = `https://raw.githubusercontent.com/reat333/character-assets/main/backgrounds/${bg}.png`;
            const bgResponse = await fetch(bgUrl);
            if (bgResponse.ok) {
                const bgBuffer = await bgResponse.arrayBuffer();
                baseImage = sharp(Buffer.from(bgBuffer)).resize(width, height).png();
            } else {
                 baseImage = sharp({ create: { width, height, channels: 4, background: { r: 200, g: 200, b: 200, alpha: 1 } } });
            }
        } else {
            baseImage = sharp({ create: { width, height, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } } });
        }

        // --- 3. 캐릭터 처리 (위치 계산 로직 원복) ---
        const positions = {
            left: { x: 260, y: height },
            center: { x: 720, y: height },
            right: { x: 1180, y: height }
        };
        
        const overlays = [];
        const numCharacters = [left, center, right].filter(Boolean).length;
        const charSize = (numCharacters <= 2) ? 840 : 740;
        const cropRules = (numCharacters <= 2) ? HEIGHT_CROP_MAPPING.largeChar : HEIGHT_CROP_MAPPING.smallChar;

        const charEntries = Object.entries({ left, center, right });
        let activeOverlay = null;
        const inactiveOverlays = [];

        for (const [pos, charName] of charEntries) {
            if (charName) {
                try {
                    const charUrl = `https://raw.githubusercontent.com/reat333/character-assets/main/characters/${charName}.png`;
                    const charResponse = await fetch(charUrl);
                    if (!charResponse.ok) continue;

                    const charBuffer = await charResponse.arrayBuffer();
                    const resizedCharBuffer = await sharp(charBuffer).resize({ height: charSize, fit: 'contain' }).png().toBuffer();
                    const charMeta = await sharp(resizedCharBuffer).metadata();
                    
                    const charKey = charName.split('_')[0];
                    const charHeight = CHARACTER_HEIGHTS[charKey] || 'l';
                    const cropRatio = cropRules[charHeight] || 0;
                    const verticalOffset = Math.round(charMeta.height * cropRatio);

                    const { x, y } = positions[pos];

                    const overlay = {
                        input: resizedCharBuffer,
                        left: Math.round(x - (charMeta.width / 2)),
                        top: Math.round(y - charMeta.height) + verticalOffset
                    };

                    if (active === pos) {
                        activeOverlay = overlay;
                    } else {
                        inactiveOverlays.push(overlay);
                    }
                } catch (e) {
                    console.error(`Error processing character ${charName}:`, e.message);
                }
            }
        }
        
        // 비활성 캐릭터 어둡게 처리
        for (let i = 0; i < inactiveOverlays.length; i++) {
            if (active) {
                inactiveOverlays[i].input = await sharp(inactiveOverlays[i].input)
                    .modulate({ brightness: 0.7, saturation: 0.6 })
                    .png().toBuffer();
            }
        }

        // 4. 최종 합성 (활성 캐릭터가 위로 오도록 순서 조정)
        const finalOverlays = [...inactiveOverlays, activeOverlay].filter(Boolean);
        const finalImage = baseImage.composite(finalOverlays);
        const imageBuffer = await finalImage.png({ quality: 90 }).toBuffer();
        
        // 5. 캐시 저장 (변경 없음)
        try {
            const base64Image = imageBuffer.toString('base64');
            const githubSaveUrl = `https://api.github.com/repos/reat333/generated-cache/contents/generated/${cacheKey}.png`;
            await fetch(githubSaveUrl, {
                method: 'PUT',
                headers: { 'Authorization': `token ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: `Add cached image ${cacheKey}`, content: base64Image })
            });
        } catch (cacheError) { console.log('캐시 저장 실패:', cacheError.message); }

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.setHeader('X-Cache-Status', 'MISS');
        res.setHeader('X-Decoded-Params', JSON.stringify({ left, center, right, bg, active }));
        res.send(imageBuffer);

    } catch (error) {
        console.error('API 에러:', error);
        const errorImage = sharp({ create: { width: 1440, height: 960, channels: 4, background: { r: 255, g: 200, b: 200, alpha: 1 } } });
        const errorBuffer = await errorImage.png().toBuffer();
        res.setHeader('Content-Type', 'image/png');
        res.send(errorBuffer);
    }
}

