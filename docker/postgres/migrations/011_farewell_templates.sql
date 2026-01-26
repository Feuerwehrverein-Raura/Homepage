-- Add farewell templates for member deletion

-- Farewell Email Template
INSERT INTO dispatch_templates (id, name, type, subject, body, variables) VALUES
(
    gen_random_uuid(),
    'Verabschiedung Mitglied',
    'email',
    'Alles Gute und auf Wiedersehen',
    'Liebe/r {{anrede}} {{vorname}} {{nachname}}

Mit diesem Schreiben möchten wir uns herzlich für deine Mitgliedschaft beim Feuerwehrverein Raura Kaiseraugst bedanken.

Du warst seit dem {{eintrittsdatum}} Teil unserer Vereinsfamilie und hast in dieser Zeit einen wertvollen Beitrag zu unserem Vereinsleben geleistet.

Wir wünschen dir für deine Zukunft alles Gute und hoffen, dass du die Zeit bei uns in guter Erinnerung behalten wirst.

Die Türen des Feuerwehrvereins Raura stehen dir immer offen – sei es als Gast bei unseren öffentlichen Veranstaltungen oder falls du irgendwann zurückkehren möchtest.

Vielen Dank für alles und alles Gute!

Mit kameradschaftlichen Grüssen

Im Namen des Vorstandes
{{aktuar_name}}
Aktuar

Feuerwehrverein Raura Kaiseraugst',
    ARRAY['anrede', 'vorname', 'nachname', 'eintrittsdatum', 'aktuar_name']
),
-- Farewell Letter Template (HTML for PDF/Pingen)
(
    gen_random_uuid(),
    'Verabschiedung Mitglied Brief',
    'post',
    'Alles Gute und auf Wiedersehen',
    '<html>
<head>
<style>
body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.6; }
.header { display: flex; justify-content: space-between; margin-bottom: 30px; }
.sender { font-size: 10pt; }
.logo { text-align: right; }
.address { margin: 40px 0 30px 0; }
.title { font-size: 16pt; font-weight: bold; margin: 30px 0 20px 0; }
.content { line-height: 1.8; }
.signature { margin-top: 40px; }
</style>
</head>
<body>
<div class="header">
  <div class="sender">
    Feuerwehrverein Raura Kaiseraugst<br>
    {{aktuar_name}}, Aktuar<br>
    {{aktuar_adresse}}<br>
    {{aktuar_plz}} {{aktuar_ort}}
  </div>
  <div class="logo">
    <img src="data:image/png;base64,{{logo_base64}}" width="80" alt="FWV Raura Logo">
  </div>
</div>

<div style="text-align: right; font-size: 10pt;">{{datum}}</div>

<div style="font-size: 9pt; border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 20px;">
Feuerwehrverein Raura Kaiseraugst
</div>

<div class="address">
{{empfaenger_anrede}} {{empfaenger_vorname}} {{empfaenger_nachname}}<br>
{{empfaenger_strasse}}<br>
{{empfaenger_plz}} {{empfaenger_ort}}
</div>

<div class="title">Alles Gute und auf Wiedersehen</div>

<div class="content">
<p>{{anrede_formal}} {{nachname}}</p>

<p>Mit diesem Schreiben möchten wir uns herzlich für Ihre Mitgliedschaft beim Feuerwehrverein Raura Kaiseraugst bedanken.</p>

<p>Sie waren seit dem <b>{{eintrittsdatum}}</b> Teil unserer Vereinsfamilie und haben in dieser Zeit einen wertvollen Beitrag zu unserem Vereinsleben geleistet.</p>

<p>Wir wünschen Ihnen für Ihre Zukunft alles Gute und hoffen, dass Sie die Zeit bei uns in guter Erinnerung behalten werden.</p>

<p>Die Türen des Feuerwehrvereins Raura stehen Ihnen immer offen – sei es als Gast bei unseren öffentlichen Veranstaltungen oder falls Sie irgendwann zurückkehren möchten.</p>

<p>Vielen Dank für alles und alles Gute!</p>

<div class="signature">
<p>Mit kameradschaftlichen Grüssen</p>
<p><b>Im Namen des Vorstandes</b><br>
{{aktuar_name}}<br>
Aktuar</p>
<p style="margin-top: 20px; font-size: 10pt; color: #666;">
Feuerwehrverein Raura Kaiseraugst
</p>
</div>
</div>

</body>
</html>',
    ARRAY['anrede', 'vorname', 'nachname', 'anrede_formal', 'eintrittsdatum', 'aktuar_name', 'aktuar_adresse', 'aktuar_plz', 'aktuar_ort', 'datum', 'empfaenger_anrede', 'empfaenger_vorname', 'empfaenger_nachname', 'empfaenger_strasse', 'empfaenger_plz', 'empfaenger_ort', 'logo_base64']
)
ON CONFLICT (id) DO NOTHING;
