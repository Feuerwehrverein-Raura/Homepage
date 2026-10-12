// "Meine Anmeldungen" (`GET registrations/mine`), erreichbar aus dem Profil.
// Status-Text, Farbe, Anlass-Datum und Schicht-Beschriftung kommen fertig
// vom Backend. Antippen oeffnet den Anlass.

import 'package:fwv_anlass/fwv_anlass.dart' show mitSystemleiste;
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import 'anlaesse_tab.dart';
import 'bausteine.dart';

class MeineAnmeldungenScreen extends StatelessWidget {
  const MeineAnmeldungenScreen({super.key, required this.dienste});

  final Dienste dienste;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Meine Anmeldungen')),
      body: LadeAnsicht<List<MeineAnmeldung>>(
        laden: dienste.anlaesse.meineAnmeldungen,
        istLeer: (l) => l.isEmpty,
        leer: 'Du hast dich noch für keinen Anlass angemeldet.',
        bauen: (context, liste, neuLaden) => ListView.builder(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(12, 8, 12, 16)),
          itemCount: liste.length,
          itemBuilder: (context, i) => _AnmeldungKarte(
            anmeldung: liste[i],
            oeffnen: liste[i].anlassId.isEmpty
                ? null
                : () async {
                    await anlassOeffnen(context, dienste, liste[i].anlassId);
                    await neuLaden();
                  },
          ),
        ),
      ),
    );
  }
}

class _AnmeldungKarte extends StatelessWidget {
  const _AnmeldungKarte({required this.anmeldung, required this.oeffnen});

  final MeineAnmeldung anmeldung;
  final VoidCallback? oeffnen;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final r = anmeldung;
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 6),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: oeffnen,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: Text(r.anlassTitel, style: t.textTheme.titleMedium)),
                  if (r.statusText != null) ...[
                    const SizedBox(width: 8),
                    HinweisChip(r.statusText!, art: hinweisArtFuer(r.statusFarbe)),
                  ],
                ],
              ),
              if (r.anlassDatumText != null) ...[
                const SizedBox(height: 4),
                Text(r.anlassDatumText!, style: t.textTheme.bodyMedium),
              ],
              if (r.anlassOrt != null) Text(r.anlassOrt!, style: t.textTheme.bodySmall),
              for (final s in r.schichten)
                if (s.beschriftung != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.schedule, size: 16, color: t.colorScheme.outline),
                        const SizedBox(width: 6),
                        Expanded(child: Text(s.beschriftung!, style: t.textTheme.bodySmall)),
                      ],
                    ),
                  ),
            ],
          ),
        ),
      ),
    );
  }
}
