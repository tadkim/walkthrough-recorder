// 브라우저 컨텍스트에 주입되는 초기화 스크립트 — context.addInitScript(cursorInitScript, options).
// 이 함수는 브라우저 안에서 직렬화되어 실행되므로 외부 모듈/변수를 참조할 수 없다.
//
// 하는 일:
//  - 클릭 위치를 보여주는 가짜 커서 표시 (window.__moveCursor / __pressCursor 노출)
//  - 녹화용 포커스 스타일 제거 (포커스 링/outline/tap highlight)
//  - 커서를 오버레이 pane(예: Angular Material .cdk-overlay-pane) 위에 마운트해
//    다이얼로그가 떠도 커서가 가려지지 않게 한다.
export function cursorInitScript(options) {
  const moveMs = options?.moveMs ?? 320;
  const size = options?.size ?? 24;
  const background = options?.background ?? 'rgba(80,80,76,0.58)';
  const boxShadow =
    options?.boxShadow ?? '0 1px 4px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.24)';
  // 커서를 얹을 호스트 후보 셀렉터 — 문서 순서상 마지막 매치 사용, 없으면 body
  const hosts = options?.hosts ?? ['.cdk-overlay-pane'];

  const install = () => {
    if (!document.getElementById('__walkthroughStyle')) {
      const style = document.createElement('style');
      style.id = '__walkthroughStyle';
      style.textContent =
        '*:focus,*:focus-visible{outline:none !important;}' +
        'button:focus,button:focus-visible,a:focus,[tabindex]:focus{box-shadow:none !important;}' +
        '*{-webkit-tap-highlight-color:transparent !important;}' +
        '#__demoCursor{position:fixed !important;z-index:2147483647 !important;}';
      (document.head || document.documentElement).appendChild(style);
    }

    if (document.getElementById('__demoCursor')) return;
    const cursor = document.createElement('div');
    cursor.id = '__demoCursor';
    Object.assign(cursor.style, {
      position: 'fixed',
      left: '-40px',
      top: '-40px',
      width: size + 'px',
      height: size + 'px',
      marginLeft: -size / 2 + 'px',
      marginTop: -size / 2 + 'px',
      borderRadius: '50%',
      background,
      boxShadow,
      zIndex: '2147483647',
      pointerEvents: 'none',
      opacity: '1',
      transform: 'scale(1)',
      transformOrigin: 'center center',
      willChange: 'left, top, transform',
      transition:
        'left ' +
        moveMs +
        'ms cubic-bezier(0.16,1,0.3,1), top ' +
        moveMs +
        'ms cubic-bezier(0.16,1,0.3,1), transform 140ms ease',
    });

    const mountCursor = () => {
      let host = null;
      for (const selector of hosts) {
        const matches = document.querySelectorAll(selector);
        if (matches.length) host = matches[matches.length - 1];
      }
      host = host || document.body || document.documentElement;
      if (cursor.parentElement !== host) host.appendChild(cursor);
    };
    mountCursor();

    window.__moveCursor = (x, y) => {
      mountCursor();
      cursor.style.left = x + 'px';
      cursor.style.top = y + 'px';
    };
    window.__pressCursor = () => {
      mountCursor();
      cursor.style.transform = 'scale(0.78)';
      setTimeout(() => {
        cursor.style.transform = 'scale(1)';
      }, 200);
    };
  };

  if (document.body) install();
  else document.addEventListener('DOMContentLoaded', install);
}
