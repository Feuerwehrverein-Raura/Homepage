# Vorstand: alle Funktionen aller Varianten (Checkliste)

Stand 14.10.2026. Der Vorstand zieht in die Flutter-Mitglieder-App
(Reiter «Vorstand» statt «Organisator»; Android, iPhone, Browser «Mein
Bereich», Desktop Linux/Windows/macOS). Heute gibt es dieselbe Arbeit in
mehreren Varianten mit **unterschiedlichen** Funktionen. Diese Liste
fuehrt jede Funktion einmal auf, damit beim Umzug nichts verloren geht.

**Entscheid 14.10.2026:** Vorstandsmitglieder sehen den Reiter
«Organisator» **nicht**. An seiner Stelle steht «Vorstand» mit allen
Funktionen dahinter – auch allem, was der Organisator kann, fuer alle
Anlaesse. Code: Paket `flutter/fwv_vorstand`, je Bereich eine Ansicht
(`lib/src/ui/*_ansicht.dart`), Reiter in `mitglieder/lib/vorstand/`.

**So benutzen:** `[x]`, sobald die Funktion in der neuen App da ist.
Funktionen, die es nur in einer Variante gibt, sind mit **nur in …**
markiert. Unter «Offene Fragen» stehen halbfertige oder tote Teile –
dort entscheiden, ob sie mitkommen.

Spalten: **W** = vorstand.html (Web) · **A** = vorstand-android ·
**D** = vorstand-desktop (Tauri) · **O** = Organisator-Varianten
(alte members-android/-ios, event-dashboard.html) · **F** = Flutter heute.
✓ vorhanden · ½ halb/kaputt · – fehlt. Dienste: M members, E events,
A accounting, D dispatch, I inventar (alle unter api.fwv-raura.ch,
Inventar unter inventar.fwv-raura.ch/api).

Quellen: Bestandsaufnahmen vom 14.10.2026 (Code gelesen, keine Annahmen).

## 1. Anmeldung und Zugang

| | Funktion | W | A | D | O | F | API / Hinweis |
|---|---|---|---|---|---|---|---|
| [x] | Persoenliches Login (Authentik) gilt als Vorstand | – | – | – | – | ✓ | Phase 0 (db3306d), Gruppe Vorstand/admin |
| [ ] | Login ueber Funktionspostfach (IMAP) | ✓ | ✓ | ✓ | – | – | POST /auth/vorstand/login (M) – **entfaellt** |
| [ ] | QR-Login Vorstand-App | – | ✓ | – | – | – | POST /auth/vorstand/qr-login (M) – **nur in A**; ersetzt durch QR-Login Mitglied |
| [ ] | Token-Refresh Vorstand | – | ✓ | – | – | ✓ | /auth/vorstand/refresh – in F: /auth/refresh bzw. Authentik |
| [ ] | Rolle/Funktion anzeigen (Aktuar, Kassier …) | ✓ | – | ✓ | – | – | GET /auth/vorstand/me (M), liefert jetzt rollen + person |
| [ ] | Weiterleitung mit Token an andere Apps (?redirect, Cookie .fwv-raura.ch) | ✓ | – | – | – | – | **nur in W**; PDF-Designer braucht das (siehe 9) |
| [ ] | Auto-Update der App | – | ✓ | ✓ | – | ✓ | F: Android-Hinweis; Desktop braucht eigenen Weg |
| [ ] | Design hell/dunkel/System | – | ✓ | ✓ | – | – | |
| [ ] | Anmeldung mit Google/Microsoft/Apple | – | – | – | – | – | geplant (Authentik-Quellen) |

## 2. Mitglieder

| | Funktion | W | A | D | O | F | API / Hinweis |
|---|---|---|---|---|---|---|---|
| [ ] | Liste mit Suche (Server) | ✓ | ✓ | ✓ | – | – | GET /members?search= (M) |
| [ ] | Statusfilter (Aktiv, Aufnahme pendent, Ehren, Testkonto) | ✓ | ✓ | ✓ | – | – | GET /members?status= |
| [ ] | Kennzahlen (Gesamt, Aktiv, pendent, Ehren) | ✓ | ½ | ✓ | – | – | GET /members/stats/overview; A laedt, zeigt nicht |
| [ ] | Detail ansehen | ✓ | ✓ | ✓ | – | – | GET /members/:id |
| [ ] | Anlegen | ✓ | ✓ | ✓ | – | – | POST /members |
| [ ] | Bearbeiten (alle Felder inkl. Adresszusatz, Versand-E-Mail, Zustellung, Geschlecht, FW-Zugehoerigkeit, Bemerkungen) | ✓ | ½ | ✓ | – | – | PUT /members/:id; A fehlen 5 Felder |
| [ ] | Funktionen zuweisen (Mehrfach, Revisor schliesst Vorstand aus) | ✓ | ½ | ✓ | – | – | im PUT; Ausschluss nur im Browser geprueft |
| [ ] | Eintrittsdatum automatisch bei «Feuerwehr Raurica» | ✓ | – | – | – | – | **nur in W** (Client-Logik) |
| [ ] | Loeschen (mit Rueckfrage; Aktuar+Kassier bestaetigen per Mail) | ✓ | ✓ | ✓ | – | – | DELETE /members/:id |
| [ ] | Profilfoto hochladen (Galerie) | ✓ | ✓ | ½ | – | – | POST /members/:id/photo; D nur API |
| [ ] | Profilfoto mit Kamera | – | ✓ | – | – | – | **nur in A** |
| [ ] | Profilfoto loeschen | ✓ | ✓ | ½ | – | – | DELETE /members/:id/photo |
| [ ] | Mitglied benachrichtigen (Push, optional E-Mail) | ✓ | ✓ | ✓ | – | – | POST /push/to-members (E) |
| [ ] | Anrufen/Mail/Karte aus dem Detail | – | – | – | – | – | in keiner Variante – fuers Handy sinnvoll |
| [ ] | Telefonliste PDF | ✓ | – | ✓ | – | – | GET /members/pdf/telefonliste |
| [ ] | CSV-Export (alle, aktiv, Post, E-Mail) | ✓ | – | – | – | – | **nur in W** (Client) |
| [ ] | Mitgliederverzeichnis (Auswahl beim Eintragen) | – | – | – | ✓ | ✓ | GET /members/directory |

## 3. Zugaenge, Passwoerter, Gruppen

| | Funktion | W | A | D | O | F | API / Hinweis |
|---|---|---|---|---|---|---|---|
| [ ] | Status Nextcloud-Admin / Vorstand-Gruppe / Social-Media-Gruppe | ✓ | ✓ | ✓ | – | – | GET /members/:id/{nextcloud-admin,vorstand-group,social-media-group} |
| [ ] | Gruppen nach Funktion abgleichen | ✓ | ✓ | – | – | – | POST dieselben {enabled}; W automatisch nach Speichern |
| [ ] | Gruppen einzeln schalten | – | – | ✓ | – | – | **nur in D** |
| [x] | Gruppen verwalten (Lager, Roter Schopf, …) | – | – | – | – | ✓ | /vorstand/gruppen* (M) |
| [ ] | Temporaeres Passwort (Reset) | ✓ | – | ✓ | – | – | POST /members/:id/reset-password |
| [ ] | Passwort setzen | ✓ | – | ✓ | – | – | POST /members/:id/set-password |
| [ ] | Login-Datenblatt drucken (QR + neues Passwort) | ✓ | – | – | – | – | POST /members/:id/datenblatt – **nur in W** |
| [ ] | Anmeldebon (Bondrucker Schopf, Einmal-Code) | ✓ | – | – | – | – | POST /members/:id/anmeldebon – **nur in W** |
| [ ] | App-QR Vorstand: Liste/erstellen/widerrufen | ✓ | – | ✓ | – | – | /auth/vorstand/app-tokens – entfaellt mit Phase 0? |
| [ ] | App-QR Mitglied: Liste/erstellen/widerrufen/drucken | ✓ | – | ✓ | – | – | /auth/member/app-tokens |
| [ ] | Passwort-Tresor (Vaultwarden) lesen, kopieren, sperren | – | ✓ | ½ | – | – | vault.fwv-raura.ch – **nur in A** (D Platzhalter) |
| [x] | Eigene Zugaenge (Funktions-Mail-Passwort aendern) | – | – | – | ✓ | ✓ | GET/PUT /members/me/… |

## 4. Mitgliedschaftsantraege

| | Funktion | W | A | D | O | F | API / Hinweis |
|---|---|---|---|---|---|---|---|
| [ ] | Zaehler offener Antraege | ✓ | ✓ | ½ | – | – | GET /member-registrations/count/pending (M) |
| [ ] | Liste mit Statusfilter | ✓ | ½ | ✓ | – | – | GET /member-registrations?status=; A nur offene |
| [ ] | Antrag im Detail | ✓ | – | ✓ | – | – | GET /member-registrations/:id |
| [ ] | Genehmigen (Status waehlen) | ✓ | ✓ | ✓ | – | – | POST …/:id/approve |
| [ ] | Ablehnen mit Grund | ✓ | ½ | ✓ | – | – | POST …/:id/reject; A ohne Grund |
| [ ] | Benachrichtigung bei neuem Antrag | – | ✓ | – | – | – | **nur in A** (Audit-Polling) → in F per Push |

## 5. Anlaesse, Schichten, Anmeldungen

| | Funktion | W | A | D | O | F | API / Hinweis |
|---|---|---|---|---|---|---|---|
| [ ] | Alle Anlaesse (Vorstandssicht) | ✓ | ✓ | ✓ | – | ½ | GET /events; F nur eigene (organisator-uebersicht kann Vorstand) |
| [ ] | Vorschlaege: Liste, genehmigen, bearbeiten, ablehnen | ✓ | ✓ | ✓ | – | – | GET /events/proposals, PUT/DELETE /events/:id |
| [ ] | Anlass anlegen (Kategorie steuert Felder, Menue bei GV) | ✓ | ✓ | ✓ | – | – | POST /events (+ /shifts) |
| [ ] | Anlass bearbeiten | ✓ | ✓ | ✓ | ✓ | ✓ | PUT /events/:id bzw. …/as-organizer |
| [ ] | «Termin noch offen» (datum_offen) | ✓ | – | – | – | – | **nur in W** |
| [ ] | Anlass loeschen | ✓ | ½ | ✓ | – | – | DELETE /events/:id |
| [ ] | Organisator zuweisen (Mitglied) | ✓ | ✓ | ✓ | – | – | organizer_id |
| [ ] | Externer Organisator + Zugang erstellen | ✓ | ✓ | ✓ | – | – | create_access → event-dashboard |
| [ ] | PDF-Aushang hochladen/entfernen | ✓ | ✓ | ✓ | ½ | – | pdf_attachment; O: nur alt-Android |
| [ ] | Schichten anlegen/aendern/loeschen | ✓ | ✓ | ✓ | ✓ | ✓ | /shifts bzw. shifts-as-organizer |
| [ ] | Springer-Schichten generieren | ✓ | – | ✓ | – | – | Client-Logik |
| [ ] | Anmeldungen ansehen (nach Schicht, GV mit Menue/Allergien) | ✓ | ✓ | ✓ | ✓ | ✓ | |
| [ ] | Anmeldung bestaetigen / ablehnen | ✓ | ✓ | ✓ | ✓ | ✓ | /registrations/:id/approve|reject |
| [ ] | Anmeldung bearbeiten (inkl. Status) | ✓ | ✓ | ✓ | ½ | ✓ | PUT /registrations/:id |
| [ ] | Anmeldung loeschen | – | – | – | ✓ | ✓ | DELETE …/as-organizer |
| [ ] | Person eintragen (Mitglied/Gast, auch ohne Schicht) | ✓ | ✓ | ✓ | ✓ | ✓ | POST /registrations |
| [ ] | Andere Schicht vorschlagen | ✓ | ✓ | ✓ | ✓ | ✓ | …/suggest-alternative |
| [ ] | Angemeldete informieren | ✓ | ✓ | ✓ | ✓ | ✓ | POST /events/:id/notify-registrants |
| [ ] | Arbeitsplan ansehen / PDF | ✓ | ✓ | ✓ | ✓ | ✓ | /events/:id/arbeitsplan, /pdf/arbeitsplan |
| [ ] | Arbeitsplan an Helfer senden | – | – | – | ✓ | ✓ | /events/my-event/send-arbeitsplan – nur extern; fuer Vorstand fehlt eine Route |
| [ ] | Teilnehmerliste PDF / Aushang PDF | ✓ | ✓ | ✓ | ✓ | ✓ | |
| [ ] | Einladung erzeugen (springt in Versand) | ✓ | – | ✓ | – | – | |
| [ ] | Organisator-Notizen mit Anhaengen | ✓ | ✓ | ✓ | ✓ | ✓ | /events/:id/organizer-notes |

## 6. Material, Einkauf, Rezepte

| | Funktion | W | A | D | O | F | API / Hinweis |
|---|---|---|---|---|---|---|---|
| [x] | Rezepte verknuepfen, Portionen | – | ✓ | ✓ | ✓ | ✓ | /events/:id/recipes |
| [x] | Material von Hand | – | ✓ | ✓ | ✓ | ✓ | /events/:id/manual-items |
| [x] | Einkaufsliste, abhaken, Belege, zurueckbuchen | – | ½ | ½ | ½ | ✓ | F hat mehr als alle anderen |
| [x] | Lager: Artikel, Lagerorte, Buchen, Scannen, Anlegen, Ausleihe | – | – | – | – | ✓ | Inventar-API |
| [ ] | Rezepte verwalten (anlegen/bearbeiten) | – | – | – | – | – | in keiner Variante (Inventar-Web?) |

## 7. Nachricht und Versand

| | Funktion | W | A | D | O | F | API / Hinweis |
|---|---|---|---|---|---|---|---|
| [ ] | Versandart Auto/E-Mail/Post/PDF-Brief | ✓ | ½ | ✓ | – | – | /email/bulk, /dispatch/send-post, /send-pdf-post, /dispatch/smart (D) |
| [ ] | Empfaenger: alle / nach Status / nach Zustellart | ½ | ½ | ✓ | – | – | W+A Statusfilter kaputt (Werte passen nicht) |
| [ ] | Empfaenger einzeln auswaehlen | ½ | – | ✓ | – | – | W Knopf ohne Funktion |
| [ ] | Vorlage waehlen | ½ | ✓ | ✓ | – | – | GET /templates; W nur eine fest eingebaute |
| [ ] | Rich-Text-Editor, Platzhalter | ✓ | ✓ | ✓ | – | – | |
| [ ] | Event-Einladung / Helferaufruf mit Schichten | ✓ | – | ✓ | – | – | |
| [ ] | Vorschau E-Mail / Brief-PDF mit Adresszonen | ✓ | ½ | ✓ | – | – | POST /dispatch/preview-pdf?zones=1 |
| [ ] | Anhaenge mitsenden | ½ | – | – | – | – | W waehlbar, aber nie gesendet |
| [ ] | Entwuerfe | ½ | – | – | – | – | W nur localStorage |
| [ ] | Zeitgesteuert senden / «Geplant» | ½ | – | – | – | – | W Platzhalter |
| [ ] | Versandverlauf mit Filter | ✓ | ✓ | ✓ | – | – | GET /dispatch-log |
| [ ] | App-Push an alle | ✓ | ✓ | ✓ | – | – | POST /push/broadcast (E) |
| [ ] | Vorlagen anlegen/bearbeiten/loeschen | ½ | – | ✓ | – | – | /templates (D); W-Editor tot; **nur in D** nutzbar |
| [ ] | Massen-PDF per Post an Auswahl (Kostenschaetzung, Staging) | ½ | ✓ | ✓ | – | – | POST /pingen/send-bulk-pdf |

## 8. Pingen (Post)

| | Funktion | W | A | D | O | F | API / Hinweis |
|---|---|---|---|---|---|---|---|
| [ ] | Konto/Guthaben (Live/Staging) | ½ | ✓ | ✓ | – | – | GET /pingen/account |
| [ ] | Statistik, Briefliste | ½ | ½ | ✓ | – | – | GET /pingen/stats, /letters; W kaputt, A verwaist |
| [ ] | Briefstatus pruefen / automatischer Abgleich | ½ | ½ | ✓ | – | – | GET /pingen/letters/:id/status |
| [ ] | Einzelbrief senden | ½ | – | ✓ | – | – | POST /pingen/send-manual |
| [ ] | Webhooks verwalten | ½ | – | ✓ | – | – | /pingen/webhooks* – **nur in D** nutzbar |

## 9. Vorlagen und PDF-Layout

| | Funktion | W | A | D | O | F | API / Hinweis |
|---|---|---|---|---|---|---|---|
| [ ] | PDF-Designer (pdfme, pdf.fwv-raura.ch) | ✓ | – | – | – | – | eigene App; **verlinken statt nachbauen**; braucht Token-Uebergabe (vorstand_token-Cookie) |
| [ ] | Brieflayouts (allgemein, Einladung, Deckblatt, Beitrag) | ✓ | ½ | ✓ | – | – | heute im Client gebaut → ins Backend verlegen |

## 10. E-Mail: Mailcow, Posteingang, Adressbuch

| | Funktion | W | A | D | O | F | API / Hinweis |
|---|---|---|---|---|---|---|---|
| [ ] | Postfaecher: Liste, anlegen, bearbeiten, loeschen | ✓ | ✓ | ½ | – | – | /mailcow/mailboxes (D); D ohne Bearbeiten |
| [ ] | Aliase: Liste, anlegen, bearbeiten, loeschen | ✓ | ✓ | ½ | – | – | /mailcow/aliases |
| [ ] | Speicherplatz | ✓ | ✓ | ✓ | – | – | GET /mailcow/quota |
| [ ] | Zustellliste, Adressen kopieren, Alias mitglieder@ abgleichen | ✓ | ✓ | ✓ | – | – | /members/emails/zustellung, sync-alias |
| [ ] | Posteingang (IMAP): Ordner, lesen, Anhaenge, Flags, verschieben, loeschen, Suche | ✓ | – | ✓ | – | – | /imap/* (D); Suche **nur in D** |
| [ ] | Verfassen/Antworten/Weiterleiten mit Anhaengen, Entwurf | ✓ | – | ✓ | – | – | /imap/send, /imap/draft |
| [ ] | Geteiltes Adressbuch: Liste, anlegen, bearbeiten, loeschen, uebernehmen | ✓ | – | ✓ | – | ½ | /contacts (D); F nur Mitglieder-Adressbuch |

## 11. Beitraege und Buchhaltung

| | Funktion | W | A | D | O | F | API / Hinweis |
|---|---|---|---|---|---|---|---|
| [ ] | Jahreseinstellungen (Betrag, GV-Datum, Faelligkeit) | ✓ | ✓ | ✓ | – | – | /membership-fees/settings (A) |
| [ ] | Beitraege erzeugen | ✓ | ✓ | ✓ | – | – | POST …/payments/generate |
| [ ] | Kennzahlen, Zahlungsliste, Suche, Filter | ✓ | ✓ | ✓ | – | – | …/summary, …/payments |
| [ ] | Bezahlt / offen / Referenz setzen | ✓ | ✓ | ✓ | – | – | PATCH …/payments/:id/{pay,unpay,reference} |
| [ ] | Beitragsbrief einzeln (E-Mail/Post) | ✓ | ✓ | ✓ | – | – | POST …/payments/:id/send |
| [ ] | Beitragsbriefe an alle (E-Mail/Post) | ✓ | ✓ | ✓ | – | – | send-email-bulk / send-post-bulk |
| [ ] | Briefvorschau mit Swiss-QR, alle drucken | ✓ | – | – | – | – | **nur in W** (Client) → ins Backend |
| [ ] | Kassier waehlen (bei mehreren) | ✓ | – | – | – | – | **nur in W** |
| [ ] | Zahlungserinnerungen (Push+Mail, 30-Tage-Takt) | ✓ | ✓ | ✓ | – | – | POST …/send-reminders |
| [ ] | Rechnungen, Transaktionen, Konten | ½ | – | ½ | – | – | /invoices, /transactions (A) nur im Export; /transactions nicht geroutet |

## 12. Geplante Auftraege

| | Funktion | W | A | D | O | F | API / Hinweis |
|---|---|---|---|---|---|---|---|
| [ ] | Beitragsversand planen | – | ✓ | ✓ | – | – | POST /scheduled-jobs (D) |
| [ ] | Liste mit Status, stornieren | – | ✓ | ✓ | – | – | GET/DELETE /scheduled-jobs |

## 13. Audit und Benachrichtigungen

| | Funktion | W | A | D | O | F | API / Hinweis |
|---|---|---|---|---|---|---|---|
| [ ] | Audit-Log mit Aktionsfilter | ✓ | ½ | ✓ | – | – | GET /audit (M); A ohne Filter |
| [ ] | Benachrichtigung bei neuen Audit-Ereignissen (Mitglied, Antrag, Anmeldung, Austritt) | – | ✓ | – | – | – | **nur in A** (alle 15 min) → in F als Push vom Backend |

## 14. Export und Sonstiges

| | Funktion | W | A | D | O | F | API / Hinweis |
|---|---|---|---|---|---|---|---|
| [ ] | Gesamtexport Excel (Mitglieder, Beitraege, Rechnungen, Anmeldungen, Anlaesse, Versand) | ✓ | – | ✓ | – | – | heute Client (SheetJS) → Backend-Route |
| [ ] | Taegliches Backup per Mail | – | – | – | – | – | laeuft im Server (dispatch), keine App-Funktion |
| [ ] | Bildschirm Roter Schopf steuern | – | – | – | – | ✓ | schon in F |
| [ ] | Fremde Playlists loeschen | – | – | – | – | ✓ | schon in F |

## Offene Fragen (halbfertig, tot oder doppelt)

- **Vorlagen-Editor im Web** ist tot (nie aufrufbar), der Nachricht-Tab hat
  nur eine fest eingebaute Vorlage. Nutzbar nur in D. Mitnehmen?
- **Pingen** im Web: alter Post-Tab nicht erreichbar, neuer Pingen-Sub-Tab
  kaputt (doppelte Funktion). In A verwaist. Nur D funktioniert.
- **Empfaengerfilter** in W und A liefern 0 Empfaenger (Statuswerte).
  Beim Neubau richtig machen, nicht nachbauen.
- **Anhaenge im Nachricht-Tab** (W) werden nie gesendet; **Entwuerfe** nur
  im Browser; **Zeitgesteuert/Geplant** Platzhalter.
- **Smart-Versand** (A) uebertraegt den getippten Text nicht.
- **Vaultwarden**: nur A kann lesen, D ist Platzhalter. In F gewuenscht?
  (heikle Krypto im Client)
- **App-QR Vorstand** (/auth/vorstand/app-tokens): mit dem persoenlichen
  Login noch noetig?
- **Organisator-QR-Login** (POST auth/organizer/qr-login) in alten Apps –
  Route existiert nicht. Weglassen.
- **event-dashboard.html** «Arbeitsplan bearbeiten» ignoriert den Parameter.
- **/member-registrations** gibt es in members und dispatch; geroutet nur
  members – Kopie in dispatch entfernen. /sms, /letters geroutet, aber
  ohne Routen.
- **Mitglieder-Kontaktdaten an Externe**: event-dashboard zeigt externen
  Organisatoren E-Mail und Telefon aller Mitglieder (Auswahl). Gewollt?
- **Mitglied loeschen** in A ohne 4-Augen-Hinweis.

## Empfohlene Phasen

- **Phase 1 (unterwegs):** 2 Mitglieder (ohne Exporte), 3 Passwort-Reset,
  Gruppen-Status, 4 Antraege komplett, 5 alle Anlaesse inkl. Vorschlaege,
  anlegen, loeschen, Organisator zuweisen, 7 App-Push, 11 Zahlungen
  bezahlt/offen/Referenz + Kennzahlen, 13 Audit + Push bei Ereignissen.
- **Phase 2 (gelegentlich):** 7 Nachricht einfach (Vorlage, Empfaenger
  richtig, Vorschau, Massen-PDF), Versandverlauf, 8 Pingen, 10 Mailcow,
  11 Jahreseinstellungen, Beitraege erzeugen, Briefe senden, Erinnerungen,
  12 Geplante Auftraege, 3 App-QR Mitglied, Datenblatt, Anmeldebon.
- **Phase 3 (Schreibtisch):** 7 Vorlagen-Editor, 9 PDF-Designer (Link),
  Brief-/Beitragsvorschau ins Backend, 10 Posteingang IMAP und
  Adressbuch, 14 Excel-Export (Backend), CSV, Telefonliste.
- **Zu entscheiden:** Vaultwarden, Rechnungen/Transaktionen.
