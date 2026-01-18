// @ts-check
const {themes} = require('prism-react-renderer');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'FWV Raura Wiki',
  tagline: 'Dokumentation für die Feuerwehrverein Raura Website',
  favicon: 'img/favicon.ico',
  url: 'https://wiki.fwv-raura.ch',
  baseUrl: '/',
  organizationName: 'Feuerwehrverein-Raura',
  projectName: 'Homepage',
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',
  i18n: {
    defaultLocale: 'de',
    locales: ['de'],
  },
  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          routeBasePath: '/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],
  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'FWV Raura Wiki',
        logo: {
          alt: 'FWV Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'Dokumentation',
          },
          {
            href: '/api',
            label: 'API Referenz',
            position: 'left',
          },
          {
            href: 'https://fwv-raura.ch',
            label: 'Zur Website',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Dokumentation',
            items: [
              { label: 'Erste Schritte', to: '/' },
              { label: 'Mitgliederverwaltung', to: '/mitglieder' },
              { label: 'Events', to: '/events' },
            ],
          },
          {
            title: 'Links',
            items: [
              { label: 'Hauptseite', href: 'https://fwv-raura.ch' },
              { label: 'Vorstand Login', href: 'https://fwv-raura.ch/vorstand.html' },
              { label: 'GitHub', href: 'https://github.com/Feuerwehrverein-Raura/Homepage' },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Feuerwehrverein Raura`,
      },
      prism: {
        theme: themes.github,
        darkTheme: themes.dracula,
      },
    }),
};

module.exports = config;
