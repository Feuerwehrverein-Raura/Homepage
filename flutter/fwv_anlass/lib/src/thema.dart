// Aussehen der Vereins-Apps: Farben und Theme wie die alte Android-App
// (members-android res/values/colors.xml und themes.xml,
// Theme.Material3.Light). Die alten Apps hatten keinen dunklen Modus — die
// neuen auch nicht: immer [fwvThema], themeMode hell.
//
// Wie im alten Theme sind alle "Container"-Farben weiss. Material 3 wuerde
// sie sonst aus dem Vereinsrot ableiten und Karten, Leisten und Knoepfe
// rosa toenen.

import 'package:flutter/services.dart' show SystemUiOverlayStyle;
import 'package:material_ui/material_ui.dart';

/// Die Farben der alten Apps (members-android colors.xml).
abstract final class FwvFarben {
  static const rot = Color(0xFFB91C1C); // primary
  static const rotDunkel = Color(0xFF991B1B); // primary_dark
  static const rotHell = Color(0xFFFCA5A5); // primary_light
  static const aufRot = Color(0xFFFFFFFF); // on_primary
  static const hintergrund = Color(0xFFFAFAFA); // background
  static const flaeche = Color(0xFFFFFFFF); // surface
  static const text = Color(0xFF111827); // on_surface, text_primary
  static const textLeise = Color(0xFF4B5563); // text_secondary
  static const linie = Color(0xFFE5E7EB); // divider
  static const fehler = Color(0xFFDC2626); // error
  static const loginHintergrund = Color(0xFF7F1D1D); // login_background

  // Statusfarben der alten App (ProfileFragment, EventDetailActivity) und
  // dazu helle Hintergruende fuer Chips.
  static const gruen = Color(0xFF0F7A2D);
  static const gruenHell = Color(0xFFE6F4EA);
  static const orange = Color(0xFFA05A00);
  static const orangeHell = Color(0xFFFFF3DC);
  static const rotFlaeche = Color(0xFFFDECEC); // ShoppingItemAdapter "fehlt"
  static const grauFlaeche = Color(0xFFF3F4F6);
  static const grauRahmen = Color(0xFF6B7280);
}

/// Farbschema ohne aus dem Rot abgeleitete Toenungen.
const fwvFarbschema = ColorScheme(
  brightness: Brightness.light,
  primary: FwvFarben.rot,
  onPrimary: FwvFarben.aufRot,
  primaryContainer: FwvFarben.flaeche,
  onPrimaryContainer: FwvFarben.text,
  primaryFixed: FwvFarben.flaeche,
  primaryFixedDim: FwvFarben.flaeche,
  onPrimaryFixed: FwvFarben.text,
  onPrimaryFixedVariant: FwvFarben.text,
  secondary: FwvFarben.rotDunkel,
  onSecondary: FwvFarben.aufRot,
  secondaryContainer: FwvFarben.flaeche,
  onSecondaryContainer: FwvFarben.text,
  secondaryFixed: FwvFarben.flaeche,
  secondaryFixedDim: FwvFarben.flaeche,
  onSecondaryFixed: FwvFarben.text,
  onSecondaryFixedVariant: FwvFarben.text,
  tertiary: FwvFarben.rotDunkel,
  onTertiary: FwvFarben.aufRot,
  tertiaryContainer: FwvFarben.flaeche,
  onTertiaryContainer: FwvFarben.text,
  tertiaryFixed: FwvFarben.flaeche,
  tertiaryFixedDim: FwvFarben.flaeche,
  onTertiaryFixed: FwvFarben.text,
  onTertiaryFixedVariant: FwvFarben.text,
  error: FwvFarben.fehler,
  onError: FwvFarben.aufRot,
  errorContainer: FwvFarben.rotFlaeche,
  onErrorContainer: FwvFarben.rotDunkel,
  surface: FwvFarben.flaeche,
  onSurface: FwvFarben.text,
  surfaceDim: FwvFarben.flaeche,
  surfaceBright: FwvFarben.flaeche,
  surfaceContainerLowest: FwvFarben.flaeche,
  surfaceContainerLow: FwvFarben.flaeche,
  surfaceContainer: FwvFarben.flaeche,
  surfaceContainerHigh: FwvFarben.flaeche,
  surfaceContainerHighest: FwvFarben.flaeche,
  onSurfaceVariant: FwvFarben.textLeise,
  outline: FwvFarben.grauRahmen,
  outlineVariant: FwvFarben.linie,
  shadow: Color(0xFF000000),
  scrim: Color(0xFF000000),
  inverseSurface: Color(0xFF1F2937),
  onInverseSurface: FwvFarben.flaeche,
  inversePrimary: FwvFarben.rotHell,
  // Kein Rotstich auf erhoehten Flaechen (elevationOverlayEnabled=false).
  surfaceTint: Color(0x00000000),
);

/// Das eine Theme fuer Mitglieder- und (spaeter) Vorstand-App.
ThemeData fwvThema() {
  const farben = fwvFarbschema;
  final basis = ThemeData(colorScheme: farben, useMaterial3: true);
  return basis.copyWith(
    scaffoldBackgroundColor: FwvFarben.hintergrund,
    canvasColor: FwvFarben.hintergrund,
    dividerColor: FwvFarben.linie,
    // Rote Leiste mit weisser Schrift wie die MaterialToolbar der alten App;
    // Statusleiste mit hellen Symbolen.
    appBarTheme: const AppBarTheme(
      backgroundColor: FwvFarben.rot,
      foregroundColor: FwvFarben.aufRot,
      surfaceTintColor: Color(0x00000000),
      elevation: 0,
      scrolledUnderElevation: 2,
      systemOverlayStyle: SystemUiOverlayStyle.light,
    ),
    // Untere Leiste weiss, Auswahl rot (alte BottomNavigationView).
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: FwvFarben.flaeche,
      surfaceTintColor: const Color(0x00000000),
      elevation: 3,
      // Wie die alte Leiste: keine Pille, nur Symbol und Text in Rot.
      indicatorColor: const Color(0x00000000),
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(
          color: s.contains(WidgetState.selected) ? FwvFarben.rot : FwvFarben.textLeise,
        ),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => TextStyle(
          fontSize: 12,
          letterSpacing: 0,
          fontWeight: s.contains(WidgetState.selected) ? FontWeight.w600 : FontWeight.w500,
          color: s.contains(WidgetState.selected) ? FwvFarben.rot : FwvFarben.textLeise,
        ),
      ),
    ),
    cardTheme: const CardThemeData(
      color: FwvFarben.flaeche,
      surfaceTintColor: Color(0x00000000),
      elevation: 1,
    ),
    dividerTheme: const DividerThemeData(color: FwvFarben.linie),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: FwvFarben.rot,
        foregroundColor: FwvFarben.aufRot,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: FwvFarben.rot,
        side: const BorderSide(color: FwvFarben.rot),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: FwvFarben.rot),
    ),
    // Gewaehltes Segment rot mit weisser Schrift — weisse Container waeren
    // sonst nicht vom Rest zu unterscheiden.
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: ButtonStyle(
        backgroundColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? FwvFarben.rot : FwvFarben.flaeche,
        ),
        foregroundColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? FwvFarben.aufRot : FwvFarben.text,
        ),
        iconColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? FwvFarben.aufRot : FwvFarben.text,
        ),
        side: const WidgetStatePropertyAll(BorderSide(color: FwvFarben.grauRahmen)),
      ),
    ),
    chipTheme: const ChipThemeData(
      backgroundColor: FwvFarben.flaeche,
      selectedColor: FwvFarben.rotFlaeche,
      checkmarkColor: FwvFarben.rot,
      side: BorderSide(color: FwvFarben.linie),
    ),
    tabBarTheme: const TabBarThemeData(
      labelColor: FwvFarben.rot,
      unselectedLabelColor: FwvFarben.textLeise,
      indicatorColor: FwvFarben.rot,
      dividerColor: FwvFarben.linie,
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: FwvFarben.rot,
      foregroundColor: FwvFarben.aufRot,
    ),
    dialogTheme: const DialogThemeData(
      backgroundColor: FwvFarben.flaeche,
      surfaceTintColor: Color(0x00000000),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: FwvFarben.flaeche,
      surfaceTintColor: Color(0x00000000),
    ),
    popupMenuTheme: const PopupMenuThemeData(
      color: FwvFarben.flaeche,
      surfaceTintColor: Color(0x00000000),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: FwvFarben.rot),
  );
}
