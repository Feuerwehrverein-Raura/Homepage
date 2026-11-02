// Kiosk-Ausgang: Logo 3 s gedrueckt halten -> Code -> Einstellungen. Ein
// falscher Code schliesst einfach, ohne Hinweis (wie bisher).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class GeheimHalten extends StatefulWidget {
  const GeheimHalten({super.key, required this.code, required this.offen, required this.child});

  /// Der richtige Code (Einstellungen.code).
  final String Function() code;
  final VoidCallback offen;
  final Widget child;

  @override
  State<GeheimHalten> createState() => _GeheimHaltenState();
}

class _GeheimHaltenState extends State<GeheimHalten> {
  Timer? _halten;

  void _los() {
    _halten?.cancel();
    _halten = Timer(const Duration(seconds: 3), _fragen);
  }

  void _weg() => _halten?.cancel();

  Future<void> _fragen() async {
    final eingabe = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Code eingeben'),
        content: TextField(
          key: const Key('kiosk-code'),
          controller: eingabe,
          autofocus: true,
          obscureText: true,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(hintText: 'Code'),
          onSubmitted: (_) => Navigator.of(context).pop(true),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Abbrechen')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('OK')),
        ],
      ),
    );
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    if (ok == true && eingabe.text.trim() == widget.code()) widget.offen();
  }

  @override
  void dispose() {
    _halten?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Listener(
    onPointerDown: (_) => _los(),
    onPointerUp: (_) => _weg(),
    onPointerCancel: (_) => _weg(),
    child: widget.child,
  );
}

class Logo extends StatelessWidget {
  const Logo({super.key, this.groesse = 48});

  final double groesse;

  @override
  Widget build(BuildContext context) => ClipOval(
    // rund wie in der frueheren App - das Bild hat schwarze Ecken
    child: Image.asset(
      'assets/logo.png',
      width: groesse,
      height: groesse,
      fit: BoxFit.cover,
      errorBuilder: (_, _, _) => Icon(Icons.restaurant, size: groesse * 0.7),
    ),
  );
}
