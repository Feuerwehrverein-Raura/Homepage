-- Abschied fuer ausgetretene Mitglieder (E-Mail-Vorlage "Verabschiedung
-- Mitglied"; der Brief nimmt denselben Text, backend-members
-- sendFarewellMessage). Auf dem Server stand nur das Wort "Verabschiedung"
-- (aufgefallen bei den Briefmustern, 02.11.2026). {{anrede_du}} = "Liebe"
-- bzw. "Lieber" je nach Anrede im Mitgliederprofil.
UPDATE dispatch_templates
   SET subject = 'Schade, dass du gehst – alles Gute!',
       body = '{{anrede_du}} {{vorname}}

Schade, dass du uns verlässt – im Vorstand sind wir ehrlich traurig, dich als Mitglied des Feuerwehrvereins Raura Kaiseraugst ziehen zu lassen.

Seit dem {{eintrittsdatum}} warst du Teil unserer Vereinsfamilie. Für deine Treue, deine Unterstützung und die vielen gemeinsamen Stunden danken wir dir von Herzen.

Wir wünschen dir für die Zukunft alles Gute. Die Türen des Feuerwehrvereins Raura stehen dir jederzeit offen – sei es als Gast an unseren Anlässen oder falls du eines Tages zurückkehren möchtest.

Mit kameradschaftlichen Grüssen

Im Namen des Vorstandes
{{aktuar_name}}
Aktuar',
       variables = ARRAY['anrede_du', 'vorname', 'nachname', 'eintrittsdatum', 'aktuar_name']
 WHERE name = 'Verabschiedung Mitglied' AND type = 'email';
