// 시나리오에 주입되는 조작 헬퍼.
// tap: 요소 중앙으로 커서를 옮겨 실제 마우스 클릭 (가짜 커서 애니메이션 포함)
export function createHelpers(page, { baseUrl, cursorMoveMs = 320, tapDefaults = {} } = {}) {
  const defaults = { pre: 420, post: 700, hold: 120, blur: true, ...tapDefaults };

  const dwell = (ms) => page.waitForTimeout(ms);

  async function goto(path) {
    await page.goto(baseUrl + path, { waitUntil: 'domcontentloaded' });
    await dwell(300);
  }

  // 셀렉터(첫 매치) 또는 로케이터의 중앙 좌표를 클릭
  async function tap(target, opts = {}) {
    const { pre, post, hold, blur } = { ...defaults, ...opts };
    const locator = typeof target === 'string' ? page.locator(target).first() : target;
    await locator.waitFor({ state: 'visible', timeout: 15000 });
    await locator.scrollIntoViewIfNeeded({ timeout: 1200 }).catch(() => {});

    let box = await locator.boundingBox();
    if (box) {
      let x = box.x + box.width / 2;
      let y = box.y + box.height / 2;
      await page.evaluate(([cx, cy]) => window.__moveCursor?.(cx, cy), [x, y]);
      await page.mouse.move(x, y);
      await dwell(Math.max(pre, cursorMoveMs + 80));
      // 클릭 직전 위치 재계산(모션/재렌더로 이동했을 수 있음) 후 요소 중앙을 클릭
      box = (await locator.boundingBox()) ?? box;
      x = box.x + box.width / 2;
      y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.evaluate(([cx, cy]) => window.__moveCursor?.(cx, cy), [x, y]);
      await dwell(cursorMoveMs + 40);
      await page.evaluate(() => window.__pressCursor?.());
      await page.mouse.down();
      await dwell(hold);
      await page.mouse.up();
    } else {
      await locator.click({ force: true, timeout: 10000 });
    }

    // 포커스 스타일이 클릭 후 남지 않도록 blur (입력 필드 클릭 시에는 blur: false)
    if (blur) {
      await page.evaluate(
        () => document.activeElement instanceof HTMLElement && document.activeElement.blur(),
      );
    }
    await dwell(post);
  }

  // 뷰포트의 [top, bottom] 세로 범위 안에 중앙이 보이는 첫 매치를 클릭 — 스크롤 후 "보이는 항목" 클릭에 사용
  async function tapVisible(selector, { top = 0, bottom, opts } = {}) {
    const limit = bottom ?? page.viewportSize()?.height ?? 640;
    const items = page.locator(selector);
    const n = await items.count();
    for (let i = 0; i < n; i++) {
      const el = items.nth(i);
      const box = await el.boundingBox();
      if (!box) continue;
      const cy = box.y + box.height / 2;
      if (cy >= top && cy <= limit) {
        await tap(el, opts);
        return true;
      }
    }
    await tap(items.first(), opts); // 폴백: 첫 매치
    return false;
  }

  // 스크롤 컨테이너를 px만큼 부드럽게 스크롤 (없으면 문서 스크롤)
  async function scrollBy(selector, px, wait = 0) {
    await page.evaluate(
      ([sel, delta]) => {
        const scroller = document.querySelector(sel) ?? document.scrollingElement;
        scroller?.scrollBy?.({ top: delta, behavior: 'smooth' });
      },
      [selector, px],
    );
    if (wait) await dwell(wait);
  }

  return { dwell, goto, tap, tapVisible, scrollBy };
}
