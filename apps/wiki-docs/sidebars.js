/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  tutorialSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Benutzerhandbuch',
      items: [
        'benutzer/erste-schritte',
        'benutzer/login',
        'benutzer/profil',
      ],
    },
    {
      type: 'category',
      label: 'Vorstand',
      items: [
        'vorstand/uebersicht',
        'vorstand/mitglieder',
        'vorstand/events',
        'vorstand/anmeldungen',
        'vorstand/mailcow',
      ],
    },
    {
      type: 'category',
      label: 'Kassensystem',
      items: [
        'kassensystem/uebersicht',
        'kassensystem/kitchen-display',
        'kassensystem/ip-whitelist',
        'kassensystem/tagesbericht',
        'kassensystem/lokale-instanz',
      ],
    },
    {
      type: 'category',
      label: 'Inventar',
      items: [
        'inventar/uebersicht',
        'inventar/scanner',
      ],
    },
    {
      type: 'category',
      label: 'Administration',
      items: [
        'admin/rollen',
        'admin/audit-log',
        'admin/einstellungen',
      ],
    },
    {
      type: 'category',
      label: 'API Dokumentation',
      items: [
        'api/uebersicht',
        'api/authentifizierung',
        'api/members',
        'api/events',
        'api/dispatch',
      ],
    },
  ],
};

module.exports = sidebars;
