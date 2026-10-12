// "Kalender abonnieren": alle Anlaesse als Abo in der Kalender-App des
// Telefons - wie calendar.html auf der Webseite. Der Feed ist oeffentlich
// (api-events, GET /calendar/ics) und aktualisiert sich in der Kalender-App
// von selbst; die App muss sich danach um nichts mehr kuemmern.
//
// webcal:// oeffnet auf dem iPhone direkt den Kalender. Auf Android kennt
// nicht jedes Telefon ein Programm dafuer - dann bleibt "Link kopieren" und
// in Google Kalender "Per URL hinzufuegen".

import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import '../gemeinsam.dart';

final Uri kalenderFeed = Uri.parse('https://api.fwv-raura.ch/calendar/ics');
final Uri kalenderAbo = kalenderFeed.replace(scheme: 'webcal');

Future<void> kalenderAboZeigen(BuildContext context, Dienste dienste) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    // Darf hoeher werden als die ueblichen 9/16 des Bildschirms und scrollt:
    // Auf 360 x 800 lief der Inhalt sonst unten ueber.
    isScrollControlled: true,
    builder: (blatt) => SafeArea(
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Kalender abonnieren', style: Theme.of(blatt).textTheme.titleLarge),
              const SizedBox(height: 8),
              const Text(
                'Alle Anlässe des Vereins erscheinen in deiner Kalender-App und '
                'bleiben von selbst aktuell.',
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.event_available_outlined),
                title: const Text('In der Kalender-App abonnieren'),
                onTap: () async {
                  Navigator.of(blatt).pop();
                  final geoeffnet = await dienste.linkOeffnen(kalenderAbo).catchError((_) => false);
                  if (!geoeffnet && context.mounted) {
                    await Clipboard.setData(ClipboardData(text: kalenderFeed.toString()));
                    if (context.mounted) {
                      meldung(
                        context,
                        'Keine Kalender-App öffnet das Abo direkt. Der Link ist kopiert – '
                        'in Google Kalender unter „Per URL hinzufügen“ einfügen.',
                      );
                    }
                  }
                },
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.link),
                title: const Text('Link kopieren'),
                subtitle: Text(kalenderFeed.toString()),
                onTap: () async {
                  await Clipboard.setData(ClipboardData(text: kalenderFeed.toString()));
                  if (blatt.mounted) Navigator.of(blatt).pop();
                  if (context.mounted) meldung(context, 'Link kopiert');
                },
              ),
              const SizedBox(height: 4),
              Text(
                dienste.plattform == Plattform.ios
                    ? 'Auf dem iPhone genügt „In der Kalender-App abonnieren“.'
                    : 'Google Kalender: im Browser calendar.google.com öffnen, '
                          '„Weitere Kalender“ → „Per URL“ und den Link einfügen.',
                style: Theme.of(blatt).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
