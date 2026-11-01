// Musik auf dem Computer speichern (Desktop-App FWV Musik): Knopf neben
// Playlists und Interpreten, Reiter "Interpreten" und "Gespeichert". Nur da,
// wenn der MusikScreen eine MusikAblage bekommt - die Mitglieder-App zeigt
// davon nichts. Die Ablage selbst steht in ablage.dart.

import 'package:fwv_anlass/fwv_anlass.dart'
    show LadeAnsicht, fehlerText, meldung, mitSystemleiste, nachfragen;
import 'package:material_ui/material_ui.dart';

import 'ablage.dart';
import 'modelle.dart';
import 'player.dart';
import 'zugang.dart';

/// Speichern, Fortschritt, Entfernen - neben einer Playlist oder einem
/// Interpreten. Vor dem Speichern sagt eine Rueckfrage, wie viel Platz es
/// braucht und wie viel frei ist; reicht es nicht, geht es nicht los.
class SpeichernKnopf extends StatefulWidget {
  const SpeichernKnopf({
    super.key,
    required this.ablage,
    required this.id,
    required this.name,
    required this.titelHolen,
    required this.speichern,
    this.hinweis,
  });

  final MusikAblage ablage;

  /// Id der Sammlung (GespeicherteSammlung.playlistId/interpretId/alleId).
  final String id;
  final String name;

  /// Die Titel, die gespeichert wuerden (vom Server).
  final Future<List<MusikTitel>> Function() titelHolen;
  final Future<void> Function(List<MusikTitel> titel) speichern;

  /// Zusatz in der Rueckfrage.
  final String? hinweis;

  @override
  State<SpeichernKnopf> createState() => _SpeichernKnopfState();
}

class _SpeichernKnopfState extends State<SpeichernKnopf> {
  bool _bereitet = false;

  Future<void> _speichern() async {
    setState(() => _bereitet = true);
    try {
      final titel = await widget.titelHolen();
      final bedarf = await widget.ablage.platzbedarf(titel);
      if (!mounted) return;
      setState(() => _bereitet = false);
      final bytes = bedarf.bytes;
      final frei = bedarf.frei;
      final umfang = [
        bedarf.titel == 1 ? '1 Titel' : '${bedarf.titel} Titel',
        if (bytes != null) groesseText(bytes),
      ].join(' · ');
      final platz = frei == null
          ? 'Wie viel auf diesem ${widget.ablage.geraet} frei ist, lässt sich nicht feststellen.'
          : 'Frei auf diesem ${widget.ablage.geraet}: ${groesseText(frei)}.';
      if (!bedarf.reicht) {
        await showDialog<void>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Zu wenig Platz'),
            content: Text(
              '„${widget.name}“ braucht $umfang. $platz Es sollen mindestens '
              '${groesseText(Platzbedarf.reserve)} frei bleiben.',
            ),
            actions: [
              TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('OK')),
            ],
          ),
        );
        return;
      }
      final ja = await nachfragen(
        context,
        titel: '„${widget.name}“ speichern?',
        text: [
          bedarf.titel == 0
              ? 'Alle Titel sind schon auf diesem ${widget.ablage.geraet}.'
              : 'Braucht $umfang.',
          platz,
          ?widget.hinweis,
        ].join('\n\n'),
        ja: 'Speichern',
      );
      if (!ja) return;
      if (bedarf.titel > 0 && !await widget.ablage.darfLaden()) {
        if (!mounted) return;
        // Handy im Mobilfunk: nicht ungefragt das Datenvolumen aufbrauchen.
        final mobil = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Kein WLAN'),
            content: Text(
              'Jetzt über Mobilfunk laden ($umfang)? Sonst wird geladen, sobald du '
              'im WLAN bist und unter „Gespeichert“ abgleichst.',
            ),
            actions: [
              TextButton(
                key: const Key('im-wlan-laden'),
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('Im WLAN laden'),
              ),
              FilledButton(
                key: const Key('mobilfunk-laden'),
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text('Über Mobilfunk'),
              ),
            ],
          ),
        );
        if (mobil == null) return;
        widget.ablage.mobilfunk = mobil;
      }
      await widget.speichern(titel);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted && _bereitet) setState(() => _bereitet = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ablage = widget.ablage;
    return ListenableBuilder(
      listenable: ablage,
      builder: (context, _) {
        final s = ablage.sammlung(widget.id);
        if (s == null) {
          if (_bereitet) {
            return const Padding(
              padding: EdgeInsets.all(12),
              child: SizedBox.square(
                dimension: 22,
                child: CircularProgressIndicator(strokeWidth: 2.5),
              ),
            );
          }
          return IconButton(
            key: Key('speichern-${widget.id}'),
            tooltip: 'Auf diesem ${ablage.geraet} speichern',
            icon: const Icon(Icons.download_for_offline_outlined),
            onPressed: _speichern,
          );
        }
        final da = ablage.vorhanden(s);
        final fertig = da >= s.titel.length;
        return IconButton(
          key: Key('gespeichert-${widget.id}'),
          tooltip: fertig
              ? 'Gespeichert – vom ${ablage.geraet} entfernen'
              : '$da von ${s.titel.length} Titeln geladen – vom ${ablage.geraet} entfernen',
          icon: fertig
              ? const Icon(Icons.offline_pin)
              : SizedBox.square(
                  dimension: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    // Noch kein Titel fertig: drehen, damit man sieht, dass es laeuft.
                    value: da == 0 ? null : da / s.titel.length,
                  ),
                ),
          onPressed: () => entfernenNachfragen(context, ablage, s),
        );
      },
    );
  }
}

/// Knopf "die ganze Sammlung speichern".
Widget alleSpeichernKnopf(MusikAblage ablage) => SpeichernKnopf(
  ablage: ablage,
  id: GespeicherteSammlung.alleId,
  name: 'Alle Titel',
  hinweis: 'Das dauert eine Weile; Playlists und Interpreten werden zuerst geladen.',
  titelHolen: ablage.zugang.alleTitel,
  speichern: ablage.allesSpeichern,
);

Future<void> entfernenNachfragen(
  BuildContext context,
  MusikAblage ablage,
  GespeicherteSammlung s,
) async {
  final ja = await nachfragen(
    context,
    titel: '„${s.name}“ vom ${ablage.geraet} entfernen?',
    text: 'Ohne Netz lässt sich das dann nicht mehr hören. Auf dem Server bleibt alles.',
    ja: 'Entfernen',
  );
  if (ja) await ablage.entfernen(s.id);
}

// ---------------------------------------------------------------------------
// Interpreten

/// Die Sammlung nach Interpret: hoeren und ganz speichern.
class InterpretenSeite extends StatefulWidget {
  const InterpretenSeite({
    super.key,
    required this.zugang,
    required this.player,
    required this.ablage,
  });

  final MusikZugang zugang;
  final MusikPlayer player;
  final MusikAblage ablage;

  @override
  State<InterpretenSeite> createState() => _InterpretenSeiteState();
}

class _InterpretenSeiteState extends State<InterpretenSeite> {
  String _suche = '';

  /// Interpret -> Titel, alphabetisch. Titel ohne Interpret fehlen.
  static List<(String, List<MusikTitel>)> _gruppieren(List<MusikTitel> alle) {
    final nach = <String, List<MusikTitel>>{};
    for (final t in alle) {
      final i = t.interpret;
      if (i != null && t.vorhanden) (nach[i] ??= []).add(t);
    }
    final liste = [for (final e in nach.entries) (e.key, e.value)];
    liste.sort((a, b) => a.$1.toLowerCase().compareTo(b.$1.toLowerCase()));
    return liste;
  }

  @override
  Widget build(BuildContext context) {
    return LadeAnsicht<List<(String, List<MusikTitel>)>>(
      laden: () async => _gruppieren(await widget.zugang.alleTitel()),
      istLeer: (l) => l.isEmpty,
      leer: 'Die Sammlung meldet keine Interpreten.',
      bauen: (context, liste, _) {
        final s = _suche.toLowerCase();
        final treffer = [
          for (final e in liste)
            if (s.isEmpty || e.$1.toLowerCase().contains(s)) e,
        ];
        return ListView(
          padding: mitSystemleiste(context, const EdgeInsets.only(bottom: 24)),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: TextField(
                key: const Key('interpret-suche'),
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search),
                  hintText: 'Interpret suchen',
                ),
                onChanged: (t) => setState(() => _suche = t.trim()),
              ),
            ),
            for (final (name, titel) in treffer)
              ListTile(
                leading: const Icon(Icons.person_outline),
                title: Text(name),
                subtitle: Text(titel.length == 1 ? '1 Titel' : '${titel.length} Titel'),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => _InterpretSeite(
                      name: name,
                      titel: titel,
                      player: widget.player,
                      ablage: widget.ablage,
                    ),
                  ),
                ),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      tooltip: 'Abspielen',
                      icon: const Icon(Icons.play_arrow),
                      onPressed: () =>
                          widget.player.spieleListe(name, titel).catchError((Object e) {
                            if (context.mounted) meldung(context, fehlerText(e));
                          }),
                    ),
                    SpeichernKnopf(
                      ablage: widget.ablage,
                      id: GespeicherteSammlung.interpretId(name),
                      name: name,
                      titelHolen: () async => titel,
                      speichern: (t) => widget.ablage.interpretSpeichern(name, t),
                    ),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

class _InterpretSeite extends StatelessWidget {
  const _InterpretSeite({
    required this.name,
    required this.titel,
    required this.player,
    required this.ablage,
  });

  final String name;
  final List<MusikTitel> titel;
  final MusikPlayer player;
  final MusikAblage ablage;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(name),
        actions: [
          IconButton(
            tooltip: 'Alle abspielen',
            icon: const Icon(Icons.playlist_play),
            onPressed: () => player.spieleListe(name, titel).catchError((Object e) {
              if (context.mounted) meldung(context, fehlerText(e));
            }),
          ),
          SpeichernKnopf(
            ablage: ablage,
            id: GespeicherteSammlung.interpretId(name),
            name: name,
            titelHolen: () async => titel,
            speichern: (t) => ablage.interpretSpeichern(name, t),
          ),
        ],
      ),
      bottomNavigationBar: MiniPlayer(player: player),
      body: ListView(
        padding: mitSystemleiste(context, const EdgeInsets.only(bottom: 24)),
        children: [
          for (final (i, t) in titel.indexed)
            ListTile(
              title: Text(t.titel ?? t.anzeige),
              onTap: () => player.spieleListe(name, titel, ab: i).catchError((Object e) {
                if (context.mounted) meldung(context, fehlerText(e));
              }),
              trailing: VorhoerKnopf(
                player: player,
                titel: t,
                beiFehler: (e) => meldung(context, fehlerText(e)),
              ),
            ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Gespeichert

/// Was auf diesem Computer liegt - spielt auch ohne Netz.
class GespeichertSeite extends StatelessWidget {
  const GespeichertSeite({super.key, required this.player, required this.ablage});

  final MusikPlayer player;
  final MusikAblage ablage;

  Future<void> _aktualisieren(BuildContext context) async {
    try {
      await ablage.aktualisieren();
    } on Object catch (e) {
      if (context.mounted) meldung(context, fehlerText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: ablage,
      builder: (context, _) {
        final text = Theme.of(context).textTheme;
        final liste = ablage.sammlungen;
        return ListView(
          padding: mitSystemleiste(context, const EdgeInsets.only(bottom: 24)),
          children: [
            ListTile(
              title: Text(
                ablage.anzahlTitel == 1 ? '1 Titel' : '${ablage.anzahlTitel} Titel',
                style: text.titleSmall,
              ),
              subtitle: Text(
                ablage.laedtHerunter
                    ? _laedtText()
                    : [
                        '${groesseText(ablage.belegt)} auf diesem ${ablage.geraet}',
                        ?ablage.fehler,
                        if (ablage.frei case final f?) '${groesseText(f)} frei',
                      ].join(' · '),
              ),
              trailing: ablage.laedtHerunter
                  ? const SizedBox.square(
                      dimension: 24,
                      child: CircularProgressIndicator(strokeWidth: 2.5),
                    )
                  : IconButton(
                      key: const Key('ablage-aktualisieren'),
                      tooltip: 'Mit dem Server abgleichen',
                      icon: const Icon(Icons.sync),
                      onPressed: liste.isEmpty ? null : () => _aktualisieren(context),
                    ),
            ),
            if (ablage.laedtHerunter) const LinearProgressIndicator(),
            if (ablage.ganzeSammlung && ablage.sammlung(GespeicherteSammlung.alleId) == null)
              ListTile(
                leading: const Icon(Icons.library_music),
                title: const Text('Alles speichern'),
                subtitle: const Text('Die ganze Sammlung, für unterwegs ohne Netz'),
                trailing: alleSpeichernKnopf(ablage),
              ),
            const Divider(height: 1),
            if (liste.isEmpty)
              Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'Noch nichts gespeichert. Bei einer Playlist oder einem Interpreten '
                  '„Auf diesem ${ablage.geraet} speichern“ wählen – dann läuft die Musik auch ohne Netz.',
                  textAlign: TextAlign.center,
                ),
              ),
            for (final s in liste)
              ListTile(
                leading: Icon(
                  s.alle
                      ? Icons.library_music
                      : s.interpret
                      ? Icons.person_outline
                      : Icons.queue_music,
                ),
                title: Text(s.name),
                subtitle: Text(_stand(s)),
                onTap: () => _abspielen(context, s),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      tooltip: 'Abspielen',
                      icon: const Icon(Icons.play_arrow),
                      onPressed: () => _abspielen(context, s),
                    ),
                    IconButton(
                      tooltip: 'Vom ${ablage.geraet} entfernen',
                      icon: const Icon(Icons.delete_outline),
                      onPressed: () => entfernenNachfragen(context, ablage, s),
                    ),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }

  /// "Lädt „Queen – Bohemian Rhapsody“ · 1,8 von 4,2 MB · noch 1150 Titel"
  String _laedtText() {
    final t = ablage.holtTitel;
    final gesamt = ablage.holtGesamt;
    return [
      t == null ? 'Lädt …' : 'Lädt „${t.anzeige}“',
      if (t != null)
        gesamt == null
            ? groesseText(ablage.holtBytes)
            : '${groesseText(ablage.holtBytes)} von ${groesseText(gesamt)}',
      'noch ${ablage.offen} Titel',
      '${groesseText(ablage.belegt)} auf diesem ${ablage.geraet}',
      if (ablage.frei case final f?) '${groesseText(f)} frei',
    ].join(' · ');
  }

  String _stand(GespeicherteSammlung s) {
    final da = ablage.vorhanden(s);
    final n = s.titel.length;
    final art = s.alle
        ? 'Ganze Sammlung'
        : s.interpret
        ? 'Interpret'
        : 'Playlist';
    return da >= n
        ? '$art · ${n == 1 ? '1 Titel' : '$n Titel'}'
        : '$art · $da von $n Titeln geladen';
  }

  Future<void> _abspielen(BuildContext context, GespeicherteSammlung s) async {
    try {
      // Die ganze Sammlung durcheinander, wie "Alle Titel" sonst auch.
      await player.spieleListe(s.name, s.titel, zufall: s.alle);
    } on Object catch (e) {
      if (context.mounted) meldung(context, fehlerText(e));
    }
  }
}
