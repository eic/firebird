import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Firebird Event Display documentation",
  description: "Firebird Event Display documentation",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'EPIC', link: 'https://seeeic.org' }
    ],

    sidebar: [
      {
        text: 'Examples',
        items: [
          { text: "Pyrobird", link: "/pyrobird" },
          { text: "DD4Hep Plugin", link: "/dd4hep-plugin"},
          { text: "Troubleshoot", link: "/troubleshoot"},
          { text: "Tutorials",
            items: [
              { text: "01 User Interface", link: "/tutorials/01_basic_ui" },
              { text: "02 Run Locally", link: "/tutorials/02_run_local" }
            ]},
          { text: 'Markdown Examples', link: '/markdown-examples' },
          { text: 'Runtime API Examples', link: '/api-examples' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/eic/firebird' }
    ]
  }
})
