/// Lager mit Oberflaeche: Artikel suchen, Barcode scannen, Ein-/Ausbuchen,
/// Lagerorte, Nachbestellen, Artikel anlegen. Gemeinsam fuer die
/// Mitglieder-App (Reiter "Lager") und die spaetere Vorstand-App — die
/// Verbindung zum Backend steckt nur im [LagerZugang]
/// (siehe lib/src/zugang.dart).
library;

export 'src/api_lager_zugang.dart';
export 'src/modelle.dart';
export 'src/ui/anlegen_screen.dart' show ArtikelAnlegenScreen, UnbekannterCodeScreen;
export 'src/ui/artikel_screen.dart' show ArtikelScreen, BestandChip, BuchenDialog, artikelOeffnen;
export 'src/ui/lager_screen.dart';
export 'src/ui/lagerort_screen.dart';
export 'src/ui/scanner_screen.dart';
export 'src/zugang.dart';
