import Flutter
import Security
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    willFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Muss vor der ersten Szenen-Verbindung registriert sein, siehe
    // szeneVerbindetSich(_:).
    NotificationCenter.default.addObserver(
      self, selector: #selector(szeneVerbindetSich(_:)),
      name: UIScene.willConnectNotification, object: nil)
    return super.application(application, willFinishLaunchingWithOptions: launchOptions)
  }

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  /// Uebernommene Szenen-Sitzung der alten SwiftUI-App reparieren.
  ///
  /// Die alte App (members-ios) hatte dieselbe Bundle-ID und war eine
  /// SwiftUI-App. iOS speichert Szenen-Sitzungen samt Konfiguration
  /// (Library/Saved Application State) und stellt sie nach einem Update
  /// wieder her, ohne Info.plist oder configurationForConnecting erneut zu
  /// fragen. Die wiederhergestellte Szene hat dann `SwiftUI.AppSceneDelegate`
  /// als Delegate und kein Storyboard: Es entsteht kein Fenster, kein
  /// FlutterViewController und keine Flutter-Engine - der Bildschirm bleibt
  /// schwarz. In diesem Fall setzen wir hier unseren SceneDelegate ein und
  /// bauen das Fenster aus Main.storyboard selbst auf, genau wie UIKit es fuer
  /// eine frische Sitzung tun wuerde.
  @objc private func szeneVerbindetSich(_ notification: Notification) {
    guard let szene = notification.object as? UIWindowScene,
      szene.session.role == .windowApplication,
      !(szene.delegate is FlutterSceneDelegate)
    else { return }

    let delegate = SceneDelegate()
    let fenster = UIWindow(windowScene: szene)
    fenster.rootViewController = UIStoryboard(name: "Main", bundle: nil)
      .instantiateInitialViewController()
    delegate.window = fenster
    szene.delegate = delegate
    fenster.makeKeyAndVisible()
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "AltdatenUebernahme") {
      AltdatenUebernahme.register(with: registrar)
    }
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "FirebaseKonfiguration") {
      FirebaseKonfiguration.register(with: registrar)
    }
  }
}

/// Sagt Dart, ob die App eine GoogleService-Info.plist mitbringt. Ohne sie
/// darf Firebase nicht gestartet werden (FirebaseApp.configure() bricht die
/// App sonst ab); Push bleibt dann auf iOS aus. Gegenstueck in Dart:
/// FirebasePush in lib/push/push_dienst.dart.
///
/// Methode "konfiguriert": true, wenn die Datei im App-Bundle liegt.
final class FirebaseKonfiguration: NSObject, FlutterPlugin {
  static let kanal = "ch.fwvraura.members/firebase"

  static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(name: kanal, binaryMessenger: registrar.messenger())
    registrar.addMethodCallDelegate(FirebaseKonfiguration(), channel: channel)
  }

  func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "konfiguriert":
      result(Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil)
    default:
      result(FlutterMethodNotImplemented)
    }
  }
}

/// Liest einmalig die Anmeldedaten der alten Swift-App (members-ios) aus dem
/// Schluesselbund und loescht sie danach. Gegenstueck in Dart: fwv_core
/// AltdatenUebernahme.
///
/// Die alte App speicherte generische Passwoerter unter dem Dienst
/// "ch.fwvraura.members" (Sources/Auth/Keychain.swift). Die Werte gehen unter
/// den Schluesselnamen der alten Android-App an Dart, damit dort nur eine
/// Uebersetzung noetig ist ("access_token" heisst dort "auth_token").
///
/// Methoden:
///  - "lesen":    Map der vorhandenen Werte; nil, wenn es keine gibt.
///  - "loeschen": entfernt alle Eintraege des alten Dienstes.
final class AltdatenUebernahme: NSObject, FlutterPlugin {
  static let kanal = "ch.fwvraura.members/altdaten"
  private static let dienst = "ch.fwvraura.members"

  /// Konto im alten Schluesselbund -> Schluessel fuer Dart.
  private static let konten: [(alt: String, neu: String)] = [
    ("access_token", "auth_token"),
    ("refresh_token", "refresh_token"),
    ("qr_token", "qr_token"),
    ("account_type", "account_type"),
  ]

  static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(name: kanal, binaryMessenger: registrar.messenger())
    registrar.addMethodCallDelegate(AltdatenUebernahme(), channel: channel)
  }

  func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "lesen":
      var werte: [String: String] = [:]
      for konto in Self.konten {
        if let wert = Self.lesen(konto.alt), !wert.isEmpty {
          werte[konto.neu] = wert
        }
      }
      result(werte.isEmpty ? nil : werte)
    case "loeschen":
      let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: Self.dienst,
      ]
      SecItemDelete(query as CFDictionary)
      result(nil)
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  private static func lesen(_ konto: String) -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: dienst,
      kSecAttrAccount as String: konto,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var ergebnis: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &ergebnis) == errSecSuccess,
      let daten = ergebnis as? Data
    else { return nil }
    return String(data: daten, encoding: .utf8)
  }
}
