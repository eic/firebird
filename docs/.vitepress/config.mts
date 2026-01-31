import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Firebird Doc",
  description: "Firebird Event Display documentation",
  base: '/firebird/',
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'EPIC Event Display', link: 'https://seeeic.org' }
    ],

    sidebar: [

      { text: "Home", link: "/" },
      { text: "Pyrobird", link: "/pyrobird" },
      { text: "DD4Hep Plugin", link: "/dd4hep-plugin"},
      { text: "Troubleshoot", link: "/troubleshoot"},

      { text: "Tutorials",
        items: [
          { text: "01 User Interface", link: "/tutorials/01_basic_ui" },
          { text: "02 Run Locally", link: "/tutorials/02_run_local" }
        ]
      },
      { text: "Development",
        items: [
          { text: "Data Format", link: "/dex"},
          { text: "Roadmap", link: "/eic-requirements" }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/eic/firebird' }
    ]
  }
})
