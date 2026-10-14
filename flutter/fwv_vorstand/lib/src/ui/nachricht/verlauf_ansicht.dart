// Versandverlauf (docs/vorstand-funktionen.md, Abschnitt 7): GET
// dispatch-log, Filter nach Typ, Tippen zeigt die Einzelheiten. Neueste
// zuerst, hoechstens 100 (wie Website und Desktop).

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../../audit/audit_eintrag.dart' show zeitText;
import '../../dienste.dart';
import '../../versand/versand_dienst.dart';

class VerlaufAnsicht extends StatefulWidget {
  const VerlaufAnsicht({super.key, required this.dienste});

  final VorstandDienste dienste;

  @override
  State<VerlaufAnsicht> createState() => _VerlaufAnsichtState();
}

class _VerlaufAnsichtState extends State<VerlaufAnsicht> {
  String? _typ;

  /// Neuer Schluessel je Filter: die Liste laedt dann frisch.
  var _laden = GlobalKey<LadeAnsichtState<List<VersandEintrag>>>();

  void _filtern(String? typ) {
    if (typ == _typ) return;
    setState(() {
      _typ = typ;
      _laden = GlobalKey();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: mitSystemleiste(
            context,
            const EdgeInsets.fromLTRB(12, 8, 4, 4),
          ).copyWith(bottom: 4),
          child: Row(
            children: [
              Expanded(
                child: Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    for (final (typ, text) in versandTypen)
                      ChoiceChip(
                        key: Key('verlauf-typ-${typ ?? 'alle'}'),
                        label: Text(text),
                        selected: _typ == typ,
                        onSelected: (_) => _filtern(typ),
                      ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Neu laden',
                icon: const Icon(Icons.refresh),
                onPressed: () => _laden.currentState?.neuLaden(),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: LadeAnsicht<List<VersandEintrag>>(
            key: _laden,
            laden: () => widget.dienste.versand.verlauf(typ: _typ),
            istLeer: (l) => l.isEmpty,
            leer: 'Noch nichts versendet.',
            bauen: (context, liste, _) => ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: mitSystemleiste(context, const EdgeInsets.only(bottom: 24)),
              itemCount: liste.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) => VersandZeile(
                eintrag: liste[i],
                antippen: () => versandDetails(context, liste[i]),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

HinweisArt statusArt(String? status) => switch (status) {
  'sent' || 'delivered' => HinweisArt.gut,
  'failed' || 'error' || 'cancelled' || 'canceled' || 'action_required' => HinweisArt.schlecht,
  null => HinweisArt.neutral,
  _ => HinweisArt.warnung,
};

class VersandZeile extends StatelessWidget {
  const VersandZeile({super.key, required this.eintrag, this.antippen, this.aktion});

  final VersandEintrag eintrag;
  final VoidCallback? antippen;

  /// Statt des Status-Chips rechts (z.B. Status pruefen).
  final Widget? aktion;

  @override
  Widget build(BuildContext context) {
    final e = eintrag;
    final zeit = e.gesendet ?? e.erstellt;
    return ListTile(
      key: Key('versand-${e.id}'),
      onTap: antippen,
      leading: Icon(e.typ == 'email' ? Icons.mail_outline : Icons.local_post_office_outlined),
      title: Text(e.betreff ?? '(ohne Betreff)', maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text(
        [e.empfaenger, if (zeit != null) zeitText(zeit)].join(' · '),
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          HinweisChip(statusText(e.status), art: statusArt(e.status)),
          ?aktion,
        ],
      ),
    );
  }
}

Future<void> versandDetails(BuildContext context, VersandEintrag e) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (context) {
    final t = Theme.of(context);
    Widget zeile(String titel, String? wert) => wert == null || wert.isEmpty
        ? const SizedBox.shrink()
        : Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(titel, style: t.textTheme.labelSmall?.copyWith(color: t.colorScheme.outline)),
                SelectableText(wert),
              ],
            ),
          );
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      maxChildSize: 0.95,
      builder: (context, scroll) => ListView(
        controller: scroll,
        padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(20, 0, 20, 24)),
        children: [
          Text(e.betreff ?? '(ohne Betreff)', style: t.textTheme.titleLarge),
          const SizedBox(height: 8),
          zeile('Art', typText(e.typ)),
          zeile('Status', statusText(e.status)),
          zeile('Empfänger', e.empfaengerName),
          zeile('E-Mail', e.empfaengerEmail),
          zeile('Adresse', e.empfaengerAdresse),
          zeile('Anlass', e.anlass),
          zeile('Erstellt', e.erstellt == null ? null : zeitText(e.erstellt!)),
          zeile('Gesendet', e.gesendet == null ? null : zeitText(e.gesendet!)),
          zeile(e.typ == 'pingen' ? 'Pingen-ID' : 'Nachrichten-ID', e.externeId),
          zeile('Fehler', e.fehler),
          zeile('Text', e.text),
        ],
      ),
    );
  },
);
