// Nachricht im Vorstand-Bereich (docs/vorstand-funktionen.md, Abschnitt 7
// und 8): oben die Teile Verfassen (E-Mail/Brief) · Verlauf · Pingen ·
// App-Push, darunter der Teil. Ein Teil wird erst gebaut (und laedt), wenn
// man ihn das erste Mal oeffnet; danach bleibt er stehen (Entwurf, Auswahl).

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import 'nachricht/pingen_ansicht.dart';
import 'nachricht/push_ansicht.dart';
import 'nachricht/verfassen_ansicht.dart';
import 'nachricht/verlauf_ansicht.dart';

enum NachrichtTeil {
  verfassen('Verfassen'),
  verlauf('Verlauf'),
  pingen('Pingen'),
  push('App-Push');

  const NachrichtTeil(this.text);

  final String text;
}

class NachrichtAnsicht extends StatefulWidget {
  const NachrichtAnsicht({super.key, required this.dienste, this.start = NachrichtTeil.verfassen});

  final VorstandDienste dienste;

  /// Teil beim Oeffnen.
  final NachrichtTeil start;

  @override
  State<NachrichtAnsicht> createState() => _NachrichtAnsichtState();
}

class _NachrichtAnsichtState extends State<NachrichtAnsicht> with AutomaticKeepAliveClientMixin {
  late var _teil = widget.start;
  late final _besucht = {widget.start};

  @override
  bool get wantKeepAlive => true;

  Widget _bauen(NachrichtTeil t) => switch (t) {
    NachrichtTeil.verfassen => VerfassenAnsicht(dienste: widget.dienste),
    NachrichtTeil.verlauf => VerlaufAnsicht(dienste: widget.dienste),
    NachrichtTeil.pingen => PingenAnsicht(dienste: widget.dienste),
    NachrichtTeil.push => PushAnsicht(dienste: widget.dienste),
  };

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: mitSystemleiste(
            context,
            const EdgeInsets.fromLTRB(12, 10, 12, 8),
            maxBreite: 640,
          ).copyWith(bottom: 8),
          child: SegmentedButton<NachrichtTeil>(
            key: const Key('nachricht-teil'),
            showSelectedIcon: false,
            // Vier Teile muessen auf 360 Punkte passen.
            style: const ButtonStyle(
              visualDensity: VisualDensity.compact,
              padding: WidgetStatePropertyAll(EdgeInsets.symmetric(horizontal: 4)),
            ),
            segments: [
              for (final t in NachrichtTeil.values)
                ButtonSegment(
                  value: t,
                  label: Text(t.text, maxLines: 1, softWrap: false, overflow: TextOverflow.fade),
                ),
            ],
            selected: {_teil},
            onSelectionChanged: (s) => setState(() {
              _teil = s.first;
              _besucht.add(_teil);
            }),
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: IndexedStack(
            index: _teil.index,
            children: [
              for (final t in NachrichtTeil.values)
                _besucht.contains(t) ? _bauen(t) : const SizedBox.shrink(),
            ],
          ),
        ),
      ],
    );
  }
}
