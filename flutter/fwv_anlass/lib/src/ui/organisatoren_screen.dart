// Organisatoren eines Anlasses: der Haupt-Organisator (Kontaktperson in
// Mails, Arbeitsplan und Website; aendern kann ihn nur der Vorstand ueber
// "Anlass bearbeiten") und die Mitorganisatoren, die die Arbeit teilen und
// dieselben Rechte haben.
//
// Mitorganisatoren hinzufuegen und entfernen duerfen der Vorstand und der
// Haupt-Organisator ([AnlassRechte.organisatorenVerwalten], das Backend
// prueft es nochmals). Ein Mitorganisator ist ein Mitglied (verwaltet den
// Anlass in der App unter "Organisator") oder extern mit Name und E-Mail -
// er bekommt einen eigenen Login fuers Event-Dashboard per E-Mail.

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../bausteine.dart';
import '../daten.dart';
import '../zugang.dart';
import 'mitglied_waehlen_screen.dart';

class OrganisatorenScreen extends StatefulWidget {
  const OrganisatorenScreen({super.key, required this.verwaltung, required this.anlass});

  final AnlassVerwaltung verwaltung;
  final Anlass anlass;

  @override
  State<OrganisatorenScreen> createState() => _OrganisatorenScreenState();
}

class _OrganisatorenScreenState extends State<OrganisatorenScreen> {
  final _lader = GlobalKey<LadeAnsichtState<OrganisatorenListe>>();
  OrganisatorenListe? _liste;
  final _laeuft = <String>{};

  AnlassVerwaltungZugang get _z => widget.verwaltung.zugang;

  Future<OrganisatorenListe> _laden() async {
    final l = await _z.organisatoren(widget.anlass.id);
    if (mounted) setState(() => _liste = l);
    return l;
  }

  Future<void> _neu() async => _lader.currentState?.neuLaden();

  Future<void> _hinzufuegen() async {
    final art = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              key: const Key('mitorganisator-mitglied'),
              leading: const Icon(Icons.badge_outlined),
              title: const Text('Mitglied'),
              subtitle: const Text('Verwaltet den Anlass in der App'),
              onTap: () => Navigator.of(context).pop('mitglied'),
            ),
            ListTile(
              key: const Key('mitorganisator-extern'),
              leading: const Icon(Icons.person_outline),
              title: const Text('Extern (Name und E-Mail)'),
              subtitle: const Text('Bekommt einen eigenen Zugang per E-Mail'),
              onTap: () => Navigator.of(context).pop('extern'),
            ),
          ],
        ),
      ),
    );
    if (!mounted || art == null) return;
    NeuerMitorganisator? neu;
    String? name;
    if (art == 'mitglied') {
      final m = await Navigator.of(context).push<VerzeichnisMitglied>(
        MaterialPageRoute(
          builder: (_) =>
              MitgliedWaehlenScreen(verwaltung: widget.verwaltung, titel: 'Mitorganisator wählen'),
        ),
      );
      if (m != null && m.id.isNotEmpty) {
        neu = NeuerMitorganisator.mitglied(m.id);
        name = m.name;
      }
    } else {
      neu = await Navigator.of(context).push<NeuerMitorganisator>(
        MaterialPageRoute(builder: (_) => const ExternerMitorganisatorScreen()),
      );
      name = neu?.name.trim();
    }
    if (!mounted || neu == null) return;
    setState(() => _laeuft.add('neu'));
    try {
      final e = await _z.mitorganisatorHinzufuegen(widget.anlass.id, neu);
      if (!mounted) return;
      meldung(
        context,
        neu.istMitglied
            ? '${name ?? e.name} ist jetzt Mitorganisator'
            : '${name ?? e.name} ist jetzt Mitorganisator - Zugangsdaten an ${neu.email.trim()} gesendet',
      );
      await _neu();
    } on Object catch (f) {
      if (mounted) meldung(context, fehlerText(f));
    } finally {
      if (mounted) setState(() => _laeuft.remove('neu'));
    }
  }

  Future<void> _entfernen(OrganisatorEintrag e) async {
    final id = e.id;
    if (id == null) return;
    final ok = await nachfragen(
      context,
      titel: 'Mitorganisator entfernen?',
      text:
          '${e.name} kann «${widget.anlass.titel}» danach nicht mehr verwalten.'
          '${e.extern ? ' Der Zugang zum Event-Dashboard gilt ab sofort nicht mehr.' : ''}',
      ja: 'Entfernen',
    );
    if (!ok || !mounted) return;
    setState(() => _laeuft.add(id));
    try {
      await _z.mitorganisatorEntfernen(widget.anlass.id, id);
      if (mounted) meldung(context, '${e.name} entfernt');
      await _neu();
    } on Object catch (f) {
      if (mounted) meldung(context, fehlerText(f));
    } finally {
      if (mounted) setState(() => _laeuft.remove(id));
    }
  }

  Widget _eintrag(OrganisatorEintrag e, {required bool haupt, required bool verwalten}) {
    final t = Theme.of(context);
    final zeilen = [if (!haupt) e.artText, ?e.email];
    final id = e.id;
    return Card(
      key: Key(haupt ? 'hauptorganisator' : 'mitorganisator-${e.id}'),
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: ListTile(
        leading: Icon(
          haupt ? Icons.star_outline : (e.extern ? Icons.person_outline : Icons.badge_outlined),
          color: t.colorScheme.primary,
        ),
        title: Text(e.name),
        subtitle: zeilen.isEmpty ? null : Text(zeilen.join('\n')),
        isThreeLine: zeilen.length > 1,
        trailing: haupt || !verwalten || id == null
            ? null
            : _laeuft.contains(id)
            ? const SizedBox.square(dimension: 24, child: CircularProgressIndicator(strokeWidth: 2))
            : IconButton(
                key: Key('mitorganisator-entfernen-$id'),
                onPressed: () => _entfernen(e),
                icon: const Icon(Icons.person_remove_outlined),
                tooltip: 'Entfernen',
              ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final verwalten = _liste?.darfVerwalten ?? false;
    return Scaffold(
      appBar: AppBar(title: const Text('Organisatoren')),
      floatingActionButton: verwalten
          ? FloatingActionButton.extended(
              key: const Key('mitorganisator-neu'),
              heroTag: 'mitorganisator-neu',
              onPressed: _laeuft.contains('neu') ? null : _hinzufuegen,
              icon: const Icon(Icons.group_add_outlined),
              label: const Text('Mitorganisator hinzufügen'),
            )
          : null,
      body: LadeAnsicht<OrganisatorenListe>(
        key: _lader,
        laden: _laden,
        bauen: (context, l, neuLaden) => RefreshIndicator(
          onRefresh: neuLaden,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            // Unten Platz fuer den Knopf.
            padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(12, 0, 12, 96)),
            children: [
              const Abschnitt('Organisator'),
              if (l.hauptorganisator != null)
                _eintrag(l.hauptorganisator!, haupt: true, verwalten: false)
              else
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                  child: Text('Kein Organisator eingetragen.'),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 4, 4, 0),
                child: Text(
                  'Kontaktperson in Mails, Arbeitsplan und auf der Website. '
                  'Ändern kann ihn nur der Vorstand.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
              Abschnitt('Mitorganisatoren (${l.mitorganisatoren.length})'),
              if (l.mitorganisatoren.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                  child: Text(
                    'Noch keine Mitorganisatoren. Sie teilen die Arbeit und haben dieselben '
                    'Rechte: Anmeldungen, Schichten, Notizen, Material, Informieren und Anlass '
                    'bearbeiten.',
                  ),
                ),
              for (final e in l.mitorganisatoren) _eintrag(e, haupt: false, verwalten: verwalten),
            ],
          ),
        ),
      ),
    );
  }
}

/// Externer Mitorganisator: Name und E-Mail. Gibt [NeuerMitorganisator]
/// zurueck; das Backend erstellt den Login und schickt die Zugangsdaten.
class ExternerMitorganisatorScreen extends StatefulWidget {
  const ExternerMitorganisatorScreen({super.key});

  @override
  State<ExternerMitorganisatorScreen> createState() => _ExternerMitorganisatorScreenState();
}

class _ExternerMitorganisatorScreenState extends State<ExternerMitorganisatorScreen> {
  final _form = GlobalKey<FormState>();
  String _name = '';
  String _email = '';

  void _weiter() {
    if (!(_form.currentState?.validate() ?? false)) return;
    Navigator.of(context).pop(NeuerMitorganisator.extern(name: _name, email: _email));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Externer Mitorganisator')),
      bottomNavigationBar: UntenLeiste(
        kinder: [
          FilledButton(
            key: const Key('extern-hinzufuegen'),
            onPressed: _weiter,
            child: const Text('Hinzufügen'),
          ),
        ],
      ),
      body: Form(
        key: _form,
        child: ListView(
          padding: mitSystemleiste(context, const EdgeInsets.all(16)),
          children: [
            TextFormField(
              key: const Key('extern-name'),
              decoration: const InputDecoration(labelText: 'Name *'),
              textCapitalization: TextCapitalization.words,
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Bitte einen Namen angeben.' : null,
              onChanged: (v) => _name = v,
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const Key('extern-email'),
              decoration: const InputDecoration(labelText: 'E-Mail *'),
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              validator: (v) => NeuerMitorganisator.extern(name: 'x', email: v ?? '').gueltig
                  ? null
                  : 'Bitte eine gültige E-Mail angeben.',
              onChanged: (v) => _email = v,
              onFieldSubmitted: (_) => _weiter(),
            ),
            const SizedBox(height: 16),
            Text(
              'Die Person bekommt per E-Mail einen eigenen Zugang zum Event-Dashboard '
              '(E-Mail und Passwort), gültig bis drei Monate nach dem Anlass. Ist sie '
              'Mitglied, besser als Mitglied hinzufügen.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}
