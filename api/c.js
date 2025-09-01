// api/c.js

const sharp = require('sharp');

// --- CONSTANTS ---
const CACHE_VERSION = 'v13'; // 새로운 로직을 위한 캐시 버전 업데이트

const CHARACTER_CODES = { 'a': 'girlA', 'b': 'girlB', 'c': 'girlC' };
const EMOTION_CODES = { '1': 'angry', '4': 'smile', '7': 'v' };
const BACKGROUND_CODES = { 'f': 'forest', 'b': 'beach', 'h': 'home' };
const POSITION_CODES = { 'l': 'left', 'c': 'center', 'r': 'right' };
const CHARACTER_HEIGHTS = { 'girlA': 's', 'girlB': 'm', 'girlC': 'l' };

// --- PARSING FUNCTIONS ---

/**
 * 캐릭터 코드('a1')를 전체 캐릭터 이름('girlA_angry')으로 변환합니다.
 * 코드가 유효하지 않으면 null을 반환합니다.
 * @param {string} charCode - 변환할 캐릭터 코드.
 * @returns {string|null} 전체 캐릭터 이름 또는 null.
 */
function decodeCharacter(charCode) {
    if (!charCode || charCode.length < 2 || charCode === '*') return null;

    const character = CHARACTER_CODES[charCode[0]];
    const emotion = EMOTION_CODES[charCode[1]];

    if (!character || !emotion) return null;
    return `${character}_${emotion}`;
}

/**
 * URL 쿼리에서 파라미터 문자열을 해석합니다.
 * 예시: 'a1.*.c7.f.r'
 * @param {string} paramString - 인코딩된 파라미터 문자열.
 * @returns {object} 해석된 파라미터 객체.
 */
function decodeParams(paramString) {
    if (!paramString) return {};
    
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


// --- MAIN HANDLER ---
export default async function handler(req, res) {
    try {
        const { p } = req.query;
        const { left, center, right, bg, active } = decodeParams(p);

        // --- CACHE LOGIC ---
        const cacheKey = `${CACHE_VERSION}_${p || 'default'}`;
        const GITHUB_USER = 'reat333';
        const CACHE_REPO = 'generated-cache';
        
        try {
            const cacheUrl = `https://raw.githubusercontent.com/${GITHUB_USER}/${CACHE_REPO}/main/generated/${cacheKey}.png`;
            const cacheCheck = await fetch(cacheUrl);
            if (cacheCheck.ok) {
                const imageBuffer = await cacheCheck.arrayBuffer();
                res.setHeader('Content-Type', 'image/png');
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                res.setHeader('X-Cache-Status', 'HIT');
                return res.send(Buffer.from(imageBuffer));
            }
        } catch (e) {
            // 캐시 없음, 생성 진행
        }

        // --- IMAGE GENERATION ---
        const width = 1440;
        const height = 960;
        let baseImage;

        // 배경 처리
        if (bg) {
            const bgUrl = `https://raw.githubusercontent.com/${GITHUB_USER}/character-assets/main/backgrounds/${bg}.png`;
            const bgResponse = await fetch(bgUrl);
            if (bgResponse.ok) {
                baseImage = sharp(await bgResponse.arrayBuffer()).resize(width, height);
            }
        }
        if (!baseImage) {
            baseImage = sharp({ create: { width, height, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } } });
        }
        
        const characters = [
            { pos: 'left', name: left },
            { pos: 'center', name: center },
            { pos: 'right', name: right }
        ].filter(c => c.name);

        const numCharacters = characters.length;
        let isTwoPersonLayout = false;
        if (numCharacters === 2 && left && right && !center) {
            isTwoPersonLayout = true;
        }
        
        const layoutConfig = {
            charHeight: numCharacters === 3 ? 740 : 840,
            positions: {
                left: { x: numCharacters === 3 ? 260 : 360, y: height },
                center: { x: 720, y: height },
                right: { x: numCharacters === 3 ? 1180 : 1080, y: height }
            },
            cropMapping: {
                largeChar: { s: 0.10, m: 0.05, l: 0.00 },
                smallChar: { s: 0.05, m: 0.025, l: 0.00 }
            }
        };

        const overlays = [];
        let activeOverlay = null;

        for (const char of characters) {
            const charUrl = `https://raw.githubusercontent.com/${GITHUB_USER}/character-assets/main/characters/${char.name}.png`;
            const charResponse = await fetch(charUrl);

            if (charResponse.ok) {
                const charBuffer = await charResponse.arrayBuffer();
                let charProcessor = sharp(charBuffer).resize({ height: layoutConfig.charHeight, fit: 'contain' });
                
                const charMeta = await charProcessor.metadata();
                const charHeightKey = CHARACTER_HEIGHTS[char.name.split('_')[0]];
                const cropRules = (isTwoPersonLayout || numCharacters === 1) ? layoutConfig.cropMapping.largeChar : layoutConfig.cropMapping.smallChar;
                const cropRatio = cropRules[charHeightKey] || 0;
                const verticalOffset = Math.round(charMeta.height * cropRatio);

                const overlay = {
                    input: await charProcessor.toBuffer(),
                    left: Math.round(layoutConfig.positions[char.pos].x - (charMeta.width / 2)),
                    top: Math.round(layoutConfig.positions[char.pos].y - charMeta.height + verticalOffset)
                };

                const isActive = active === char.pos;
                if (!isActive && active) {
                    overlay.input = await sharp(overlay.input)
                        .modulate({ brightness: 0.7, saturation: 0.6 })
                        .toBuffer();
                }

                if (isActive) {
                    activeOverlay = overlay;
                } else {
                    overlays.push(overlay);
                }
            }
        }
        
        if (activeOverlay) {
            overlays.push(activeOverlay);
        }

        // 최종 합성
        const finalImageBuffer = await baseImage.composite(overlays).png({ quality: 90 }).toBuffer();

        // --- CACHE SAVING ---
        try {
            const githubSaveUrl = `https://api.github.com/repos/${GITHUB_USER}/${CACHE_REPO}/contents/generated/${cacheKey}.png`;
            await fetch(githubSaveUrl, {
                method: 'PUT',
                headers: { 'Authorization': `token ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: `Cache image: ${cacheKey}`, content: finalImageBuffer.toString('base64') })
            });
        } catch (cacheError) {
            console.error('캐시 저장 실패:', cacheError.message);
        }

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
        res.setHeader('X-Cache-Status', 'MISS');
        res.send(finalImageBuffer);

    } catch (error) {
        console.error('API 에러:', error);
        res.status(500).send('Error generating image');
    }
}

