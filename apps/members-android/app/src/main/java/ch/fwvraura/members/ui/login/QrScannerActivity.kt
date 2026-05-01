package ch.fwvraura.members.ui.login

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import ch.fwvraura.members.MainActivity
import ch.fwvraura.members.MembersApp
import ch.fwvraura.members.R
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.QrLoginPayload
import ch.fwvraura.members.data.model.QrLoginRequest
import com.google.gson.Gson
import com.google.gson.JsonSyntaxException
import com.journeyapps.barcodescanner.BarcodeCallback
import com.journeyapps.barcodescanner.BarcodeResult
import com.journeyapps.barcodescanner.DecoratedBarcodeView
import kotlinx.coroutines.launch

/**
 * QR-Login fuer Mitglieder oder Organisatoren.
 *
 * Erwartete QR-Payloads:
 *   {"v":1,"type":"fwv-member-login","token":"fwv-member-..."}
 *   {"v":1,"type":"fwv-organizer-login","token":"fwv-org-..."}
 * Anhand des `type` wird der passende Backend-Endpoint angesteuert.
 */
class QrScannerActivity : AppCompatActivity() {

    private lateinit var barcodeScannerView: DecoratedBarcodeView
    private lateinit var statusText: android.widget.TextView
    private lateinit var progress: android.view.View
    private val gson = Gson()

    @Volatile
    private var processing = false

    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) startScan() else {
            Toast.makeText(this, "Kamera-Berechtigung benötigt", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_qr_scanner)

        barcodeScannerView = findViewById(R.id.barcodeScannerView)
        statusText = findViewById(R.id.instructionText)
        progress = findViewById(R.id.scannerProgress)
        findViewById<View>(R.id.cancelButton).setOnClickListener { finish() }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED
        ) startScan() else cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
    }

    private fun startScan() {
        barcodeScannerView.post {
            try {
                barcodeScannerView.decodeContinuous(object : BarcodeCallback {
                    override fun barcodeResult(result: BarcodeResult?) {
                        val raw = result?.text ?: return
                        if (processing) return
                        processing = true
                        handlePayload(raw)
                    }
                })
                barcodeScannerView.resume()
            } catch (e: Exception) {
                Toast.makeText(this, "Kamera konnte nicht gestartet werden: ${e.message}", Toast.LENGTH_LONG).show()
                finish()
            }
        }
    }

    private fun handlePayload(raw: String) {
        val payload = parsePayload(raw)
        if (payload == null) {
            Toast.makeText(this, "QR-Code ist kein gültiger Login-Code", Toast.LENGTH_LONG).show()
            barcodeScannerView.postDelayed({ processing = false }, 2000)
            return
        }
        progress.visibility = View.VISIBLE
        statusText.text = "Login läuft..."
        lifecycleScope.launch {
            try {
                val request = QrLoginRequest(payload.token!!)
                val response = if (payload.type == "fwv-organizer-login") {
                    ApiModule.authApi.organizerQrLogin(request)
                } else {
                    ApiModule.authApi.memberQrLogin(request)
                }
                if (response.isSuccessful) {
                    val body = response.body()
                    if (body == null) {
                        showError("Leere Antwort vom Server")
                        return@launch
                    }
                    val tm = MembersApp.instance.tokenManager
                    tm.token = body.token
                    tm.accountType = if (payload.type == "fwv-organizer-login") "organizer" else "member"
                    tm.userEmail = body.user?.email ?: payload.email
                    tm.userName = body.user?.name
                    tm.eventId = body.event_id
                    startActivity(Intent(this@QrScannerActivity, MainActivity::class.java))
                    finishAffinity()
                } else {
                    showError("Login fehlgeschlagen (${response.code()})")
                }
            } catch (e: Exception) {
                showError("Netzwerkfehler: ${e.message}")
            }
        }
    }

    private fun showError(msg: String) {
        progress.visibility = View.GONE
        statusText.text = msg
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
        barcodeScannerView.postDelayed({
            statusText.text = "QR-Code im Sucher ausrichten"
            processing = false
        }, 2500)
    }

    private fun parsePayload(raw: String): QrLoginPayload? {
        return try {
            val p = gson.fromJson(raw, QrLoginPayload::class.java)
            if (p?.token.isNullOrBlank()) null
            else if (p.type == "fwv-member-login" || p.type == "fwv-organizer-login") p
            else null
        } catch (_: JsonSyntaxException) {
            when {
                raw.startsWith("fwv-member-") -> QrLoginPayload(type = "fwv-member-login", token = raw)
                raw.startsWith("fwv-org-") -> QrLoginPayload(type = "fwv-organizer-login", token = raw)
                else -> null
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED
        ) {
            barcodeScannerView.post {
                try { barcodeScannerView.resume() } catch (_: Exception) { }
            }
        }
    }

    override fun onPause() {
        super.onPause()
        try { barcodeScannerView.pauseAndWait() } catch (_: Exception) { }
    }
}
