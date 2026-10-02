import { chromium } from 'playwright';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cursorInitScript } from './cursor.mjs';
import { createRecorder } from './capture.mjs';
import { encodeFrames } from './encode.mjs';
import { createHelpers } from './helpers.mjs';

/** 실행 시점 타임스탬프 YYMMDDHHMM — 출력 파일/폴더 이름에 사용 */
export function timestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    pad(date.getFullYear() % 100) +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes())
  );
}

const DEFAULT_CURSOR = { moveMs: 320, hosts: ['.cdk-overlay-pane'] };

async function setupPage(browser, options) {
  const { viewport, scale, cursor, observe, observeLimit, setupContext } = options;
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale });

  // 백엔드 호출을 관찰만 하고 그대로 통과시킨다 (차단/변조 없음)
  if (observe?.length) {
    let observed = 0;
    context.on('request', (req) => {
      if (observe.some((re) => re.test(req.url()))) {
        observed++;
        if (observed <= observeLimit) console.log('  [observe]', req.method(), req.url().slice(0, 90));
      }
    });
  }

  if (cursor !== false) {
    await context.addInitScript(cursorInitScript, { ...DEFAULT_CURSOR, ...cursor });
  }
  if (setupContext) await setupContext(context); // mock route 등 프로젝트별 준비

  const page = await context.newPage();
  return { context, page };
}

function buildScenarioContext(browser, context, page, recorder, options) {
  const { baseUrl, cursor, tapDefaults } = options;
  const cursorMoveMs = cursor === false ? 0 : (cursor?.moveMs ?? DEFAULT_CURSOR.moveMs);
  const helpers = createHelpers(page, { baseUrl, cursorMoveMs, tapDefaults });
  return {
    browser,
    context,
    page,
    recorder,
    startCapture: recorder.start,
    stopCapture: recorder.stop,
    ...helpers,
  };
}

/**
 * 단일 영상 녹화 — 시나리오 하나를 실행하고 `${outName}_${YYMMDDHHMM}.mp4` 한 편을 만든다.
 * scale(deviceScaleFactor)이 반영된 실제 픽셀로 캡처한다 (예: 360×640 × scale 3 → 1080×1920).
 * scenario 안에서 준비가 끝난 시점에 startCapture()를 직접 호출한다.
 */
export async function record({
  baseUrl = process.env.BASE_URL ?? 'http://localhost:4200',
  outDir = process.env.OUT_DIR ?? process.cwd(),
  outName = 'walkthrough',
  viewport = { width: 360, height: 640 },
  scale = 3,
  fps = 30,
  jpegQuality = 88,
  crf = 20,
  cursor = {},
  tapDefaults,
  observe = [],
  observeLimit = 20,
  setupContext,
  scenario,
} = {}) {
  if (typeof scenario !== 'function') throw new Error('record(): scenario 함수가 필요합니다.');

  mkdirSync(outDir, { recursive: true });
  const rawDir = join(outDir, `.${outName}-raw`);
  if (existsSync(rawDir)) rmSync(rawDir, { recursive: true, force: true });
  const outFile = join(outDir, `${outName}_${timestamp()}.mp4`);

  const options = { baseUrl, viewport, scale, cursor, tapDefaults, observe, observeLimit, setupContext };
  const browser = await chromium.launch();
  let recorder;
  try {
    const { context, page } = await setupPage(browser, options);
    recorder = createRecorder(page, rawDir, { fps, jpegQuality });
    await scenario(buildScenarioContext(browser, context, page, recorder, options));
    await recorder.stop();
    await context.close();
  } finally {
    await browser.close();
  }

  console.log(`▶ frames: ${recorder.frames.length} | ${viewport.width * scale}×${viewport.height * scale}`);
  console.log('▶ ffmpeg 인코딩 →', outFile);
  encodeFrames({ frames: recorder.frames, listPath: join(rawDir, 'frames.txt'), outFile, fps, crf });
  rmSync(rawDir, { recursive: true, force: true });
  console.log('✅ 완료:', outFile);
  return resolve(outFile);
}

/**
 * 다중 클립 녹화 — 클립마다 새 브라우저 컨텍스트에서 시작해 상태가 섞이지 않게 하고,
 * `outDir/${name}.mp4` 를 클립 수만큼 만든다.
 * clips: [{ name, run(ctx) }] — run 안에서 startCapture()/stopCapture()를 직접 호출한다.
 */
export async function recordClips({
  baseUrl = process.env.BASE_URL ?? 'http://localhost:4200',
  outDir = process.env.OUT_DIR ?? join(process.cwd(), `captures_${timestamp()}`),
  viewport = { width: 360, height: 640 },
  scale = 1,
  fps = 30,
  jpegQuality = 90,
  crf = 18,
  cursor = {},
  tapDefaults,
  observe = [],
  observeLimit = 20,
  setupContext,
  clips = [],
} = {}) {
  if (!clips.length) throw new Error('recordClips(): clips가 비어 있습니다.');

  const rawRoot = join(outDir, '.raw');
  if (existsSync(rawRoot)) rmSync(rawRoot, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const options = { baseUrl, viewport, scale, cursor, tapDefaults, observe, observeLimit, setupContext };
  const browser = await chromium.launch();
  const outputs = [];
  try {
    for (const clip of clips) {
      console.log(`▶ ${clip.name}`);
      const { context, page } = await setupPage(browser, options);
      const rawDir = join(rawRoot, clip.name);
      const recorder = createRecorder(page, rawDir, { fps, jpegQuality });
      await clip.run(buildScenarioContext(browser, context, page, recorder, options));
      await recorder.stop();
      await context.close();

      const outFile = encodeFrames({
        frames: recorder.frames,
        listPath: join(rawDir, 'frames.txt'),
        outFile: join(outDir, `${clip.name}.mp4`),
        fps,
        crf,
        // 홀수 크기 대비 + 축소 시 품질 유지 (yuv420p는 짝수 크기 필요)
        vf: `scale=${viewport.width * scale}:${viewport.height * scale}:flags=lanczos`,
      });
      rmSync(rawDir, { recursive: true, force: true });
      outputs.push(resolve(outFile));
      console.log('  ', outFile);
    }
  } finally {
    await browser.close();
  }

  rmSync(rawRoot, { recursive: true, force: true });
  console.log('\n✅ 완료:');
  for (const out of outputs) console.log('-', out);
  return outputs;
}
