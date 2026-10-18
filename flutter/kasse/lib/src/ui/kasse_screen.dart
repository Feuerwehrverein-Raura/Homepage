// Kassen-Bildschirm im Aufbau der Web-Kasse: Kopf mit Logo, Anlass, Ort
// (Schopf/Cloud) und laufender Uhr; Reiter Kasse | Tische; Bestellung oben
// (Tablet: rechts), Menue mit allen Kategorien darunter.
import 'dart:async';

import 'package:flutter/material.dart';

import '../kacheln.dart';
import '../kasse_api.dart';
import '../protokoll.dart';
import 'anmeldung.dart' show knopfRot;
import '../updater.dart';
import 'tische_screen.dart';
import 'zahlung.dart';

class KasseScreen extends StatefulWidget {
  const KasseScreen({super.key, required this.api, required this.abgemeldet});
  final KasseApi api;
  final VoidCallback abgemeldet;

  @override
  State<KasseScreen> createState() => _KasseScreenState();
}

class _KasseScreenState extends State<KasseScreen> {
  KasseApi get api => widget.api;
  List<Artikel> _artikel = [];
  List<String> _kategorien = [];
  Anlass? _anlass;
  String? _twintQr;
  final List<Position> _korb = [];
  bool _laedt = true;
  bool _sendet = false;
  String? _fehler;
  DateTime _jetzt = DateTime.now();
  final List<Timer> _takte = [];
  StreamSubscription<bool>? _ortAbo;
  StreamSubscription<int>? _pufferAbo;
  int _puffer = 0;
  // Nicht gedruckte Bons: bleibt stehen, bis jemand "Gesehen" tippt -
  // eine kurze Meldung ist im Betrieb weg, bevor sie jemand liest.
  String? _druckWarnung;
  // Tische (nur bei Service oder solange noch Tische offen sind)
  bool _tischModus = false;
  int? _tischNr;
  int _offeneTische = 0;
  // Updater (lib/src/updater.dart): Banner, wenn eine neuere Kasse bereitliegt
  NeueVersion? _update;
  String? _version;
  bool _updateLaeuft = false;
  bool get _tischeSichtbar =>
      (_anlass?.hatService ?? false) || _offeneTische > 0;

  @override
  void initState() {
    super.initState();
    _takte.add(
      Timer.periodic(
        const Duration(seconds: 1),
        (_) => setState(() => _jetzt = DateTime.now()),
      ),
    );
    _takte.add(
      Timer.periodic(const Duration(seconds: 20), (_) => api.ortPruefen()),
    );
    _takte.add(
      Timer.periodic(const Duration(minutes: 1), (_) => _nebendaten()),
    );
    _takte.add(
      Timer.periodic(const Duration(hours: 12), (_) => api.erneuern()),
    );
    _ortAbo = api.ortGeaendert.stream.listen((_) {
      _laden();
      api.pufferSenden();
    });
    _puffer = api.pufferOffen;
    _pufferAbo = api.pufferGeaendert.stream.listen(
      (n) => setState(() => _puffer = n),
    );
    _takte.add(
      Timer.periodic(const Duration(seconds: 15), (_) => api.pufferSenden()),
    );
    api.pufferSenden();
    api.ortPruefen().then((_) => _laden());
    api.erneuern();
    eigeneVersion().then((v) => mounted ? setState(() => _version = v) : null);
    _updateSuchen();
    _takte.add(
      Timer.periodic(const Duration(minutes: 30), (_) => _updateSuchen()),
    );
  }

  // Tischkarten am Bar-Drucker (backend src/tischkarten.ts), nur im Schopf
  Future<void> _tischkarten() async {
    final von = TextEditingController(text: '1');
    final bis = TextEditingController(text: '20');
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Tischkarten drucken'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Am Bar-Drucker je Tisch eine Karte mit grosser Nummer. Nur im Schopf-WLAN.'),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(controller: von, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'von')),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(controller: bis, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'bis')),
                ),
              ],
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Abbrechen')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Drucken')),
        ],
      ),
    );
    if (ok != true) return;
    final a = int.tryParse(von.text.trim());
    final b = int.tryParse(bis.text.trim()) ?? a;
    if (a == null || b == null) return _meldung('Bitte Tischnummern eingeben', fehler: true);
    try {
      final n = await api.tischkartenDrucken(a, b);
      protokoll('tischkarten', meldung: 'Tisch $a-$b', daten: {'gedruckt': n});
      _meldung('$n Tischkarten gedruckt');
    } on KasseFehler catch (e) {
      _meldung(e.meldung, fehler: true);
    }
  }

  Future<void> _updateSuchen({bool melden = false}) async {
    final u = await updatePruefen();
    if (!mounted) return;
    setState(() => _update = u);
    if (melden && u == null) {
      _meldung('Kassen-App ${_version ?? ''} ist aktuell');
    }
  }

  Future<void> _updateInstallieren() async {
    final u = _update;
    if (u == null || _updateLaeuft) return;
    if (_korb.isNotEmpty) {
      _meldung(
        'Erst die laufende Bestellung abschliessen, dann aktualisieren',
        fehler: true,
      );
      return;
    }
    if (!await darfInstallieren()) {
      if (!mounted) return;
      final ok = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Installieren erlauben'),
          content: const Text(
            'Damit sich die Kasse selbst aktualisieren kann, im nächsten Fenster '
            '«Aus dieser Quelle zulassen» einschalten und dann zurück in die Kasse.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(c, false),
              child: const Text('Abbrechen'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(c, true),
              child: const Text('Einstellungen öffnen'),
            ),
          ],
        ),
      );
      if (ok == true) await erlaubnisOeffnen();
      return;
    }
    setState(() => _updateLaeuft = true);
    try {
      protokoll('update_start', meldung: u.version);
      await installieren(u);
    } catch (e) {
      _meldung(
        'Update fehlgeschlagen: ${e.toString().replaceFirst('Exception: ', '')}',
        fehler: true,
      );
    } finally {
      if (mounted) setState(() => _updateLaeuft = false);
    }
  }

  @override
  void dispose() {
    for (final t in _takte) {
      t.cancel();
    }
    _ortAbo?.cancel();
    _pufferAbo?.cancel();
    _tischFeld.dispose();
    super.dispose();
  }

  Future<void> _laden() async {
    setState(() => _laedt = true);
    try {
      final artikel = await api.artikel();
      final einst = await api.einstellungen();
      final kats = kategorienSortieren(
        artikel.map((a) => a.kategorie),
        einst['kategorien_reihenfolge'],
      );
      setState(() {
        _artikel = artikel;
        _kategorien = kats;
        _fehler = null;
      });
      await _nebendaten();
    } on KasseFehler catch (e) {
      if (e.status == 401) return _abmelden();
      setState(() => _fehler = e.meldung);
    } finally {
      if (mounted) setState(() => _laedt = false);
    }
  }

  Future<void> _nebendaten() async {
    final a = await api.anlass();
    final q = await api.twintQrAdresse();
    var tische = _offeneTische;
    try {
      tische = (await api.offeneTische()).map((b) => b.tisch).toSet().length;
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _anlass = a;
      _twintQr = q;
      _offeneTische = tische;
      if (!(a?.hatService ?? false)) _tischModus = false;
    });
  }

  Future<void> _abmelden() async {
    await api.abmelden();
    widget.abgemeldet();
  }

  // ---- Warenkorb -----------------------------------------------------------
  void _hinzu(Artikel a) => setState(() {
    final da = _korb
        .where(
          (p) =>
              p.artikel.id == a.id && p.sonderPreis == null && p.notiz.isEmpty,
        )
        .firstOrNull;
    if (da != null) {
      da.menge++;
    } else {
      _korb.add(Position(a));
    }
  });

  double get _total => _korb.fold(0, (s, p) => s + p.summe);

  Future<void> _gruppeOeffnen(Kachel k) async {
    final a = await showModalBottomSheet<Artikel>(
      context: context,
      builder: (_) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                k.gruppe!,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            for (final v in k.varianten)
              ListTile(
                title: Text(
                  nameTeilen(v.name)?.variante ?? v.anzeige,
                  style: const TextStyle(fontSize: 18),
                ),
                trailing: Text(
                  'CHF ${v.preis.toStringAsFixed(2)}',
                  style: const TextStyle(fontSize: 16),
                ),
                onTap: () => Navigator.pop(context, v),
              ),
          ],
        ),
      ),
    );
    if (a != null) _hinzu(a);
  }

  // ---- Bezahlen ----------------------------------------------------------
  // Erst bezahlen, dann buchen: Bestellung und Bon entstehen erst, wenn die
  // Zahlung bestaetigt ist. Abbrechen (auch Zurueck-Taste) laesst nur den
  // Warenkorb stehen. Vorher wurde zuerst gebucht - abgebrochene Zahlungen
  // hinterliessen gedruckte, unbezahlte Bestellungen (Chilbi 2026, L-45/46).
  Future<void> _bezahlen(String art) async {
    if (_korb.isEmpty || _sendet) return;
    FocusManager.instance.primaryFocus?.unfocus();
    final zahlung = await zahlungAbfragen(
      context,
      bestellung: 0,
      betrag: _total,
      art: art,
      twintQr: _twintQr,
      titel: 'Bar-Verkauf',
    );
    if (zahlung == null || !mounted) {
      protokoll('zahlung_abgebrochen', daten: {'art': art, 'betrag': _total, 'positionen': _korb.length});
      return;
    }
    setState(() => _sendet = true);
    try {
      final korbVorher = List.of(_korb);
      final b = await api.bestellenOderPuffern(korbVorher);
      protokoll('bar_bestellung', bestellung: b.id, daten: {
        'zahlung': zahlung, 'betrag': b.total, 'positionen': korbVorher.map((p) => '${p.menge}x ${p.artikel.anzeige}').toList(),
      });
      if (!mounted) return;
      setState(_korb.clear);
      if (b.druckfehler.isNotEmpty) {
        protokoll('druckwarnung', bestellung: b.id, meldung: b.druckfehler.join(' · '));
        setState(
          () => _druckWarnung =
              'Bestellung ${bestellNr(b.id)}: ${b.druckfehler.join(' · ')}',
        );
      }
      if (!await api.bezahltOderPuffern(b.id, zahlung)) {
        protokoll('zahlung_abgelehnt', bestellung: b.id, daten: {'zahlung': zahlung});
        _meldung(
          'Bestellung ${bestellNr(b.id)} gebucht, Zahlung vom Server abgelehnt - bitte in der Web-Kasse prüfen.',
          fehler: true,
        );
        return;
      }
      if (mounted) {
        await showDialog<void>(
          context: context,
          builder: (_) => AlertDialog(
            icon: const Icon(
              Icons.check_circle,
              color: Color(0xFF16A34A),
              size: 64,
            ),
            title: Text('Bestellung ${bestellNr(b.id)}'),
            content: Text(
              'CHF ${b.total.toStringAsFixed(2)} · ${korbVorher.length} ${korbVorher.length == 1 ? 'Position' : 'Positionen'}',
              textAlign: TextAlign.center,
            ),
            actions: [
              FilledButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('OK'),
              ),
            ],
          ),
        );
      }
    } on KasseFehler catch (e) {
      protokoll('buchung_fehler', meldung: e.meldung, daten: {'status': e.status, 'art': zahlung});
      if (e.status == 401) return _abmelden();
      _meldung(
        'Nicht gebucht: ${e.meldung} – Warenkorb bleibt, Zahlung bitte zurückgeben oder nochmals buchen.',
        fehler: true,
      );
    } finally {
      if (mounted) setState(() => _sendet = false);
    }
  }

  Future<void> _anTischSenden() async {
    if (_korb.isEmpty || _sendet) return;
    final nr = _tischNr;
    if (nr == null || nr <= 0) {
      _meldung('Bitte zuerst die Tischnummer eingeben', fehler: true);
      return;
    }
    setState(() => _sendet = true);
    AngelegteBestellung b;
    try {
      b = await api.bestellen(List.of(_korb), tisch: nr);
      protokoll('tisch_bestellung', bestellung: b.id, daten: {
        'tisch': nr, 'betrag': b.total, 'positionen': _korb.map((p) => '${p.menge}x ${p.artikel.anzeige}').toList(),
      });
      setState(() {
        _korb.clear();
        _tischNr = null;
        _tischFeld.clear();
      });
      if (b.druckfehler.isNotEmpty) {
        setState(
          () => _druckWarnung =
              'Tisch $nr, ${bestellNr(b.id)}: ${b.druckfehler.join(' · ')}',
        );
      }
      _nebendaten();
    } on KasseFehler catch (e) {
      protokoll('tisch_fehler', meldung: e.meldung, daten: {'status': e.status, 'tisch': nr});
      if (e.status == 401) return _abmelden();
      _meldung(
        'Nicht gesendet: ${e.meldung} – Warenkorb bleibt.',
        fehler: true,
      );
      return;
    } finally {
      if (mounted) setState(() => _sendet = false);
    }
    if (!mounted) return;
    // Wie die Web-Kasse: gleich bezahlen oder Tisch offen lassen
    final art = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Tisch $nr', textAlign: TextAlign.center),
        content: Text(
          'CHF ${b.total.toStringAsFixed(2)}',
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 34,
            fontWeight: FontWeight.bold,
            color: Color(0xFF16A34A),
          ),
        ),
        actions: [
          for (final (wert, text, farbe) in [
            (
              'spaeter',
              '🪑 Später bezahlen (Tisch offen lassen)',
              const Color(0xFFEAB308),
            ),
            ('card', '💳 Karte', const Color(0xFF2563EB)),
            ('cash', '💵 Barzahlung', const Color(0xFF16A34A)),
            ('twint', 'TWINT', Colors.black),
          ])
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: SizedBox(
                width: double.infinity,
                height: 56,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: farbe,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  onPressed: () => Navigator.pop(c, wert),
                  child: Text(
                    text,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
    if (!mounted) return;
    protokoll('tisch_zahlfrage', bestellung: b.id, meldung: art ?? 'geschlossen');
    if (art == null || art == 'spaeter') {
      _meldung('An Tisch $nr gesendet (${bestellNr(b.id)}) – Bezahlung später');
      return;
    }
    final zahlung = await zahlungAbfragen(
      context,
      bestellung: b.id,
      betrag: b.total,
      art: art,
      twintQr: _twintQr,
      titel: 'Tisch $nr',
    );
    if (zahlung == null) {
      protokoll('zahlung_abgebrochen', bestellung: b.id, daten: {'art': art, 'tisch': nr});
      _meldung('Tisch $nr offen gelassen');
      return;
    }
    protokoll('tisch_sofort_bezahlt', bestellung: b.id, daten: {'zahlung': zahlung, 'betrag': b.total});
    if (!await api.bezahltOderPuffern(b.id, zahlung)) {
      protokoll('zahlung_abgelehnt', bestellung: b.id, daten: {'zahlung': zahlung});
      _meldung(
        'Zahlung vom Server abgelehnt - bitte bei den Tischen prüfen.',
        fehler: true,
      );
      return;
    }
    _meldung('Tisch $nr: CHF ${b.total.toStringAsFixed(2)} bezahlt');
    _nebendaten();
  }

  void _meldung(String text, {bool fehler = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(text),
        backgroundColor: fehler ? knopfRot : null,
        duration: Duration(seconds: fehler ? 8 : 3),
      ),
    );
  }

  // ---- Oberflaeche ---------------------------------------------------------
  // Aufbau wie die Web-Kasse (order.fwv-raura.ch), die sich an der Chilbi
  // bewaehrt hat: Reiter Kasse | Tische, Karte "Bestellung" (Bestellart,
  // Tischnummer, Positionen, Total, Bezahlen mit), darunter "Menue" mit allen
  // Kategorien untereinander. Ab 900 px Menue links, Bestellung rechts.
  static const _rot = Color(0xFFDC2626);
  static const _rotHell = Color(0xFFFEF2F2);
  int _reiter = 0;
  final _tischFeld = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final breit = MediaQuery.sizeOf(context).width >= 900;
    // Zurueck-Taste schliesst die Kasse nicht (Warenkorb ginge verloren);
    // im Reiter Tische fuehrt sie zurueck zur Kasse.
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (hatGepoppt, _) {
        if (!hatGepoppt && _reiter != 0) setState(() => _reiter = 0);
      },
      child: Scaffold(
        backgroundColor: const Color(0xFFF3F4F6),
        appBar: _kopf(),
        body: Column(
          children: [
            _reiterLeiste(),
            if (_update != null)
              Material(
                color: const Color(0xFF2563EB),
                child: InkWell(
                  onTap: _updateInstallieren,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        const Icon(Icons.system_update, color: Colors.white),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _updateLaeuft
                                ? 'Kassen-App ${_update!.version} wird geladen…'
                                : 'Neue Kassen-App ${_update!.version} – tippen zum Installieren',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                        ),
                        if (_updateLaeuft)
                          const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 3,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            if (_druckWarnung != null)
              Material(
                color: _rot,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
                  child: Row(
                    children: [
                      const Text('🖨️', style: TextStyle(fontSize: 22)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Bon nicht gedruckt – $_druckWarnung',
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      TextButton(
                        onPressed: () => setState(() => _druckWarnung = null),
                        child: const Text(
                          'Gesehen',
                          style: TextStyle(color: Colors.white),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            if (_puffer > 0)
              Material(
                color: const Color(0xFFF59E0B),
                child: InkWell(
                  onTap: api.pufferSenden,
                  child: Padding(
                    padding: const EdgeInsets.all(10),
                    child: Text(
                      '⏳ $_puffer ${_puffer == 1 ? 'Buchung wartet' : 'Buchungen warten'} auf Verbindung – weiter kassieren, wird nachgesendet (tippen: jetzt senden)',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ),
            Expanded(child: _inhalt(breit)),
          ],
        ),
      ),
    );
  }

  Widget _inhalt(bool breit) {
    if (_reiter == 1) {
      return TischeScreen(api: api, twintQr: _twintQr, eingebettet: true);
    }
    if (_laedt && _artikel.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_fehler != null && _artikel.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(_fehler!, textAlign: TextAlign.center),
        ),
      );
    }
    if (breit) {
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 2,
            child: ListView(
              padding: const EdgeInsets.all(12),
              children: [_menueKarte()],
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(0, 12, 12, 12),
              children: [_bestellKarte()],
            ),
          ),
        ],
      );
    }
    return ListView(
      padding: const EdgeInsets.all(8),
      children: [_bestellKarte(), const SizedBox(height: 12), _menueKarte()],
    );
  }

  Widget _reiterLeiste() => Container(
    color: _rot,
    padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
    child: Row(
      children: [
        _reiterKnopf(0, '🛒 Kasse'),
        if (_tischeSichtbar) ...[
          const SizedBox(width: 8),
          _reiterKnopf(
            1,
            '🪑 Tische${_offeneTische > 0 ? ' ($_offeneTische)' : ''}',
          ),
        ],
      ],
    ),
  );

  Widget _reiterKnopf(int nr, String text) {
    final aktiv = _reiter == nr;
    return Expanded(
      child: SizedBox(
        height: 48,
        child: FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: aktiv ? Colors.white : const Color(0xFFB91C1C),
            foregroundColor: aktiv ? _rot : Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
          onPressed: () {
            setState(() => _reiter = nr);
            _nebendaten();
          },
          child: Text(
            text,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
          ),
        ),
      ),
    );
  }

  PreferredSizeWidget _kopf() => AppBar(
    backgroundColor: _rot,
    foregroundColor: Colors.white,
    titleSpacing: 8,
    title: Row(
      children: [
        CircleAvatar(
          backgroundColor: Colors.white,
          radius: 18,
          child: Image.asset('assets/kasse-logo.png', height: 30),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Kasse',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              if (_anlass != null)
                Text(
                  _anlass!.titel,
                  style: const TextStyle(fontSize: 12),
                  overflow: TextOverflow.ellipsis,
                ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: api.lokal
                ? const Color(0xFF16A34A)
                : const Color(0xFF991B1B),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            api.lokal ? '📍 Schopf' : '☁️ Cloud',
            style: const TextStyle(fontSize: 12),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          '${_jetzt.hour.toString().padLeft(2, '0')}:${_jetzt.minute.toString().padLeft(2, '0')}:${_jetzt.second.toString().padLeft(2, '0')}',
          style: const TextStyle(
            fontWeight: FontWeight.bold,
            fontFeatures: [FontFeature.tabularFigures()],
          ),
        ),
      ],
    ),
    actions: [
      PopupMenuButton<String>(
        onSelected: (w) => switch (w) {
          'neu' => _laden(),
          'ab' => _abmelden(),
          'update' => _updateSuchen(melden: true),
          'karten' => _tischkarten(),
          _ => null,
        },
        itemBuilder: (_) => [
          const PopupMenuItem(value: 'neu', child: Text('Artikel neu laden')),
          const PopupMenuItem(value: 'karten', child: Text('Tischkarten drucken')),
          PopupMenuItem(
            value: 'update',
            child: Text(
              'Auf Update prüfen${_version != null ? ' (jetzt $_version)' : ''}',
            ),
          ),
          const PopupMenuItem(value: 'ab', child: Text('Abmelden')),
          PopupMenuItem(
            enabled: false,
            value: 'code',
            child: Text('Gerätecode ${api.geraetCode}'),
          ),
        ],
      ),
    ],
  );

  Widget _karte(List<Widget> kinder) => Container(
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(10),
      boxShadow: const [
        BoxShadow(
          color: Color(0x14000000),
          blurRadius: 4,
          offset: Offset(0, 1),
        ),
      ],
    ),
    padding: const EdgeInsets.all(14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: kinder,
    ),
  );

  // ---- Bestellung (Warenkorb) ----------------------------------------------
  Widget _bestellKarte() => _karte([
    const Text(
      'Bestellung',
      style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
    ),
    if (_tischeSichtbar) ...[
      const SizedBox(height: 12),
      const Text(
        'Bestellart',
        style: TextStyle(color: Colors.black54, fontWeight: FontWeight.w500),
      ),
      const SizedBox(height: 6),
      Row(
        children: [
          _artKnopf(false, '🍺 Bar'),
          const SizedBox(width: 8),
          _artKnopf(true, '🪑 Tisch'),
        ],
      ),
      if (_tischModus) ...[
        const SizedBox(height: 12),
        const Text(
          'Tischnummer',
          style: TextStyle(color: Colors.black54, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: _tischFeld,
          keyboardType: TextInputType.number,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
          textInputAction: TextInputAction.done,
          decoration: InputDecoration(
            hintText: 'Tisch…',
            hintStyle: const TextStyle(color: Colors.black26),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
          ),
          // Tipp ins Menue schliesst die Tastatur (sonst tippt man Ziffern statt Artikel)
          onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
          onChanged: (t) => setState(() => _tischNr = int.tryParse(t.trim())),
        ),
      ],
    ],
    const SizedBox(height: 8),
    if (_korb.isEmpty)
      const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Text(
          'Warenkorb ist leer',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.black45, fontSize: 16),
        ),
      )
    else
      for (final p in _korb) _positionZeile(p),
    const Divider(height: 20, thickness: 2),
    Row(
      children: [
        const Text(
          'Total:',
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
        ),
        const Spacer(),
        Text(
          'CHF ${_total.toStringAsFixed(2)}',
          style: const TextStyle(
            fontSize: 26,
            fontWeight: FontWeight.bold,
            color: Color(0xFF16A34A),
          ),
        ),
      ],
    ),
    const SizedBox(height: 12),
    if (_tischModus)
      SizedBox(
        height: 60,
        child: FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFF16A34A),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          onPressed: _korb.isEmpty || _sendet ? null : _anTischSenden,
          child: const Text(
            '✅ Bestellung senden',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
        ),
      )
    else ...[
      const Text(
        'Bezahlen mit:',
        style: TextStyle(color: Colors.black54, fontWeight: FontWeight.w500),
      ),
      const SizedBox(height: 6),
      Row(
        children: [
          _zahlKnopf('💵\nBar', const Color(0xFF16A34A), 'cash'),
          const SizedBox(width: 8),
          _zahlKnopf('TWINT', Colors.black, 'twint'),
          const SizedBox(width: 8),
          _zahlKnopf('💳\nKarte', const Color(0xFF2563EB), 'card'),
        ],
      ),
    ],
    if (_korb.isNotEmpty) ...[
      const SizedBox(height: 10),
      SizedBox(
        height: 48,
        child: FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFFFEE2E2),
            foregroundColor: knopfRot,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          onPressed: () => setState(_korb.clear),
          child: const Text(
            '🗑️ Warenkorb leeren',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
          ),
        ),
      ),
    ],
  ]);

  Widget _artKnopf(bool tisch, String text) {
    final aktiv = _tischModus == tisch;
    return Expanded(
      child: SizedBox(
        height: 52,
        child: FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: aktiv ? _rot : const Color(0xFFF3F4F6),
            foregroundColor: aktiv ? Colors.white : Colors.black87,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          onPressed: () => setState(() => _tischModus = tisch),
          child: Text(
            text,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
          ),
        ),
      ),
    );
  }

  Widget _positionZeile(Position p) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    p.artikel.anzeige,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    'CHF ${p.preis.toStringAsFixed(2)}',
                    style: const TextStyle(color: Colors.black54),
                  ),
                ],
              ),
            ),
            _mengeKnopf(
              '–',
              () => setState(() => p.menge > 1 ? p.menge-- : _korb.remove(p)),
            ),
            SizedBox(
              width: 40,
              child: Text(
                '${p.menge}',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            _mengeKnopf('+', () => setState(() => p.menge++)),
          ],
        ),
        const SizedBox(height: 6),
        TextFormField(
          key: ObjectKey(p),
          initialValue: p.notiz,
          decoration: InputDecoration(
            isDense: true,
            hintText: 'Notiz…',
            hintStyle: const TextStyle(color: Colors.black26),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
          ),
          onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
          onChanged: (t) => p.notiz = t.trim(),
        ),
      ],
    ),
  );

  Widget _mengeKnopf(String text, VoidCallback tap) => SizedBox(
    width: 48,
    height: 44,
    child: FilledButton(
      style: FilledButton.styleFrom(
        padding: EdgeInsets.zero,
        backgroundColor: const Color(0xFFE5E7EB),
        foregroundColor: Colors.black87,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
      onPressed: tap,
      child: Text(
        text,
        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
      ),
    ),
  );

  Widget _zahlKnopf(String text, Color farbe, String art) => Expanded(
    child: SizedBox(
      height: 72,
      child: FilledButton(
        style: FilledButton.styleFrom(
          backgroundColor: farbe,
          padding: const EdgeInsets.symmetric(horizontal: 4),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        onPressed: _korb.isEmpty || _sendet ? null : () => _bezahlen(art),
        child: Text(
          text,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            height: 1.2,
          ),
        ),
      ),
    ),
  );

  // ---- Menue ---------------------------------------------------------------
  Widget _menueKarte() => _karte([
    const Text(
      'Menü',
      style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
    ),
    for (final kat in _kategorien) ...[
      Padding(
        padding: const EdgeInsets.only(top: 16, bottom: 8),
        child: Text(
          kat,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: Colors.black54,
          ),
        ),
      ),
      GridView(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
          maxCrossAxisExtent: 240,
          mainAxisExtent: 104,
          crossAxisSpacing: 8,
          mainAxisSpacing: 8,
        ),
        children: [
          for (final k in kachelnBilden(
            _artikel.where((a) => a.kategorie == kat).toList(),
          ))
            _kachel(k),
        ],
      ),
    ],
  ]);

  Widget _kachel(Kachel k) {
    final imKorb = k.istGruppe
        ? _korb
              .where((p) => k.varianten.any((v) => v.id == p.artikel.id))
              .fold(0, (s, p) => s + p.menge)
        : _korb
              .where((p) => p.artikel.id == k.artikel!.id)
              .fold(0, (s, p) => s + p.menge);
    return Material(
      color: imKorb > 0 ? const Color(0xFFFEE2E2) : _rotHell,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: _rot, width: 2),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => k.istGruppe ? _gruppeOeffnen(k) : _hinzu(k.artikel!),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      k.titel,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        height: 1.15,
                      ),
                    ),
                  ),
                  if (imKorb > 0)
                    Container(
                      constraints: const BoxConstraints(minWidth: 30),
                      height: 30,
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: _rot,
                        borderRadius: BorderRadius.circular(15),
                      ),
                      child: Text(
                        '$imKorb',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                ],
              ),
              const Spacer(),
              Row(
                children: [
                  Text(
                    k.preisText,
                    style: const TextStyle(
                      color: Color(0xFFB91C1C),
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                  const Spacer(),
                  if (k.istGruppe)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        border: Border.all(color: _rot),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        '${k.varianten.length} ▸',
                        style: const TextStyle(
                          color: Color(0xFFB91C1C),
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
