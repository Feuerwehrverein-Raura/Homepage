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
| [x] | Liste mit Suche (Server) | ✓ | ✓ | ✓ | – | ✓ | GET /members?search= (M) |
| [x] | Statusfilter (Aktiv, Aufnahme pendent, Ehren, Testkonto) | ✓ | ✓ | ✓ | – | ✓ | GET /members?status= |
| [x] | Kennzahlen (Gesamt, Aktiv, pendent, Ehren) | ✓ | ½ | ✓ | – | ✓ | GET /members/stats/overview; A laedt, zeigt nicht |
| [x] | Detail ansehen | ✓ | ✓ | ✓ | – | ✓ | GET /members/:id |
| [x] | Anlegen | ✓ | ✓ | ✓ | – | ✓ | POST /members |
| [x] | Bearbeiten (alle Felder inkl. Adresszusatz, Versand-E-Mail, Zustellung, Geschlecht, FW-Zugehoerigkeit, Bemerkungen) | ✓ | ½ | ✓ | – | ✓ | PUT /members/:id; A fehlen 5 Felder |
| [x] | Funktionen zuweisen (Mehrfach, Revisor schliesst Vorstand aus) | ✓ | ½ | ✓ | – | ✓ | im PUT; Ausschluss nur im Browser geprueft |
| [x] | Eintrittsdatum automatisch bei «Feuerwehr Raurica» | ✓ | – | – | – | ✓ | **nur in W** (Client-Logik) |
| [x] | Loeschen (mit Rueckfrage; Aktuar+Kassier bestaetigen per Mail) | ✓ | ✓ | ✓ | – | ✓ | DELETE /members/:id |
| [x] | Profilfoto hochladen (Galerie) | ✓ | ✓ | ½ | – | ✓ | POST /members/:id/photo; D nur API |
| [x] | Profilfoto mit Kamera | – | ✓ | – | – | ✓ | **nur in A** |
| [x] | Profilfoto loeschen | ✓ | ✓ | ½ | – | ✓ | DELETE /members/:id/photo |
| [x] | Mitglied benachrichtigen (Push, optional E-Mail) | ✓ | ✓ | ✓ | – | ✓ | POST /push/to-members (E) |
| [x] | Anrufen/Mail/Karte aus dem Detail | – | – | – | – | ✓ | in keiner Variante – fuers Handy sinnvoll |
| [ ] | Telefonliste PDF | ✓ | – | ✓ | – | – | GET /members/pdf/telefonliste |
| [ ] | CSV-Export (alle, aktiv, Post, E-Mail) | ✓ | – | – | – | – | **nur in W** (Client) |
| [ ] | Mitgliederverzeichnis (Auswahl beim Eintragen) | – | – | – | ✓ | ✓ | GET /members/directory |

## 3. Zugaenge, Passwoerter, Gruppen

| | Funktion | W | A | D | O | F | API / Hinweis |
|---|---|---|---|---|---|---|---|
| [x] | Status Nextcloud-Admin / Vorstand-Gruppe / Social-Media-Gruppe | ✓ | ✓ | ✓ | – | ✓ | GET /members/:id/{nextcloud-admin,vorstand-group,social-media-group} |
| [x] | Gruppen nach Funktion abgleichen | ✓ | ✓ | – | – | ✓ | POST dieselben {enabled}; W automatisch nach Speichern |
| [ ] | Gruppen einzeln schalten | – | – | ✓ | – | – | **nur in D** |
| [x] | Gruppen verwalten (Lager, Roter Schopf, …) | – | – | – | – | ✓ | /vorstand/gruppen* (M) |
| [x] | Temporaeres Passwort (Reset) | ✓ | – | ✓ | – | ✓ | POST /members/:id/reset-password |
| [x] | Passwort setzen | ✓ | – | ✓ | – | ✓ | POST /members/:id/set-password |
| [x] | Login-Datenblatt drucken (QR + neues Passwort) | ✓ | – | – | – | ✓ | POST /members/:id/datenblatt; F: HTML teilen/drucken |
| [x] | Anmeldebon (Bondrucker Schopf, Einmal-Code) | ✓ | – | – | – | ✓ | POST /members/:id/anmeldebon |
| [ ] | App-QR Vorstand: Liste/erstellen/widerrufen | ✓ | – | ✓ | – | – | /auth/vorstand/app-tokens – entfaellt mit Phase 0? |
| [x] | App-QR Mitglied: Liste/erstellen/widerrufen/drucken | ✓ | – | ✓ | – | ✓ | /auth/member/app-tokens; F im Mitglied-Detail, drucken ueber Datenblatt |
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
| [x] | Alle Anlaesse (Vorstandssicht) | ✓ | ✓ | ✓ | – | ✓ | F: VorstandZugang, aktuelle + undatierte (organisator-uebersicht); Schalter «Vergangene anzeigen» = ?vergangene=true (letzte 24 Monate) |
| [x] | Vorschlaege: Liste, genehmigen, bearbeiten, ablehnen | ✓ | ✓ | ✓ | – | ✓ | GET /events/proposals, PUT/DELETE /events/:id |
| [x] | Anlass anlegen (Kategorie steuert Felder, Menue bei GV) | ✓ | ✓ | ✓ | – | ✓ | POST /events (+ /shifts) |
| [x] | Anlass bearbeiten | ✓ | ✓ | ✓ | ✓ | ✓ | PUT /events/:id bzw. …/as-organizer |
| [x] | «Termin noch offen» (datum_offen) | ✓ | – | – | – | ✓ | W und F |
| [x] | Anlass loeschen | ✓ | ½ | ✓ | – | ✓ | DELETE /events/:id |
| [x] | Organisator zuweisen (Mitglied) | ✓ | ✓ | ✓ | – | ✓ | organizer_id |
| [x] | Externer Organisator + Zugang erstellen | ✓ | ✓ | ✓ | – | ✓ | create_access → event-dashboard |
| [ ] | PDF-Aushang hochladen/entfernen | ✓ | ✓ | ✓ | ½ | ✓ | pdf_attachment; O: nur alt-Android; F: Dateiwaehler file_picker (umgebung.pdfWaehlen), max. 10 MB |
| [x] | Schichten anlegen/aendern/loeschen | ✓ | ✓ | ✓ | ✓ | ✓ | /shifts bzw. shifts-as-organizer |
| [x] | Springer-Schichten generieren | ✓ | – | ✓ | – | ✓ | Client-Logik (springerSchichten) |
| [ ] | Anmeldungen ansehen (nach Schicht, GV mit Menue/Allergien) | ✓ | ✓ | ✓ | ✓ | ✓ | |
| [ ] | Anmeldung bestaetigen / ablehnen | ✓ | ✓ | ✓ | ✓ | ✓ | /registrations/:id/approve|reject |
| [ ] | Anmeldung bearbeiten (inkl. Status) | ✓ | ✓ | ✓ | ½ | ✓ | PUT /registrations/:id |
| [ ] | Anmeldung loeschen | – | – | – | ✓ | ✓ | DELETE …/as-organizer |
| [ ] | Person eintragen (Mitglied/Gast, auch ohne Schicht) | ✓ | ✓ | ✓ | ✓ | ✓ | POST /registrations |
| [ ] | Andere Schicht vorschlagen | ✓ | ✓ | ✓ | ✓ | ✓ | …/suggest-alternative |
| [ ] | Angemeldete informieren | ✓ | ✓ | ✓ | ✓ | ✓ | POST /events/:id/notify-registrants |
| [ ] | Arbeitsplan ansehen / PDF | ✓ | ✓ | ✓ | ✓ | ✓ | /events/:id/arbeitsplan, /pdf/arbeitsplan |
| [x] | Arbeitsplan an Helfer senden | – | – | – | ✓ | ✓ | extern /events/my-event/send-arbeitsplan; Vorstand POST /events/:id/send-arbeitsplan |
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
| [x] | Versandart Auto/E-Mail/Post/PDF-Brief | ✓ | ½ | ✓ | – | ✓ | /email/bulk, /dispatch/send-post, /send-pdf-post, /dispatch/smart (D); F: Auto/E-Mail/Brief, PDF-Brief = Pingen-Massen-PDF |
| [x] | Empfaenger: alle / nach Status / nach Zustellart | ½ | ½ | ✓ | – | ✓ | W+A Statusfilter kaputt (Werte passen nicht); F echte Werte, «Alle» ohne Ausgetreten/Verstorben/Testkonto |
| [x] | Empfaenger einzeln auswaehlen | ½ | – | ✓ | – | ✓ | W Knopf ohne Funktion |
| [x] | Vorlage waehlen | ½ | ✓ | ✓ | – | ✓ | GET /templates; W nur eine fest eingebaute |
| [ ] | Rich-Text-Editor, Platzhalter | ✓ | ✓ | ✓ | – | ½ | F: Text mit Absaetzen + Platzhalter (ersetzt das Backend), kein Rich Text |
| [ ] | Event-Einladung / Helferaufruf mit Schichten | ✓ | – | ✓ | – | – | |
| [x] | Vorschau E-Mail / Brief-PDF mit Adresszonen | ✓ | ½ | ✓ | – | ✓ | POST /dispatch/preview-pdf?zones=1; F: POST /dispatch/brief {vorschau, zonen} |
| [ ] | Anhaenge mitsenden | ½ | – | – | – | – | W waehlbar, aber nie gesendet; F bietet keine an |
| [ ] | Entwuerfe | ½ | – | – | – | – | W nur localStorage |
| [ ] | Zeitgesteuert senden / «Geplant» | ½ | – | – | – | – | W Platzhalter |
| [x] | Versandverlauf mit Filter | ✓ | ✓ | ✓ | – | ✓ | GET /dispatch-log |
| [x] | App-Push an alle | ✓ | ✓ | ✓ | – | ✓ | POST /push/broadcast (E) |
| [ ] | Vorlagen anlegen/bearbeiten/loeschen | ½ | – | ✓ | – | – | /templates (D); W-Editor tot; **nur in D** nutzbar |
| [x] | Massen-PDF per Post an Auswahl (Kostenschaetzung, Staging) | ½ | ✓ | ✓ | – | ✓ | POST /pingen/send-bulk-pdf; F braucht umgebung.pdfWaehlen |

## 8. Pingen (Post)

| | Funktion | W | A | D | O | F | API / Hinweis |
|---|---|---|---|---|---|---|---|
| [x] | Konto/Guthaben (Live/Staging) | ½ | ✓ | ✓ | – | ✓ | GET /pingen/account |
| [x] | Statistik, Briefliste | ½ | ½ | ✓ | – | ✓ | GET /pingen/stats, /letters; W kaputt, A verwaist |
| [x] | Briefstatus pruefen / automatischer Abgleich | ½ | ½ | ✓ | – | ✓ | GET /pingen/letters/:id/status (mit external_id; D schickte die Protokoll-ID); F: Knopf «offene pruefen» |
| [ ] | Einzelbrief senden | ½ | – | ✓ | – | – | POST /pingen/send-manual |
| [ ] | Webhooks verwalten | ½ | – | ✓ | – | – | /pingen/webhooks* – **nur in D** nutzbar |

## 9. Vorlagen und PDF-Layout

| | Funktion | W | A | D | O | F | API / Hinweis |
|---|---|---|---|---|---|---|---|
| [ ] | PDF-Designer (pdfme, pdf.fwv-raura.ch) | ✓ | – | – | – | – | eigene App; **verlinken statt nachbauen**; braucht Token-Uebergabe (vorstand_token-Cookie) |
| [ ] | Brieflayouts (allgemein, Einladung, Deckblatt, Beitrag) | ✓ | ½ | ✓ | – | ½ | allgemein jetzt im Backend (nachricht-layout.js, POST /dispatch/brief, /email/bulk layout=standard); Einladung, Deckblatt, Beitrag noch im Client |

## 10. E-Mail: Mailcow, Posteingang, Adressbuch

| | Funktion | W | A | D | O | F | API / Hinweis |
|---|---|---|---|---|---|---|---|
| [x] | Postfaecher: Liste, anlegen, bearbeiten, loeschen | ✓ | ✓ | ½ | – | ✓ | /mailcow/mailboxes (D); D ohne Bearbeiten |
| [x] | Aliase: Liste, anlegen, bearbeiten, loeschen | ✓ | ✓ | ½ | – | ✓ | /mailcow/aliases |
| [x] | Speicherplatz | ✓ | ✓ | ✓ | – | ✓ | GET /mailcow/quota |
| [x] | Zustellliste, Adressen kopieren, Alias mitglieder@ abgleichen | ✓ | ✓ | ✓ | – | ✓ | /members/emails/zustellung, sync-alias |
| [ ] | Posteingang (IMAP): Ordner, lesen, Anhaenge, Flags, verschieben, loeschen, Suche | ✓ | – | ✓ | – | – | /imap/* (D); Suche **nur in D** |
| [ ] | Verfassen/Antworten/Weiterleiten mit Anhaengen, Entwurf | ✓ | – | ✓ | – | – | /imap/send, /imap/draft |
| [ ] | Geteiltes Adressbuch: Liste, anlegen, bearbeiten, loeschen, uebernehmen | ✓ | – | ✓ | – | ½ | /contacts (D); F nur Mitglieder-Adressbuch |

## 11. Beitraege und Buchhaltung

| | Funktion | W | A | D | O | F | API / Hinweis |
|---|---|---|---|---|---|---|---|
| [x] | Jahreseinstellungen (Betrag, GV-Datum, Faelligkeit) | ✓ | ✓ | ✓ | – | ✓ | /membership-fees/settings (A) |
| [x] | Beitraege erzeugen | ✓ | ✓ | ✓ | – | ✓ | POST …/payments/generate |
| [x] | Kennzahlen, Zahlungsliste, Suche, Filter | ✓ | ✓ | ✓ | – | ✓ | …/summary, …/payments |
| [x] | Bezahlt / offen / Referenz setzen | ✓ | ✓ | ✓ | – | ✓ | PATCH …/payments/:id/{pay,unpay,reference} |
| [x] | Beitragsbrief einzeln (E-Mail/Post) | ✓ | ✓ | ✓ | – | ✓ | POST …/payments/:id/send |
| [x] | Beitragsbriefe an alle (E-Mail/Post) | ✓ | ✓ | ✓ | – | ✓ | send-email-bulk / send-post-bulk; F nennt die Empfaengerzahl vorher |
| [ ] | Briefvorschau mit Swiss-QR, alle drucken | ✓ | – | – | – | – | **nur in W** (Client) → ins Backend |
| [ ] | Kassier waehlen (bei mehreren) | ✓ | – | – | – | – | **nur in W** |
| [x] | Zahlungserinnerungen (Push+Mail, 30-Tage-Takt) | ✓ | ✓ | ✓ | – | ✓ | POST …/send-reminders |
| [ ] | Rechnungen, Transaktionen, Konten | ½ | – | ½ | – | – | /invoices, /transactions (A) nur im Export; /transactions nicht geroutet |

## 12. Geplante Auftraege

| | Funktion | W | A | D | O | F | API / Hinweis |
|---|---|---|---|---|---|---|---|
| [x] | Beitragsversand planen | – | ✓ | ✓ | – | ✓ | POST /scheduled-jobs (D); F im Bereich Beitraege |
| [x] | Liste mit Status, stornieren | – | ✓ | ✓ | – | ✓ | GET/DELETE /scheduled-jobs |

## 13. Audit und Benachrichtigungen

| | Funktion | W | A | D | O | F | API / Hinweis |
|---|---|---|---|---|---|---|---|
| [ ] | Audit-Log mit Aktionsfilter | ✓ | ½ | ✓ | – | – | GET /audit (M); A ohne Filter |
| [x] | Benachrichtigung bei neuen Audit-Ereignissen (Antrag, Austritt, Löschung, Anmeldung) | – | ✓ | – | – | ✓ | Push vom Backend (M src/vorstand-melder.js), Kanal "Vorstand", abschaltbar |

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
- **Datenblatt** (POST /members/:id/datenblatt) nimmt den neuesten App-Token
  des Mitglieds **ohne** auf `revoked_at` zu achten - ein widerrufener QR
  kann so wieder auf Papier landen (und gilt dann trotzdem nicht). Fix im
  Backend: `AND revoked_at IS NULL`. Die Tabelle wird dort zudem mit anderen
  Spalten angelegt als in /auth/member/app-tokens (gen_random_uuid, ohne
  last_used_at/revoked_at) - wer zuerst laeuft, gewinnt.
- **Mailcow-Groessen**: GET liefert Bytes, POST/PUT erwarten MB. vorstand.html
  zeigt `quota` als MB an (falsch) und schreibt beim Bearbeiten Bytes als MB
  zurueck. A und F rechnen richtig.
- **Beitraege erzeugen** meldet jede Zeile als `created`, auch wenn sie schon
  bestand (ON CONFLICT DO NOTHING). F zaehlt vorher/nachher.
- **Massenversand** (send-email-bulk/-post-bulk) laeuft synchron Brief um
  Brief; bei vielen Empfaengern kann die Verbindung abbrechen, waehrend der
  Server weiter sendet. Besser: als geplanten Auftrag sofort ausfuehren und
  Status abfragen.

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
