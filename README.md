# walkthrough-recorder

Playwright 기반 워크스루/기능 클립 녹화 엔진.
가짜 커서 연출, deviceScaleFactor 반영 프레임 캡처, 실타이밍 ffmpeg MP4 인코딩을 제공한다.
프로젝트에는 "어느 화면에서 무엇을 누를지"(시나리오)만 남긴다.

## 왜 스크린샷 루프인가

Playwright의 recordVideo/CDP 스크린캐스트는 headless에서 CSS 크기로 고정되어
`deviceScaleFactor` 배율이 반영되지 않는다. `page.screenshot`은 배율을 반영하므로
백그라운드 루프로 프레임을 찍고, 실제 수신 간격을 ffmpeg concat duration으로 사용해
실시간과 같은 타이밍의 CFR 영상을 만든다.

## 설치

```bash
# 로컬 (개발 중)
npm i -D file:../walkthrough-recorder playwright

# GitHub에서
npm i -D github:tadkim/walkthrough-recorder playwright
```

`playwright`는 peer dependency — 프로젝트의 브라우저 바이너리를 그대로 사용한다.

## 사용 — 단일 영상

```js
import { record } from 'walkthrough-recorder';

await record({
  baseUrl: 'http://localhost:4200',
  outName: 'my-walkthrough',
  viewport: { width: 360, height: 640 },
  scale: 3, // → 1080×1920 캡처
  scenario: async ({ page, tap, dwell, goto, startCapture }) => {
    await goto('/');
    await page.waitForSelector('.btn-start');
    startCapture(); // 준비가 끝난 시점에 시나리오가 직접 호출
    await tap('.btn-start');
    await dwell(1500);
  },
});
```

## 사용 — 다중 클립

클립마다 새 브라우저 컨텍스트에서 시작해 상태가 섞이지 않는다.

```js
import { recordClips } from 'walkthrough-recorder';

await recordClips({
  outDir: 'docs/captures/features',
  setupContext: async (context) => {
    await context.route('**/api/**', (route) => route.fulfill({ body: '...' })); // mock 등
  },
  clips: [
    {
      name: '01-intro',
      run: async ({ goto, startCapture, stopCapture, dwell }) => {
        await goto('/');
        startCapture();
        await dwell(3000);
        await stopCapture();
      },
    },
  ],
});
```

## 옵션

| 옵션 | 기본값 |
| :-- | :-- |
| `baseUrl` | `BASE_URL` env 또는 `http://localhost:4200` |
| `outDir` | `OUT_DIR` env 또는 cwd |
| `outName` (record) | `walkthrough` |
| `viewport` | `360×640` |
| `scale` | record `3` / recordClips `1` |
| `fps` | `30` |
| `jpegQuality` | record `88` / recordClips `90` |
| `crf` | record `20` / recordClips `18` |
| `cursor` | `{ moveMs: 320, hosts: ['.cdk-overlay-pane'] }`, `false`면 비활성 |
| `tapDefaults` | `{ pre: 420, post: 700, hold: 120, blur: true }` |
| `observe` | `[]` — 매칭 요청을 로그로 관찰(차단 없음) |
| `setupContext` | 컨텍스트 생성 직후 훅 (mock route 등) |

## 시나리오 헬퍼

| 헬퍼 | 역할 |
| :-- | :-- |
| `tap(target, opts?)` | 셀렉터/로케이터 중앙을 커서 연출과 함께 클릭 |
| `tapVisible(sel, {top, bottom, opts})` | 세로 범위 안에 보이는 첫 매치 클릭 |
| `scrollBy(sel, px, wait?)` | 컨테이너 부드러운 스크롤 |
| `goto(path)` | `baseUrl + path` 이동 |
| `dwell(ms)` | 대기 |
| `startCapture()` / `stopCapture()` | 캡처 루프 시작/종료 |
| `page`, `context`, `browser` | Playwright 원본 객체 (자유 사용) |

입력 필드에 타이핑할 때는 `tap(input, { blur: false })` 후
`locator.pressSequentially(text, { delay })`를 사용한다.

## 라이선스

MIT
