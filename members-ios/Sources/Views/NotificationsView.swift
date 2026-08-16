import SwiftUI
import UserNotifications

/// Benachrichtigungs-Einstellungen (`GET`/`PUT members/me/notifications`).
///
/// Die Einstellungen wirken auf E-Mail **und** Push. Sie sind deshalb auch
/// dann sinnvoll, wenn auf diesem Gerät keine Push-Erlaubnis erteilt ist —
/// die Zustellung per E-Mail läuft weiter.
struct NotificationsView: View {
    @EnvironmentObject var auth: AuthManager

    @State private var preferences: [NotificationPreference] = []
    @State private var loading = true
    @State private var saving = false
    @State private var error: String?
    @State private var pushStatus: UNAuthorizationStatus = .notDetermined

    /// Die vier Arten, die das Backend kennt — mit denselben Schlüsseln wie
    /// in der Android-App.
    private static let known: [(type: String, title: String, subtitle: String)] = [
        ("event_invitation", "Einladungen",
         "Neue Anlässe und Einladungen"),
        ("shift_reminder", "Schicht-Erinnerungen",
         "Kurz vor einer Schicht, für die du eingeteilt bist"),
        ("registration_status", "Anmeldungen",
         "Wenn eine Anmeldung bestätigt oder abgelehnt wird"),
        ("newsletter", "Newsletter",
         "Mitteilungen des Vereins")
    ]

    var body: some View {
        Group {
            if loading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    Section {
                        ForEach(Self.known, id: \.type) { entry in
                            Toggle(isOn: binding(for: entry.type)) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(entry.title)
                                    Text(entry.subtitle)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    } header: {
                        Text("Wovon du hören willst")
                    } footer: {
                        Text("Gilt für E-Mail und Mitteilungen auf dem Gerät.")
                    }

                    Section {
                        switch pushStatus {
                        case .authorized, .provisional, .ephemeral:
                            Label("Mitteilungen auf diesem Gerät erlaubt",
                                  systemImage: "checkmark.circle")
                                .foregroundStyle(.green)
                        case .denied:
                            Label("Mitteilungen sind für diese App abgeschaltet. "
                                + "In den iOS-Einstellungen unter Mitteilungen "
                                + "wieder erlauben.",
                                  systemImage: "bell.slash")
                                .foregroundStyle(.orange)
                        default:
                            Button {
                                Task { await requestPush() }
                            } label: {
                                Label("Mitteilungen erlauben", systemImage: "bell")
                            }
                        }
                    } header: {
                        Text("Dieses Gerät")
                    } footer: {
                        Text("Ohne Erlaubnis kommen die gewählten Meldungen "
                           + "weiterhin per E-Mail.")
                    }

                    if let error {
                        Section {
                            Label(error, systemImage: "exclamationmark.triangle")
                                .foregroundStyle(.red)
                        }
                    }
                }
            }
        }
        .navigationTitle("Benachrichtigungen")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if saving { ProgressView() }
        }
        .task {
            await load()
            pushStatus = await PushService.authorizationStatus()
        }
    }

    /// Einstellungen, die das Backend noch nicht kennt, gelten als
    /// eingeschaltet — so verhält sich auch die Android-App.
    private func binding(for type: String) -> Binding<Bool> {
        Binding(
            get: {
                preferences.first { $0.notificationType == type }?.enabled ?? true
            },
            set: { newValue in
                if let index = preferences.firstIndex(where: { $0.notificationType == type }) {
                    preferences[index].enabled = newValue
                } else {
                    preferences.append(NotificationPreference(
                        notificationType: type, enabled: newValue))
                }
                Task { await save() }
            }
        )
    }

    private func load() async {
        loading = true
        error = nil
        preferences = (try? await auth.api().get("members/me/notifications")) ?? []
        loading = false
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            // Das Backend erwartet alle vier auf einmal, nicht die einzelne
            // Aenderung.
            let complete = Self.known.map { entry in
                preferences.first { $0.notificationType == entry.type }
                    ?? NotificationPreference(notificationType: entry.type, enabled: true)
            }
            let updated: [NotificationPreference] = try await auth.api().put(
                "members/me/notifications",
                body: NotificationsUpdateRequest(preferences: complete))
            preferences = updated
            error = nil
        } catch {
            self.error = "Einstellung konnte nicht gespeichert werden."
        }
    }

    private func requestPush() async {
        await PushService.shared.requestAuthorization()
        pushStatus = await PushService.authorizationStatus()
    }
}
