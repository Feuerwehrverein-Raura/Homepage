import SwiftUI

struct LoginView: View {
    @EnvironmentObject var auth: AuthManager
    @State private var loggingIn = false

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "flame.fill")
                .font(.system(size: 72))
                .foregroundStyle(.red)
            Text("FWV Mitglieder")
                .font(.largeTitle.bold())
            Text("Feuerwehrverein Raura Kaiseraugst")
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            if let err = auth.lastError {
                Text(err)
                    .font(.footnote)
                    .foregroundStyle(.red)
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
            .padding(.bottom, 40)
        }
        .padding()
    }
}
