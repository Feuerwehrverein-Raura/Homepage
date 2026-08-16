import SwiftUI

struct LoginView: View {
    @EnvironmentObject var auth: AuthManager
    @State private var loggingIn = false
    @State private var scanning = false
    @State private var resetting = false
    @State private var qrError: String?

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            // Dasselbe Emblem wie in der Android-App (ic_launcher_foreground),
            // freigestellt — das dortige logo_mitglieder.png hat einen
            // eingebrannten Karo-Hintergrund und taugt nicht als Vorlage.
            Image("LogoMitglieder")
                .resizable()
                .scaledToFit()
                .frame(width: 180, height: 180)
            Text("FWV Mitglieder")
                .font(.largeTitle.bold())
            Text("Feuerwehrverein Raura Kaiseraugst")
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            if let err = qrError ?? auth.lastError {
                Text(err)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            Spacer()

            Button {
                loggingIn = true
                Task {
                    await auth.login()
                    loggingIn = false
                }
            } label: {
                if loggingIn {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                } else {
                    Text("Anmelden")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(loggingIn)
            .padding(.horizontal)

            // Zweiter Weg: der gedruckte QR-Code. Fuer Mitglieder ohne
            // Authentik-Konto ist er die einzige Anmeldung — genau wie in
            // der Android-App.
            Button {
                scanning = true
            } label: {
                Label("Mit QR-Code anmelden", systemImage: "qrcode.viewfinder")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .disabled(loggingIn)
            .padding(.horizontal)

            Button("Passwort vergessen") { resetting = true }
                .font(.footnote)
                .padding(.top, 4)
                .padding(.bottom, 40)
        }
        .padding()
        .sheet(isPresented: $scanning) {
            QRScannerView { code in
                Task { await handleScan(code) }
            }
            .ignoresSafeArea()
        }
        .sheet(isPresented: $resetting) {
            PasswordResetView().environmentObject(auth)
        }
    }

    /// Wertet den gescannten Code aus. Erst als JSON, sonst ueber die
    /// Praefixe — dieselbe Reihenfolge wie in Androids QrScannerActivity,
    /// damit aeltere gedruckte Codes weiter funktionieren.
    private func handleScan(_ raw: String) async {
        qrError = nil
        let payload: QrLoginPayload
        if let data = raw.data(using: .utf8),
           let decoded = try? JSONDecoder().decode(QrLoginPayload.self, from: data),
           decoded.token != nil {
            payload = decoded
        } else if raw.hasPrefix("fwv-member-") {
            payload = QrLoginPayload(v: nil, type: "fwv-member-login",
                                     email: nil, token: raw)
        } else if raw.hasPrefix("fwv-org-") {
            payload = QrLoginPayload(v: nil, type: "fwv-organizer-login",
                                     email: nil, token: raw)
        } else {
            qrError = "Das ist kein Login-Code des Vereins."
            return
        }

        guard let token = payload.token else {
            qrError = "Im Code steckt kein Zugang."
            return
        }
        qrError = await auth.loginWithQR(token: token, organizer: payload.isOrganizer)
    }
}
