import React from 'react';
import ReactDOM from 'react-dom/client';
import { parseCourseContext } from '../adapters/cuhksz';
import { BlackboardClient } from '../infrastructure/blackboard/client';
import {
  BackgroundApiTransport,
  FallbackApiTransport,
  FetchApiTransport,
} from '../infrastructure/blackboard/transport';
import { Sidebar } from '../ui/Sidebar';
import { mountEmbeddedDownloadActions } from '../ui/embedded-actions';
import '../assets/sidebar.css';

const PAGE_LAYOUT_STYLE_ID = 'better-blackboard-page-layout';
const SIDEBAR_OPEN_ATTRIBUTE = 'data-better-blackboard-sidebar-open';

function ensurePageLayoutStyle(): HTMLStyleElement {
  const existing = document.getElementById(PAGE_LAYOUT_STYLE_ID);
  if (existing instanceof HTMLStyleElement) return existing;

  const style = document.createElement('style');
  style.id = PAGE_LAYOUT_STYLE_ID;
  style.textContent = `
    html[${SIDEBAR_OPEN_ATTRIBUTE}="true"] body {
      box-sizing: border-box !important;
      width: calc(100vw - 410px) !important;
      max-width: calc(100vw - 410px) !important;
      min-width: 0 !important;
      transition: width 180ms ease, max-width 180ms ease;
    }
    html[${SIDEBAR_OPEN_ATTRIBUTE}="true"] #globalNavPageNavArea,
    html[${SIDEBAR_OPEN_ATTRIBUTE}="true"] #topFrame {
      box-sizing: border-box !important;
      width: calc(100vw - 410px) !important;
      right: 410px !important;
    }
  `;
  (document.head ?? document.documentElement).append(style);
  return style;
}

function setPageSqueezed(open: boolean): void {
  if (open) {
    document.documentElement.setAttribute(SIDEBAR_OPEN_ATTRIBUTE, 'true');
  } else {
    document.documentElement.removeAttribute(SIDEBAR_OPEN_ATTRIBUTE);
  }
  window.dispatchEvent(new Event('resize'));
}

const contentScript = defineContentScript({
  registration: 'runtime',
  cssInjectionMode: 'ui',
  async main(ctx) {
    if (document.querySelector('better-blackboard-ui')) {
      setPageSqueezed(true);
      return;
    }

    const pageLayoutStyle = ensurePageLayoutStyle();
    setPageSqueezed(true);
    const context = parseCourseContext(new URL(window.location.href));
    let removeEmbeddedActions: (() => void) | undefined;
    if (context) {
      const transport = new FallbackApiTransport(
        new FetchApiTransport(context.origin),
        new BackgroundApiTransport(context.origin),
      );
      const client = new BlackboardClient(transport);
      removeEmbeddedActions = mountEmbeddedDownloadActions(
        context,
        client,
        client.getCourse(context.coursePk1),
      );
    }

    const ui = await createShadowRootUi(ctx, {
      name: 'better-blackboard-ui',
      position: 'overlay',
      anchor: 'body',
      isolateEvents: true,
      onMount(container) {
        const app = document.createElement('div');
        app.id = 'better-blackboard-root';
        container.append(app);
        const root = ReactDOM.createRoot(app);
        root.render(
          <React.StrictMode>
            <Sidebar
              onCollapsedChange={(collapsed) => setPageSqueezed(!collapsed)}
            />
          </React.StrictMode>,
        );
        return root;
      },
      onRemove(root) {
        root?.unmount();
        removeEmbeddedActions?.();
        setPageSqueezed(false);
        pageLayoutStyle.remove();
      },
    });

    ui.mount();
  },
});

export default contentScript;
