// Audit-Log im Vorstand-Bereich (docs/vorstand-funktionen.md, Abschnitt 13):
// neueste Eintraege zuerst, Filter nach Aktion, Suche nach Benutzer (E-Mail),
// "Mehr laden". Jeder Eintrag laesst sich aufklappen und zeigt seine Daten.
//
// Hinweis: Jeder Abruf ohne `since` schreibt im Backend selbst einen Eintrag
// AUDIT_VIEW - auch Filtern und Weiterblaettern.

import 'dart:async';

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../audit/audit_eintrag.dart';
import '../dienste.dart';

/// Eintraege pro Abruf.
const auditSeite = 50;

class AuditAnsicht extends StatefulWidget {
  const AuditAnsicht({super.key, required this.dienste, this.seite = auditSeite});

  final VorstandDienste dienste;
  final int seite;

  @override
  State<AuditAnsicht> createState() => _AuditAnsichtState();
}

class _AuditAnsichtState extends State<AuditAnsicht> {
  final _suche = TextEditingController();
  Timer? _verzoegerung;

  String? _aktion;
  String _email = '';

  final _eintraege = <AuditEintrag>[];
  bool _laedt = true;
  bool _laedtMehr = false;
  bool _ende = false;
  Object? _fehler;

  /// Zaehlt die Abrufe, damit eine alte Antwort keine neuere ueberschreibt.
  int _abruf = 0;

  @override
  void initState() {
    super.initState();
    _neuLaden();
  }

  @override
  void dispose() {
    _verzoegerung?.cancel();
    _suche.dispose();
    super.dispose();
  }

  Future<void> _neuLaden() async {
    final nr = ++_abruf;
    setState(() {
      _laedt = _eintraege.isEmpty;
      _fehler = null;
    });
    try {
      final neu = await widget.dienste.audit.liste(
        aktion: _aktion,
        email: _email,
        anzahl: widget.seite,
      );
      if (!mounted || nr != _abruf) return;
      setState(() {
        _eintraege
          ..clear()
          ..addAll(neu);
        _ende = neu.length < widget.seite;
        _laedt = false;
      });
    } on Object catch (f) {
      if (!mounted || nr != _abruf) return;
      setState(() {
        _laedt = false;
        _fehler = f;
      });
      if (_eintraege.isNotEmpty) meldung(context, fehlerText(f));
    }
  }

  Future<void> _mehrLaden() async {
    final nr = _abruf;
    setState(() => _laedtMehr = true);
    try {
      final neu = await widget.dienste.audit.liste(
        aktion: _aktion,
        email: _email,
        anzahl: widget.seite,
        ab: _eintraege.length,
      );
      if (!mounted || nr != _abruf) return;
      setState(() {
        final da = {for (final e in _eintraege) e.id};
        _eintraege.addAll(neu.where((e) => !da.contains(e.id)));
        _ende = neu.length < widget.seite;
      });
    } on Object catch (f) {
      if (mounted) meldung(context, fehlerText(f));
    } finally {
      if (mounted) setState(() => _laedtMehr = false);
    }
  }

  void _filtern(String? aktion) {
    if (aktion == _aktion) return;
    _aktion = aktion;
    _eintraege.clear();
    _neuLaden();
  }

  void _suchen(String text, {bool sofort = false}) {
    _verzoegerung?.cancel();
    void los() {
      if (text.trim() == _email) return;
      _email = text.trim();
      _eintraege.clear();
      _neuLaden();
    }

    if (sofort) {
      los();
    } else {
      _verzoegerung = Timer(const Duration(milliseconds: 500), los);
    }
  }

  Future<void> _aktionWaehlen() async {
    final gewaehlt = await showModalBottomSheet<_Wahl>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _AktionAuswahl(aktuell: _aktion),
    );
    if (gewaehlt != null) _filtern(gewaehlt.code);
  }

  @override
  Widget build(BuildContext context) {
    const breite = 960.0;
    final kopf = mitSystemleiste(
      context,
      const EdgeInsets.fromLTRB(12, 12, 12, 0),
      maxBreite: breite,
    ).copyWith(bottom: 4);
    final aktion = _aktion;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: kopf,
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: TextField(
                  key: const Key('audit-suche'),
                  controller: _suche,
                  textInputAction: TextInputAction.search,
                  keyboardType: TextInputType.emailAddress,
                  onChanged: (t) {
                    setState(() {}); // Knopf "Suche leeren" ein-/ausblenden
                    _suchen(t);
                  },
                  onSubmitted: (t) => _suchen(t, sofort: true),
                  decoration: InputDecoration(
                    isDense: true,
                    prefixIcon: const Icon(Icons.search),
                    hintText: 'Benutzer (E-Mail) suchen',
                    border: const OutlineInputBorder(),
                    suffixIcon: _suche.text.isEmpty
                        ? null
                        : IconButton(
                            tooltip: 'Suche leeren',
                            icon: const Icon(Icons.clear),
                            onPressed: () {
                              _suche.clear();
                              _suchen('', sofort: true);
                            },
                          ),
                  ),
                ),
              ),
              InputChip(
                key: const Key('audit-filter'),
                avatar: const Icon(Icons.filter_list, size: 18),
                label: Text(aktion == null ? 'Alle Aktionen' : auditAktion(aktion).text),
                selected: aktion != null,
                showCheckmark: false,
                onPressed: _aktionWaehlen,
                onDeleted: aktion == null ? null : () => _filtern(null),
                deleteButtonTooltipMessage: 'Filter entfernen',
              ),
            ],
          ),
        ),
        Expanded(child: _liste(breite)),
      ],
    );
  }

  Widget _liste(double breite) {
    if (_laedt) return const Center(child: CircularProgressIndicator());
    final Widget inhalt;
    if (_fehler != null && _eintraege.isEmpty) {
      inhalt = _vollflaechig(FehlerAnsicht(meldung: fehlerText(_fehler!), erneut: _neuLaden));
    } else if (_eintraege.isEmpty) {
      inhalt = _vollflaechig(
        Text(
          _aktion == null && _email.isEmpty
              ? 'Noch keine Einträge.'
              : 'Keine Einträge zu dieser Suche.',
          textAlign: TextAlign.center,
        ),
      );
    } else {
      inhalt = ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: mitSystemleiste(
          context,
          const EdgeInsets.fromLTRB(12, 4, 12, 24),
          maxBreite: breite,
        ),
        itemCount: _eintraege.length + 1,
        itemBuilder: (context, i) {
          if (i < _eintraege.length) {
            final e = _eintraege[i];
            return AuditKarte(key: ValueKey(e.id.isEmpty ? i : e.id), eintrag: e);
          }
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Center(
              child: _ende
                  ? Text(
                      '${_eintraege.length} Einträge',
                      style: Theme.of(context).textTheme.bodySmall,
                    )
                  : OutlinedButton.icon(
                      onPressed: _laedtMehr ? null : _mehrLaden,
                      icon: _laedtMehr
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.expand_more),
                      label: const Text('Mehr laden'),
                    ),
            ),
          );
        },
      );
    }
    return RefreshIndicator(onRefresh: _neuLaden, child: inhalt);
  }

  Widget _vollflaechig(Widget kind) => LayoutBuilder(
    builder: (context, b) => ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        ConstrainedBox(
          constraints: BoxConstraints(minHeight: b.maxHeight),
          child: Center(
            child: Padding(padding: const EdgeInsets.all(24), child: kind),
          ),
        ),
      ],
    ),
  );
}

/// Ergebnis der Auswahl; [code] null = alle Aktionen.
class _Wahl {
  const _Wahl(this.code);
  final String? code;
}

class _AktionAuswahl extends StatelessWidget {
  const _AktionAuswahl({required this.aktuell});

  final String? aktuell;

  @override
  Widget build(BuildContext context) {
    Widget eintrag(String? code, String text, {IconData? symbol}) => ListTile(
      dense: true,
      leading: Icon(symbol ?? Icons.all_inclusive),
      title: Text(text),
      selected: code == aktuell,
      trailing: code == aktuell ? const Icon(Icons.check) : null,
      onTap: () => Navigator.of(context).pop(_Wahl(code)),
    );
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.7,
      maxChildSize: 0.95,
      builder: (context, scroll) => ListView(
        controller: scroll,
        padding: EdgeInsets.only(bottom: 16 + MediaQuery.paddingOf(context).bottom),
        children: [
          eintrag(null, 'Alle Aktionen'),
          for (final g in AuditGruppe.values) ...[
            Abschnitt(g.titel),
            for (final a in auditAktionen)
              if (a.gruppe == g) eintrag(a.code, a.text, symbol: g.symbol),
          ],
        ],
      ),
    );
  }
}

/// Ein Eintrag: Aktion (farbig), Zeit, Benutzer, IP, Kurztext; aufgeklappt
/// die Aenderungen und die Rohdaten als JSON.
class AuditKarte extends StatelessWidget {
  const AuditKarte({super.key, required this.eintrag});

  final AuditEintrag eintrag;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final e = eintrag;
    final info = e.aktionInfo;
    final (hinten, vorne) = hinweisFarben(context, info.art);
    final leise = t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant);
    final wer = [?e.email, if (e.ip != null) 'IP ${e.ip}'].join(' · ');
    final aenderungen = e.aenderungen;
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        // Kein PageStorageKey: der Text darin (SelectableText) scrollt selbst und
        // laese sonst den gespeicherten Auf/Zu-Wert als Scroll-Position.
        key: ValueKey('audit-${e.id}'),
        shape: const Border(),
        collapsedShape: const Border(),
        tilePadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
        childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
        leading: CircleAvatar(
          radius: 18,
          backgroundColor: hinten,
          child: Icon(info.gruppe.symbol, size: 18, color: vorne),
        ),
        title: Wrap(
          spacing: 8,
          runSpacing: 2,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            HinweisChip(info.text, art: info.art),
            if (e.zeit != null) Text(zeitText(e.zeit!), style: leise),
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (e.kurztext != null) Text(e.kurztext!, maxLines: 2, overflow: TextOverflow.ellipsis),
            if (wer.isNotEmpty) Text(wer, style: leise, overflow: TextOverflow.ellipsis),
          ],
        ),
        children: [
          if (info.code != info.text) Text('Aktion: ${e.aktion}', style: leise),
          if (e.objektTyp != null || e.objektId != null)
            Text('Objekt: ${[?e.objektTyp, ?e.objektId].join(' ')}', style: leise),
          if (aenderungen.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Geändert', style: t.textTheme.titleSmall),
            for (final (feld, vorher, nachher) in aenderungen)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  '$feld: ${_kurz(vorher)} → ${_kurz(nachher)}',
                  style: t.textTheme.bodySmall,
                ),
              ),
          ],
          if (e.details != null) _JsonBlock(titel: 'Details', wert: e.details),
          if (e.vorher != null) _JsonBlock(titel: 'Vorher', wert: e.vorher),
          if (e.nachher != null)
            _JsonBlock(titel: e.vorher == null ? 'Werte' : 'Nachher', wert: e.nachher),
        ],
      ),
    );
  }
}

String _kurz(Object? w) => switch (w) {
  null => '–',
  String s when s.isEmpty => '«»',
  String s => s,
  _ => schoenesJson(w).replaceAll('\n', ' '),
};

class _JsonBlock extends StatelessWidget {
  const _JsonBlock({required this.titel, required this.wert});

  final String titel;
  final Object? wert;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(titel, style: t.textTheme.titleSmall),
          const SizedBox(height: 4),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: t.colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(8),
            ),
            child: SelectableText(
              schoenesJson(wert),
              style: t.textTheme.bodySmall?.copyWith(fontFamily: 'monospace'),
            ),
          ),
        ],
      ),
    );
  }
}
