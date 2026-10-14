// E-Mail im Vorstand-Bereich (docs/vorstand-funktionen.md, Abschnitt 10,
// Phase 2): Postfaecher und Aliase auf dem Mailcow-Server, Speicher, und die
// Zustellliste der Mitglieder mit dem Abgleich des Alias mitglieder@.
// Posteingang (IMAP) und Adressbuch kommen mit Phase 3.
//
// Vorbild: vorstand.html (Reiter E-Mail), vorstand-android (mailcow/*).
// Backend: api-dispatch /mailcow/..., api-members /members/emails/...

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import 'email/aliase_teil.dart';
import 'email/postfaecher_teil.dart';
import 'email/speicher_teil.dart';
import 'email/zustellliste_teil.dart';

/// Die Teile der E-Mail-Ansicht.
enum EmailTeil {
  postfaecher('Postfächer', Icons.inbox_outlined),
  aliase('Aliase', Icons.alternate_email),
  speicher('Speicher', Icons.storage_outlined),
  zustellliste('Zustellliste', Icons.forward_to_inbox_outlined);

  const EmailTeil(this.titel, this.symbol);

  final String titel;
  final IconData symbol;
}

class EmailAnsicht extends StatefulWidget {
  const EmailAnsicht({super.key, required this.dienste});

  final VorstandDienste dienste;

  @override
  State<EmailAnsicht> createState() => _EmailAnsichtState();
}

class _EmailAnsichtState extends State<EmailAnsicht> {
  var _teil = EmailTeil.postfaecher;

  @override
  Widget build(BuildContext context) {
    final d = widget.dienste;
    final rand = mitSystemleiste(context, const EdgeInsets.fromLTRB(12, 8, 12, 8));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Auswahl als Chips: wischen bleibt den Reitern des Vorstands.
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: rand.copyWith(bottom: 8),
          child: Row(
            children: [
              for (final t in EmailTeil.values)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    key: Key('email-teil-${t.name}'),
                    avatar: Icon(t.symbol, size: 18),
                    label: Text(t.titel),
                    selected: _teil == t,
                    showCheckmark: false,
                    onSelected: (_) => setState(() => _teil = t),
                  ),
                ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: switch (_teil) {
            EmailTeil.postfaecher => PostfaecherTeil(dienst: d.mailcow),
            EmailTeil.aliase => AliaseTeil(dienst: d.mailcow),
            EmailTeil.speicher => SpeicherTeil(dienst: d.mailcow),
            EmailTeil.zustellliste => ZustelllisteTeil(dienst: d.mailcow),
          },
        ),
      ],
    );
  }
}
