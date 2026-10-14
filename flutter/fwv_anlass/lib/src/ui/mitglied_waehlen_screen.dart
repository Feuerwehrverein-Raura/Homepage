// Mitglied aus dem Verzeichnis waehlen (`members/directory`) - fuer den
// Organisator eines Anlasses (nur Vorstand). Gibt das Mitglied zurueck.

import 'package:material_ui/material_ui.dart';

import '../bausteine.dart';
import '../daten.dart';
import '../zugang.dart';

class MitgliedWaehlenScreen extends StatefulWidget {
  const MitgliedWaehlenScreen({
    super.key,
    required this.verwaltung,
    this.titel = 'Organisator wählen',
  });

  final AnlassVerwaltung verwaltung;
  final String titel;

  @override
  State<MitgliedWaehlenScreen> createState() => _MitgliedWaehlenScreenState();
}

class _MitgliedWaehlenScreenState extends State<MitgliedWaehlenScreen> {
  late Future<List<VerzeichnisMitglied>> _liste = widget.verwaltung.zugang.mitgliederVerzeichnis();
  String _suche = '';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.titel)),
      body: FutureBuilder<List<VerzeichnisMitglied>>(
        future: _liste,
        builder: (context, v) {
          if (v.hasError) {
            return FehlerAnsicht(
              meldung: fehlerText(v.error!),
              erneut: () =>
                  setState(() => _liste = widget.verwaltung.zugang.mitgliederVerzeichnis()),
            );
          }
          if (!v.hasData) return const Center(child: CircularProgressIndicator());
          final s = _suche.trim().toLowerCase();
          final treffer = [
            for (final m in v.data!)
              if (s.isEmpty ||
                  m.name.toLowerCase().contains(s) ||
                  (m.email?.toLowerCase().contains(s) ?? false))
                m,
          ];
          return ListView(
            padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 8, 16, 16)),
            children: [
              TextField(
                key: const Key('organisator-suche'),
                decoration: const InputDecoration(
                  labelText: 'Mitglied suchen',
                  prefixIcon: Icon(Icons.search),
                ),
                onChanged: (t) => setState(() => _suche = t),
              ),
              const SizedBox(height: 8),
              // Nur so viele wie noetig zeichnen; das Verzeichnis hat einige
              // hundert Eintraege.
              for (final m in treffer.take(s.isEmpty ? 30 : 60))
                ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                  title: Text(m.name),
                  subtitle: (m.funktion ?? m.email) == null ? null : Text((m.funktion ?? m.email)!),
                  onTap: () => Navigator.of(context).pop(m),
                ),
              if (treffer.isEmpty)
                const Padding(padding: EdgeInsets.all(8), child: Text('Niemand gefunden.')),
            ],
          );
        },
      ),
    );
  }
}
