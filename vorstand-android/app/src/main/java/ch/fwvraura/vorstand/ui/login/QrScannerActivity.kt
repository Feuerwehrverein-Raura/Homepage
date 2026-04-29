package ch.fwvraura.vorstand.ui.login

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import ch.fwvraura.vorstand.MainActivity
import ch.fwvraura.vorstand.VorstandApp
import ch.fwvraura.vorstand.data.api.ApiModule
import ch.fwvraura.vorstand.data.model.QrLoginRequest
import ch.fwvraura.vorstand.databinding.ActivityQrScannerBinding
import com.google.gson.Gson
import com.google.gson.JsonSyntaxException
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import kotlinx.coroutines.launch
import java.util.concurrent.Executors

/**
 * QR-Code-Scanner fuer den persistenten App-Login.
 *
 * Zeigt eine Kamera-Vorschau, scannt QR-Codes und sendet den Token an
 * /auth/vorstand/qr-login. Bei Erfolg wird der JWT gespeichert und zur
 * MainActivity navigiert.
 *
 * Erwartetes QR-Payload:
 *   {"v":1,"type":"fwv-vorstand-login","email":"praesident@fwv-raura.ch","token":"fwv-app-..."}
 */
class QrScannerActivity : AppCompatActivity() {

    private lateinit var binding: ActivityQrScannerBinding
    private val cameraExecutor = Executors.newSingleThreadExecutor()
    private val barcodeScanner = BarcodeScanning.getClient(
        BarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .build()
    )
    private val gson = Gson()

    /** Verhindert mehrfachen Login bei mehreren erkannten Frames hintereinander. */
    @Volatile
    private var processing = false

    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) startCamera() else {
            Toast.makeText(this, "Kamera-Berechtigung benötigt", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityQrScannerBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.cancelButton.setOnClickListener { finish() }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED
        ) {
            startCamera()
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()

            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(binding.previewView.surfaceProvider)
            }

            val imageAnalysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            imageAnalysis.setAnalyzer(cameraExecutor) { proxy -> processImage(proxy) }

            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(
                    this,
                    CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                    imageAnalysis
                )
            } catch (e: Exception) {
                Log.e(TAG, "Camera binding failed", e)
                Toast.makeText(this, "Kamera-Fehler: ${e.message}", Toast.LENGTH_LONG).show()
                finish()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    @androidx.camera.core.ExperimentalGetImage
    private fun processImage(proxy: ImageProxy) {
        if (processing) {
            proxy.close()
            return
        }
        val mediaImage = proxy.image
        if (mediaImage == null) {
            proxy.close()
            return
        }
        val inputImage = InputImage.fromMediaImage(mediaImage, proxy.imageInfo.rotationDegrees)
        barcodeScanner.process(inputImage)
            .addOnSuccessListener { barcodes ->
                if (barcodes.isNotEmpty() && !processing) {
                    val raw = barcodes[0].rawValue
                    if (!raw.isNullOrBlank()) {
                        processing = true
                        runOnUiThread { handlePayload(raw) }
                    }
                }
            }
            .addOnCompleteListener { proxy.close() }
    }

    private fun handlePayload(raw: String) {
        val token = parseToken(raw)
        if (token == null) {
            Toast.makeText(this, "QR-Code ist kein Vorstand-Login-Code", Toast.LENGTH_LONG).show()
            // Nach 2s wieder erlauben — vielleicht hält der Nutzer den richtigen vor
            binding.previewView.postDelayed({ processing = false }, 2000)
            return
        }
        binding.scannerProgress.visibility = View.VISIBLE
        binding.instructionText.text = "Login läuft..."
        lifecycleScope.launch {
            try {
                val response = ApiModule.authApi.qrLogin(QrLoginRequest(token))
                if (response.isSuccessful) {
                    val body = response.body()!!
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
        binding.scannerProgress.visibility = View.GONE
        binding.instructionText.text = msg
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
        binding.previewView.postDelayed({
            binding.instructionText.text = "QR-Code im Sucher ausrichten"
            processing = false
        }, 2500)
    }

    private fun parseToken(raw: String): String? {
        // 1. Versuch: JSON mit den erwarteten Feldern
        return try {
            val payload = gson.fromJson(raw, QrPayload::class.java)
            if (payload?.type == "fwv-vorstand-login" && !payload.token.isNullOrBlank()) {
                payload.token
            } else null
        } catch (_: JsonSyntaxException) {
            // 2. Fallback: roher Token-String "fwv-app-..."
            if (raw.startsWith("fwv-app-")) raw else null
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
        barcodeScanner.close()
    }

    private data class QrPayload(
        val v: Int? = null,
        val type: String? = null,
        val email: String? = null,
        val token: String? = null
    )

    companion object {
        private const val TAG = "QrScannerActivity"
    }
}
