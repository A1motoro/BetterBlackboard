import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Better Blackboard',
    description: '在 Blackboard Learn 中选择并批量下载课程附件。',
    version: '0.1.0',
    permissions: ['activeTab', 'downloads', 'storage', 'scripting'],
    optional_host_permissions: ['https://bb.cuhk.edu.cn/*'],
    web_accessible_resources: [
      {
        resources: ['content-scripts/content.css'],
        matches: ['https://bb.cuhk.edu.cn/*'],
        use_dynamic_url: true,
      },
    ],
    action: {
      default_title: '启用 Better Blackboard',
    },
  },
});
