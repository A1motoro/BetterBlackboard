import React from 'react';
import ReactDOM from 'react-dom/client';
import { Sidebar } from '../ui/Sidebar';
import '../assets/sidebar.css';

const contentScript = defineContentScript({
  registration: 'runtime',
  cssInjectionMode: 'ui',
  async main(ctx) {
    if (document.querySelector('better-blackboard-ui')) return;

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
            <Sidebar />
          </React.StrictMode>,
        );
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    ui.mount();
  },
});

export default contentScript;
