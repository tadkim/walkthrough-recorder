import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// 스크린샷 캡처 루프.
// Playwright recordVideo/CDP 스크린캐스트는 headless에서 CSS 크기로 고정되어
// deviceScaleFactor 배율이 반영되지 않는다 — page.screenshot은 배율을 반영하므로
// 백그라운드 루프로 프레임을 찍고 실제 수신 시각(t)을 함께 기록한다.
export function createRecorder(page, rawDir, { fps = 30, jpegQuality = 90 } = {}) {
  mkdirSync(rawDir, { recursive: true });
  const minInterval = Math.floor(1000 / fps);
  const frames = []; // { file, t(ms) }
  let frameIdx = 0;
  let capturing = false;
  let capturePromise = null;

  async function captureLoop() {
    while (capturing) {
      const start = Date.now();
      try {
        const buf = await page.screenshot({ type: 'jpeg', quality: jpegQuality });
        const file = join(rawDir, `f${String(frameIdx++).padStart(6, '0')}.jpg`);
        writeFileSync(file, buf);
        frames.push({ file, t: Date.now() });
      } catch {
        // 라우팅 전환 등 일시 실패 — 다음 프레임에서 회복
      }
      const elapsed = Date.now() - start;
      if (elapsed < minInterval) await page.waitForTimeout(minInterval - elapsed);
    }
  }

  return {
    frames,
    start() {
      if (capturing) return;
      capturing = true;
      capturePromise = captureLoop();
    },
    async stop() {
      if (!capturing) return;
      capturing = false;
      await capturePromise;
    },
  };
}
