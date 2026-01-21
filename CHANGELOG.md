## [1.22.1](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.22.0...v1.22.1) (2026-01-21)


### Bug Fixes

* change status label from "Ausstehend" to "Offen" ([9326056](https://github.com/Feuerwehrverein-Raura/Homepage/commit/9326056322f82ba43a1780125e21e55a4697c233))

# [1.22.0](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.21.1...v1.22.0) (2026-01-21)


### Features

* improve "Meine Events" to show all registrations with shifts ([fa3dfff](https://github.com/Feuerwehrverein-Raura/Homepage/commit/fa3dfffc80eb12c2378827d69e3da47363fa9e4d))

## [1.21.1](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.21.0...v1.21.1) (2026-01-21)


### Bug Fixes

* use organizer_name instead of organizer for event display ([ce35abd](https://github.com/Feuerwehrverein-Raura/Homepage/commit/ce35abdcd48aeb882e9f2071d4c837d92c895c7d))

# [1.21.0](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.20.0...v1.21.0) (2026-01-21)


### Features

* add Teilnehmerliste PDF export for participant registrations ([4163b90](https://github.com/Feuerwehrverein-Raura/Homepage/commit/4163b908624f867069d1ff3ddd96bdb8df84645a))

# [1.20.0](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.19.2...v1.20.0) (2026-01-21)


### Features

* show/hide event form fields based on category ([4151954](https://github.com/Feuerwehrverein-Raura/Homepage/commit/415195489993d4efe62a0c381a94a98ab3edb908))
* support participant registrations (without shifts) ([1cd8dee](https://github.com/Feuerwehrverein-Raura/Homepage/commit/1cd8dee63e2818a9e9691dcbe93a2c71d81f301b))

## [1.19.2](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.19.1...v1.19.2) (2026-01-21)


### Bug Fixes

* use valid Pingen webhook event_category 'sent' instead of 'letters' ([8043c90](https://github.com/Feuerwehrverein-Raura/Homepage/commit/8043c90748b2873d9b7669648863b3a928d9cc6e))

## [1.19.1](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.19.0...v1.19.1) (2026-01-21)


### Bug Fixes

* simplify invitation signature to just "Der Vorstand" when no organizer ([1eeee25](https://github.com/Feuerwehrverein-Raura/Homepage/commit/1eeee25469cb3805db2708adf821ec1022853801))

# [1.19.0](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.18.1...v1.19.0) (2026-01-21)


### Features

* use organizer name in event invitations when available ([e0e4fcc](https://github.com/Feuerwehrverein-Raura/Homepage/commit/e0e4fccf24e6af1e366e6177a1628cb3ddfb7a13))

## [1.18.1](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.18.0...v1.18.1) (2026-01-21)


### Bug Fixes

* correct DISPATCH_API URL to use api.fwv-raura.ch ([8269753](https://github.com/Feuerwehrverein-Raura/Homepage/commit/8269753b123d28436aed521eba95895a5be9902e))

# [1.18.0](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.17.5...v1.18.0) (2026-01-21)


### Features

* add event registrations management to Vorstand dashboard ([482ef64](https://github.com/Feuerwehrverein-Raura/Homepage/commit/482ef64c8af212e2df8ef41ac9a74d580d7eaabc))

## [1.17.5](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.17.4...v1.17.5) (2026-01-21)


### Bug Fixes

* filter out create_access from event update to prevent DB error ([94591ae](https://github.com/Feuerwehrverein-Raura/Homepage/commit/94591ae1070a32efd8e84b5424bf03e614bfbee6))

## [1.17.4](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.17.3...v1.17.4) (2026-01-21)


### Bug Fixes

* store email in audit_log email column ([d8e7806](https://github.com/Feuerwehrverein-Raura/Homepage/commit/d8e780651e627f1a1aeeaf21770e14f7d66331ed))

## [1.17.3](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.17.2...v1.17.3) (2026-01-21)


### Bug Fixes

* add no-cache to all Docker builds to prevent corrupted images ([eb0ffbc](https://github.com/Feuerwehrverein-Raura/Homepage/commit/eb0ffbc79f6ec41f18a2ca885fb9feec9017982d))

## [1.17.2](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.17.1...v1.17.2) (2026-01-21)


### Bug Fixes

* disable Docker cache for backend-events build ([d9d9228](https://github.com/Feuerwehrverein-Raura/Homepage/commit/d9d922850be635ea2adc1d6033d6867f9685b70b))

## [1.17.1](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.17.0...v1.17.1) (2026-01-21)


### Bug Fixes

* improve shift registration display with bereich and time info ([a26f131](https://github.com/Feuerwehrverein-Raura/Homepage/commit/a26f1319a893830b04c3261b614fd50a61edb919))

# [1.17.0](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.16.2...v1.17.0) (2026-01-21)


### Features

* add staging parameter to Pingen API calls ([5846c38](https://github.com/Feuerwehrverein-Raura/Homepage/commit/5846c387086e8f76de4f5f4ef8554f6a2dfc9a8e))
* add staging toggle to Pingen UI in vorstand.html ([b95c1d2](https://github.com/Feuerwehrverein-Raura/Homepage/commit/b95c1d27a9a8c54ff4270c2097a13696a97e3d4b))

## [1.16.2](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.16.1...v1.16.2) (2026-01-21)


### Bug Fixes

* use correct Pingen billing_balance attribute ([c233655](https://github.com/Feuerwehrverein-Raura/Homepage/commit/c233655d13567bdad161f980fbbfa32ae10b0fc8))

## [1.16.1](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.16.0...v1.16.1) (2026-01-21)


### Bug Fixes

* use correct Pingen identity endpoint for OAuth tokens ([e6178e2](https://github.com/Feuerwehrverein-Raura/Homepage/commit/e6178e298cee681537c6fb11f9cad89cc1d785b9))

# [1.16.0](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.15.0...v1.16.0) (2026-01-21)


### Features

* add Pingen postal mail integration and Arbeitsplan auto-send ([24506df](https://github.com/Feuerwehrverein-Raura/Homepage/commit/24506dff6d93dd0a41e908741ff74fcdf7b6af8b))

# [1.15.0](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.14.0...v1.15.0) (2026-01-21)


### Features

* add shift notifications, organizer fields, and event dashboard ([5dc0a64](https://github.com/Feuerwehrverein-Raura/Homepage/commit/5dc0a648bad62cac6479d0163a351f1aaa048bab))

# [1.14.0](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.13.3...v1.14.0) (2026-01-21)


### Features

* auto-link event registrations to members by email ([3f99b61](https://github.com/Feuerwehrverein-Raura/Homepage/commit/3f99b614fe665f83d9bc20548bb2313c045d65e6))

## [1.13.3](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.13.2...v1.13.3) (2026-01-21)


### Bug Fixes

* rename member-registrations, fix Traefik routing for event registrations ([92a0b88](https://github.com/Feuerwehrverein-Raura/Homepage/commit/92a0b88f00bd5ca08935272a36cf26d74221f5c8))

## [1.13.2](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.13.1...v1.13.2) (2026-01-21)


### Bug Fixes

* increase JSON body size limit to 10mb for PDF generation ([cd468ee](https://github.com/Feuerwehrverein-Raura/Homepage/commit/cd468eec12952e27603f0c169bd0f889636f9826))

## [1.13.1](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.13.0...v1.13.1) (2026-01-21)


### Bug Fixes

* add /arbeitsplan route to Traefik for PDF generation ([3158b18](https://github.com/Feuerwehrverein-Raura/Homepage/commit/3158b1886fdd43b76e661563590ef6b8444d4afb))

# [1.13.0](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.12.1...v1.13.0) (2026-01-21)


### Features

* add Arbeitsplan PDF generation and clickable event tiles ([69d6af8](https://github.com/Feuerwehrverein-Raura/Homepage/commit/69d6af8d3dc99aa17e568ba60c5be95183cbdece))

## [1.12.1](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.12.0...v1.12.1) (2026-01-19)


### Bug Fixes

* load events from API instead of markdown files ([3ece088](https://github.com/Feuerwehrverein-Raura/Homepage/commit/3ece0881ba1067c70e96d6ccf68587ec4115d617))

# [1.12.0](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.11.0...v1.12.0) (2026-01-19)


### Features

* support multiple functions per member ([0c49837](https://github.com/Feuerwehrverein-Raura/Homepage/commit/0c498379909b4896fbf2311b29ed388aeba211c8))

# [1.11.0](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.10.0...v1.11.0) (2026-01-19)


### Features

* add Social Media function with shared mailbox ([ee4eb82](https://github.com/Feuerwehrverein-Raura/Homepage/commit/ee4eb82fdfaaf22f799c352312e6ff1fc991879d))

# [1.10.0](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.9.5...v1.10.0) (2026-01-19)


### Features

* add Statuten section to main page ([2698f9e](https://github.com/Feuerwehrverein-Raura/Homepage/commit/2698f9e8279521e451e5055da5793c78d4d7da32))

## [1.9.5](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.9.4...v1.9.5) (2026-01-19)


### Bug Fixes

* resolve CORS, API URLs, routing conflicts, and audit log issues ([39e1887](https://github.com/Feuerwehrverein-Raura/Homepage/commit/39e18873361363a47006df7f8c269b715849fe8a))

## [1.9.4](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.9.3...v1.9.4) (2026-01-19)


### Bug Fixes

* correct PLZ/Ort splitting and firefighter status check in member registration ([9ea8f87](https://github.com/Feuerwehrverein-Raura/Homepage/commit/9ea8f8731a08827ef2f34ee46051f70f5510f97b))

## [1.9.3](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.9.2...v1.9.3) (2026-01-19)


### Bug Fixes

* use correct audit logging with real client IP ([faaef36](https://github.com/Feuerwehrverein-Raura/Homepage/commit/faaef36b24110d7e908588d02710edb78bbb1529))

## [1.9.2](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.9.1...v1.9.2) (2026-01-19)


### Bug Fixes

* send notification email when member updates own data via mein.html ([aff596b](https://github.com/Feuerwehrverein-Raura/Homepage/commit/aff596bc84a0c8ffcaef81a010069435c7146df8))

## [1.9.1](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.9.0...v1.9.1) (2026-01-19)


### Bug Fixes

* use correct mail server mail.test.juroct.net everywhere ([777367f](https://github.com/Feuerwehrverein-Raura/Homepage/commit/777367fe98b4cfe35be4c77933b29fcfb67c0f36))

# [1.9.0](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.8.0...v1.9.0) (2026-01-19)


### Features

* add function email credentials display and password change ([f6d4e70](https://github.com/Feuerwehrverein-Raura/Homepage/commit/f6d4e7067c162368f2733b7b2ae88c6016478fee))

# [1.8.0](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.7.2...v1.8.0) (2026-01-19)


### Features

* add Arbeitsplan PDF generation endpoint with exact template matching ([a842194](https://github.com/Feuerwehrverein-Raura/Homepage/commit/a842194a1bb222f10ba8de203be51b695793ea36))

## [1.7.2](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.7.1...v1.7.2) (2026-01-19)


### Bug Fixes

* match Arbeitsplan format to PDF template ([2570f92](https://github.com/Feuerwehrverein-Raura/Homepage/commit/2570f92cbabf62d7ebd6d960fa20da8c3e30c683))

## [1.7.1](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.7.0...v1.7.1) (2026-01-19)


### Bug Fixes

* generate Arbeitsplan from shifts data instead of loading markdown files ([52b0fe8](https://github.com/Feuerwehrverein-Raura/Homepage/commit/52b0fe868b280630eb21af5650efa7916e00dc88))

# [1.7.0](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.6.0...v1.7.0) (2026-01-19)


### Features

* auto-show preview after generating event invitation ([fe35988](https://github.com/Feuerwehrverein-Raura/Homepage/commit/fe359882ced4f8ed04c28b967688f6c9b247aaf8))

# [1.6.0](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.5.1...v1.6.0) (2026-01-19)


### Features

* add automatic event invitation generation ([56c309f](https://github.com/Feuerwehrverein-Raura/Homepage/commit/56c309fb8be8b14d963480ef088c11df9e9f271d))

## [1.5.1](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.5.0...v1.5.1) (2026-01-19)


### Bug Fixes

* dispatch templates and preview functionality ([5404c48](https://github.com/Feuerwehrverein-Raura/Homepage/commit/5404c48ae6b2ae4be1c1cd4b01abd21f26668ee6))

# [1.5.0](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.4.0...v1.5.0) (2026-01-18)


### Features

* add automatic delivery method based on member preferences ([57d80fc](https://github.com/Feuerwehrverein-Raura/Homepage/commit/57d80fce25a52788e27794cc64ece5ab5acf6727))

# [1.4.0](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.3.4...v1.4.0) (2026-01-18)


### Features

* add email/post dispatch system with automatic notifications ([e33f6d1](https://github.com/Feuerwehrverein-Raura/Homepage/commit/e33f6d166040c85f3720ad46c7b7bd4bd91089ca))

## [1.3.4](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.3.3...v1.3.4) (2026-01-18)


### Bug Fixes

* prevent timezone conversion for dates in API responses ([8b85702](https://github.com/Feuerwehrverein-Raura/Homepage/commit/8b85702cdbed56fdacec4e063f34fd54fb964ef8))

## [1.3.3](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.3.2...v1.3.3) (2026-01-18)


### Bug Fixes

* shift data not persisted correctly ([726e191](https://github.com/Feuerwehrverein-Raura/Homepage/commit/726e191db396c677a1daa97b9ed9eea984f4e3ff))

## [1.3.2](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.3.1...v1.3.2) (2026-01-18)


### Bug Fixes

* add API base URL to Vorstand photo paths ([d84952a](https://github.com/Feuerwehrverein-Raura/Homepage/commit/d84952a0625fd01dffdee9c842520e418d3f1820))

## [1.3.1](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.3.0...v1.3.1) (2026-01-18)


### Bug Fixes

* add persistent volume for member photo uploads ([de7abfd](https://github.com/Feuerwehrverein-Raura/Homepage/commit/de7abfd4ef2791e71e4065dc86900a2e407f4742))

# [1.3.0](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.2.1...v1.3.0) (2026-01-18)


### Features

* add photo upload feature for members and cleanup old files ([0629612](https://github.com/Feuerwehrverein-Raura/Homepage/commit/0629612f29dde2ba5fe9ce5d971a94e2b47b651e))

## [1.2.1](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.2.0...v1.2.1) (2026-01-18)


### Bug Fixes

* add missing auth-callback.html to docker frontend ([1cc632e](https://github.com/Feuerwehrverein-Raura/Homepage/commit/1cc632e1282df09b0639c55ebc00b552f220584f))

# [1.2.0](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.1.0...v1.2.0) (2026-01-18)


### Bug Fixes

* replace stefan+fwv-raura@juroct.ch with aktuar@fwv-raura.ch ([7b53b6a](https://github.com/Feuerwehrverein-Raura/Homepage/commit/7b53b6a6582740c8efb5c9fe482dd82575b9f072))


### Features

* add wiki documentation site (wiki.fwv-raura.ch) ([e8a9de1](https://github.com/Feuerwehrverein-Raura/Homepage/commit/e8a9de1b21fb34c7870ede85d5bc5ab2649b3596))

# [1.1.0](https://github.com/Feuerwehrverein-Raura/Homepage/compare/v1.0.0...v1.1.0) (2026-01-18)


### Features

* add Admin as Funktion option with full privileges ([ef00c53](https://github.com/Feuerwehrverein-Raura/Homepage/commit/ef00c5308fb2f2666f1d10562e9ef78b91e1ea21))

# 1.0.0 (2026-01-18)


### Bug Fixes

* configure git credentials for semantic-release ([419154a](https://github.com/Feuerwehrverein-Raura/Homepage/commit/419154ab93a4f8898b9a9c4c557d0a1fff3488e6))
* correct repository URL in package.json for semantic-release ([f56aee4](https://github.com/Feuerwehrverein-Raura/Homepage/commit/f56aee4ad34052294caa10d9578b654fb00ee9d1))


### Features

* add semantic-release for automatic versioning ([95f0f5d](https://github.com/Feuerwehrverein-Raura/Homepage/commit/95f0f5d9a1bd0aae08a8a63cd9e365770d418dd4))
