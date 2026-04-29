package ch.fwvraura.vorstand.ui.login

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import ch.fwvraura.vorstand.MainActivity
import ch.fwvraura.vorstand.VorstandApp
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.QrLoginRequest
import com.google.gson.Gson
import com.google.gson.JsonSyntaxException
import com.journeyapps.barcodescanner.CaptureManager
import com.journeyapps.barcodescanner.DecoratedBarcodeView
import kotlinx.coroutines.launch

/**
 * QR-Code-Scanner fuer den persistenten App-Login.
 *
 * Nutzt zxing-android-embedded (reine Java-Implementation, keine Native Libraries),
 * damit die App auch auf 16 KB Page-Size-Geraeten (Pixel 9, Fairphone 6) installiert
 * werden kann.
 *
 * Erwartetes QR-Payload:
 *   {"v":1,"type":"fwv-vorstand-login","email":"praesident@fwv-raura.ch","token":"fwv-app-..."}
 * oder der bare Token-String "fwv-app-...".
 */
class QrScannerActivity : AppCompatActivity() {

    private lateinit var captureManager: CaptureManager
    private lateinit var barcodeScannerView: DecoratedBarcodeView
    private lateinit var statusText: android.widget.TextView
    private lateinit var progress: android.view.View
    private val gson = Gson()

    /** Verhindert mehrfachen Login bei mehreren erkannten Frames hintereinander. */
    @Volatile
    private var processing = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(ch.fwvraura.vorstand.R.layout.activity_qr_scanner)

        barcodeScannerView = findViewById(ch.fwvraura.vorstand.R.id.barcodeScannerView)
        statusText = findViewById(ch.fwvraura.vorstand.R.id.instructionText)
        progress = findViewById(ch.fwvraura.vorstand.R.id.scannerProgress)

        findViewById<View>(ch.fwvraura.vorstand.R.id.cancelButton).setOnClickListener { finish() }

        // CaptureManager kuemmert sich um Permission-Anfrage, Lifecycle und Decoding
        captureManager = CaptureManager(this, barcodeScannerView)
        captureManager.initializeFromIntent(intent, savedInstanceState)
        captureManager.decode()

        barcodeScannerView.decodeContinuous { result ->
            val raw = result.text ?: return@decodeContinuous
            if (processing) return@decodeContinuous
            processing = true
            runOnUiThread { handlePayload(raw) }
        }
    }

    private fun handlePayload(raw: String) {
        val token = parseToken(raw)
        if (token == null) {
            Toast.makeText(this, "QR-Code ist kein Vorstand-Login-Code", Toast.LENGTH_LONG).show()
            barcodeScannerView.postDelayed({ processing = false }, 2000)
            return
        }
        progress.visibility = View.VISIBLE
        statusText.text = "Login läuft..."
        lifecycleScope.launch {
            try {
                val response = ApiModule.authApi.qrLogin(QrLoginRequest(token))
                if (response.isSuccessful) {
                    val body = response.body()
                    if (body == null) {
                        showError("Leere Antwort vom Server")
                        return@launch
                    }
                    val tokenManager = VorstandApp.instance.tokenManager
                    tokenManager.token = body.token
                    tokenManager.userEmail = body.user.email
                    tokenManager.userRole = body.user.role
                    tokenManager.userName = body.user.name
                    startActivity(Intent(this@QrScannerActivity, MainActivity::class.java))
                    finishAffinity()
                } else {
                    val msg = when (response.code()) {
                        400 -> "Ungültiger QR-Code"
                        401 -> "QR-Code wurde widerrufen"
                        else -> "Login fehlgeschlagen (${response.code()})"
                    }
                    showError(msg)
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

    private fun parseToken(raw: String): String? {
        return try {
            val payload = gson.fromJson(raw, QrPayload::class.java)
            if (payload?.type == "fwv-vorstand-login" && !payload.token.isNullOrBlank()) {
                payload.token
            } else null
        } catch (_: JsonSyntaxException) {
            if (raw.startsWith("fwv-app-")) raw else null
        }
    }

    override fun onResume() {
        super.onResume()
        captureManager.onResume()
    }

    override fun onPause() {
        super.onPause()
        captureManager.onPause()
    }

    override fun onDestroy() {
        super.onDestroy()
        captureManager.onDestroy()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        captureManager.onSaveInstanceState(outState)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        captureManager.onRequestPermissionsResult(requestCode, permissions, grantResults)
    }

    private data class QrPayload(
        val v: Int? = null,
        val type: String? = null,
        val email: String? = null,
        val token: String? = null
    )
}
