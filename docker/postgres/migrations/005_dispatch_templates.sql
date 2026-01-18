-- Add default dispatch templates

INSERT INTO dispatch_templates (id, name, type, subject, body, variables) VALUES
(
    gen_random_uuid(),
    'Einladung Event',
    'email',
    'Einladung: {{event_titel}}',
    'Liebe Mitglieder

Der Vorstand möchte euch zu folgendem Event einladen:

Was: {{event_titel}}
Wo: {{event_ort}}
Wann: {{event_datum}}, {{event_zeit}}
{{event_beschreibung}}

{{anmeldung_info}}

Wir freuen uns über zahlreiches Erscheinen.
Im Namen des Vorstandes.

Mit freundlichen Grüssen

{{praesident_name}}
Präsident',
    ARRAY['event_titel', 'event_ort', 'event_datum', 'event_zeit', 'event_beschreibung', 'anmeldung_info', 'praesident_name']
),
(
    gen_random_uuid(),
    'Mitgliederbeitrag',
    'post',
    'Mitgliederbeitrag {{jahr}}',
    '<html>
<head>
<style>
body { font-family: Arial, sans-serif; font-size: 11pt; }
.header { display: flex; justify-content: space-between; margin-bottom: 30px; }
.sender { font-size: 10pt; }
.logo { text-align: right; }
.address { margin: 40px 0 30px 0; }
.title { font-size: 18pt; font-weight: bold; margin: 30px 0 20px 0; }
.content { line-height: 1.6; }
.footer { margin-top: 40px; }
</style>
</head>
<body>
<div class="header">
  <div class="sender">
    Feuerwehrverein Raura, {{kassier_name}}<br>
    {{kassier_adresse}}<br>
    {{kassier_plz}} {{kassier_ort}}<br><br>
    Tel: {{kassier_telefon}}<br>
    Email: kassier@fwv-raura.ch<br><br>
    Konto: {{verein_iban}}<br>
    Betrag: CHF {{beitrag}}
  </div>
  <div class="logo">
    <img src="data:image/png;base64,{{logo_base64}}" width="80" alt="FWV Raura Logo">
  </div>
</div>

<div style="text-align: right; font-size: 10pt;">{{datum}}</div>

<div style="font-size: 9pt; border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 20px;">
Feuerwehrverein Raura, {{kassier_name}}, {{kassier_plz}} {{kassier_ort}}
</div>

<div class="address">
{{empfaenger_name}}<br>
{{empfaenger_strasse}}<br>
{{empfaenger_plz}} {{empfaenger_ort}}
</div>

<div class="title">Mitgliederbeitrag</div>

<div class="content">
<p>Liebe Mitglieder</p>

<p>Der Mitgliedsbeitrag ist wie gewohnt um diese Jahreszeit fällig.</p>

<p>Die Generalversammlung vom {{gv_datum}} hat beschlossen, den Beitrag auf den bewährten <b>Fr. {{beitrag}}</b> pro Mitglied zu belassen.</p>

<p>Mir obliegt es nun Traditionsgemäss Euch um die Entrichtung dieses Beitrages anzugehen. Ich danke Euch herzlich für eine baldige Überweisung mit beiliegendem Einzahlungsschein.</p>

<p>
Referenz: {{qr_referenz}}<br>
Betrag: CHF {{beitrag}}
</p>

<div class="footer">
<p>Mit freundlichen Grüssen<br>
<b>Feuerwehrverein Raura, Kaiseraugst</b><br>
der Kassier</p>

<p>{{kassier_name}}</p>
</div>
</div>

</body>
</html>',
    ARRAY['kassier_name', 'kassier_adresse', 'kassier_plz', 'kassier_ort', 'kassier_telefon', 'verein_iban', 'beitrag', 'datum', 'empfaenger_name', 'empfaenger_strasse', 'empfaenger_plz', 'empfaenger_ort', 'gv_datum', 'qr_referenz', 'jahr', 'logo_base64']
),
(
    gen_random_uuid(),
    'Willkommen neues Mitglied',
    'email',
    'Herzlich Willkommen beim Feuerwehrverein Raura',
    'Liebe/r {{anrede}} {{vorname}} {{nachname}}

Herzlich willkommen beim Feuerwehrverein Raura Kaiseraugst!

Deine Mitgliedschaft wurde vom Vorstand genehmigt. Wir freuen uns sehr, dich als neues Mitglied in unserem Verein begrüssen zu dürfen.

Deine Mitgliedsdaten:
- Mitgliedsnummer: {{mitgliedsnummer}}
- Status: {{status}}
- Eintrittsdatum: {{eintrittsdatum}}

Als Mitglied hast du nun Zugang zu:
- Unserem Mitgliederbereich auf https://fwv-raura.ch/mein.html
- Anmeldung zu Veranstaltungen und Schichten
- Vereinsinformationen und Dokumenten

Deine Login-Daten für den Mitgliederbereich wurden separat per E-Mail verschickt.

Bei Fragen stehen dir der Vorstand und alle Mitglieder gerne zur Verfügung.

Mit kameradschaftlichen Grüssen

{{praesident_name}}
Präsident
Feuerwehrverein Raura Kaiseraugst',
    ARRAY['anrede', 'vorname', 'nachname', 'mitgliedsnummer', 'status', 'eintrittsdatum', 'praesident_name']
),
(
    gen_random_uuid(),
    'Datenänderung bestätigt',
    'email',
    'Deine Mitgliedsdaten wurden aktualisiert',
    'Liebe/r {{anrede}} {{vorname}} {{nachname}}

Deine Mitgliedsdaten wurden erfolgreich aktualisiert.

Geänderte Felder:
{{changed_fields}}

Falls du diese Änderung nicht vorgenommen hast, melde dich bitte umgehend beim Vorstand.

Mit freundlichen Grüssen

Feuerwehrverein Raura Kaiseraugst',
    ARRAY['anrede', 'vorname', 'nachname', 'changed_fields']
),
(
    gen_random_uuid(),
    'Registrierung abgelehnt',
    'email',
    'Deine Mitgliedschaftsanfrage',
    'Liebe/r {{vorname}} {{nachname}}

Vielen Dank für dein Interesse am Feuerwehrverein Raura Kaiseraugst.

Leider können wir deine Mitgliedschaftsanfrage aktuell nicht annehmen.

{{ablehnungsgrund}}

Bei Fragen kannst du dich gerne beim Vorstand melden.

Mit freundlichen Grüssen

{{praesident_name}}
Präsident
Feuerwehrverein Raura Kaiseraugst',
    ARRAY['vorname', 'nachname', 'ablehnungsgrund', 'praesident_name']
)
ON CONFLICT (id) DO NOTHING;
