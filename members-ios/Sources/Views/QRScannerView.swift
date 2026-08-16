import AVFoundation
import SwiftUI
import UIKit

/// QR-Scanner für die Anmeldung per gedrucktem Code — Gegenstück zu
/// `QrScannerActivity` der Android-App, die dafür zxing einbindet.
///
/// Hier reicht AVFoundation: `AVCaptureMetadataOutput` erkennt QR-Codes
/// selbst, eine Fremdbibliothek wäre überflüssig.
struct QRScannerView: UIViewControllerRepresentable {
    var onScan: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> ScannerController {
        let controller = ScannerController()
        controller.onScan = { code in
            onScan(code)
            dismiss()
        }
        controller.onCancel = { dismiss() }
        return controller
    }

    func updateUIViewController(_ controller: ScannerController, context: Context) {}

    final class ScannerController: UIViewController,
                                   AVCaptureMetadataOutputObjectsDelegate {
        var onScan: ((String) -> Void)?
        var onCancel: (() -> Void)?

        private let session = AVCaptureSession()
        private var preview: AVCaptureVideoPreviewLayer?
        /// Verhindert, dass ein einmal erkannter Code mehrfach ausgelöst wird —
        /// die Kamera liefert denselben Code viele Male pro Sekunde.
        private var handled = false
        private var hintLabel: UILabel?
        private var settingsButton: UIButton?

        override func viewDidLoad() {
            super.viewDidLoad()
            view.backgroundColor = .black
            addCancelButton()
            prepareCamera()
        }

        /// Erst die Berechtigung klaeren, dann die Kamera aufbauen.
        ///
        /// Ohne diese Unterscheidung bliebe bei verweigertem Zugriff nur ein
        /// schwarzes Bild stehen — und iOS fragt kein zweites Mal nach, die
        /// Freigabe muss dann von Hand in den Einstellungen erfolgen. Ein
        /// schwarzer Bildschirm ohne Erklaerung sieht aber wie ein Defekt aus.
        private func prepareCamera() {
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .authorized:
                startCamera()
            case .notDetermined:
                AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                    DispatchQueue.main.async {
                        guard let self else { return }
                        if granted {
                            self.startCamera()
                        } else {
                            self.showHint(
                                "Ohne Kamerazugriff geht es nicht. In den "
                                + "iOS-Einstellungen unter Datenschutz → Kamera "
                                + "freigeben.", withSettingsButton: true)
                        }
                    }
                }
            case .denied, .restricted:
                showHint("Der Kamerazugriff ist gesperrt. In den "
                       + "iOS-Einstellungen unter Datenschutz → Kamera "
                       + "wieder freigeben.", withSettingsButton: true)
            @unknown default:
                showHint("Kamerazugriff nicht moeglich.", withSettingsButton: false)
            }
        }

        private func startCamera() {
            guard configureSession() else {
                // Im Simulator gibt es keine Kamera — hier landet man dort.
                showHint("Auf diesem Geraet ist keine Kamera verfuegbar.",
                         withSettingsButton: false)
                return
            }
            showHint("Login-QR-Code in den Rahmen halten", withSettingsButton: false)
            DispatchQueue.global(qos: .userInitiated).async { [session] in
                session.startRunning()
            }
        }

        override func viewWillDisappear(_ animated: Bool) {
            super.viewWillDisappear(animated)
            if session.isRunning { session.stopRunning() }
        }

        override func viewDidLayoutSubviews() {
            super.viewDidLayoutSubviews()
            preview?.frame = view.bounds
        }

        /// Gibt zurueck, ob eine nutzbare Kamera gefunden wurde.
        private func configureSession() -> Bool {
            guard let device = AVCaptureDevice.default(for: .video),
                  let input = try? AVCaptureDeviceInput(device: device),
                  session.canAddInput(input) else { return false }
            session.addInput(input)

            let output = AVCaptureMetadataOutput()
            guard session.canAddOutput(output) else { return false }
            session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            output.metadataObjectTypes = [.qr]

            let layer = AVCaptureVideoPreviewLayer(session: session)
            layer.videoGravity = .resizeAspectFill
            layer.frame = view.bounds
            view.layer.addSublayer(layer)
            preview = layer
            return true
        }

        private func addCancelButton() {
            var config = UIButton.Configuration.filled()
            config.title = "Abbrechen"
            config.baseBackgroundColor = UIColor.black.withAlphaComponent(0.5)
            config.baseForegroundColor = .white
            config.contentInsets = NSDirectionalEdgeInsets(
                top: 8, leading: 16, bottom: 8, trailing: 16)
            let button = UIButton(configuration: config)
            button.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
            button.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(button)
            NSLayoutConstraint.activate([
                button.centerXAnchor.constraint(equalTo: view.centerXAnchor),
                button.bottomAnchor.constraint(
                    equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -32)
            ])
        }

        private func showHint(_ text: String, withSettingsButton: Bool) {
            hintLabel?.removeFromSuperview()
            settingsButton?.removeFromSuperview()

            let label = UILabel()
            label.text = text
            label.textColor = .white
            label.textAlignment = .center
            label.numberOfLines = 0
            label.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(label)
            NSLayoutConstraint.activate([
                label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
                label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
                label.topAnchor.constraint(
                    equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 48)
            ])
            hintLabel = label

            guard withSettingsButton else { return }
            var config = UIButton.Configuration.filled()
            config.title = "Einstellungen öffnen"
            config.baseBackgroundColor = .white
            config.baseForegroundColor = .black
            let button = UIButton(configuration: config)
            button.addTarget(self, action: #selector(openSettings), for: .touchUpInside)
            button.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(button)
            NSLayoutConstraint.activate([
                button.centerXAnchor.constraint(equalTo: view.centerXAnchor),
                button.topAnchor.constraint(equalTo: label.bottomAnchor, constant: 24)
            ])
            settingsButton = button
        }

        @objc private func openSettings() {
            guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
            UIApplication.shared.open(url)
        }

        @objc private func cancelTapped() {
            onCancel?()
        }

        func metadataOutput(
            _ output: AVCaptureMetadataOutput,
            didOutput objects: [AVMetadataObject],
            from connection: AVCaptureConnection
        ) {
            guard !handled,
                  let object = objects.first as? AVMetadataMachineReadableCodeObject,
                  let value = object.stringValue else { return }
            handled = true
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            session.stopRunning()
            onScan?(value)
        }
    }
}
