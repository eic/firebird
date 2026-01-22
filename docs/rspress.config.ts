import { defineConfig } from 'rspress/config';

export default defineConfig({
  root: '.',
  base: '/firebird/',
  title: 'Firebird',
  description: 'ePIC Event Display Documentation',
  outDir: 'doc_build',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'API', link: '/api/' }
    ],
    sidebar: {
      '/': [
        { text: 'Getting Started', link: '/getting-started' },
        { text: 'Installation', link: '/installation' }
      ]
    },
    socialLinks: [
      { icon: 'github', mode: 'link', content: 'https://github.com/eic/firebird' }
    ]
  }
});