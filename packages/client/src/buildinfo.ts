/** What this build is: shown in the corner of every screen so a report or a screenshot says which version it came from. */
export const BUILD = {
  version: __APP_VERSION__,
  commit: __APP_COMMIT__,
  built: __APP_BUILT__,
};

export function buildLabel(): string {
  return `v${BUILD.version} \u00b7 ${BUILD.commit}`;
}

export function buildTitle(): string {
  return `white-room-horde v${BUILD.version}\ncommit ${BUILD.commit}\nbuilt ${BUILD.built}`;
}

/** The permanent version tag in a corner of the page (also on the menu and the QA page). */
export function mountVersionBadge(parent: HTMLElement = document.body): HTMLElement {
  const el = document.createElement('div');
  el.id = 'wrh-version';
  el.textContent = buildLabel();
  el.title = buildTitle();
  el.style.cssText =
    'position:fixed;left:8px;top:6px;z-index:50;font:600 11px/1.2 system-ui,sans-serif;color:#3a352d;opacity:.62;pointer-events:auto;user-select:text;text-shadow:0 1px 0 rgba(255,255,255,.6);letter-spacing:.2px';
  parent.appendChild(el);
  return el;
}
