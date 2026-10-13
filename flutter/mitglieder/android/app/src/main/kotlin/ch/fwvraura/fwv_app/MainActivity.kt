package ch.fwvraura.fwv_app

import android.os.Build
import ch.fwvraura.fwv_app.kontakte.KontakteKanal
import ch.fwvraura.fwv_app.schopf.SchopfPlayer
import ch.fwvraura.fwv_app.schopf.SchopfRoutenDienst
import com.ryanheise.audioservice.AudioServiceActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

// AudioServiceActivity (eine FlutterActivity) fuer die Musik im Hintergrund.
class MainActivity : AudioServiceActivity() {
    private var kontakte: KontakteKanal? = null
    private var update: AppUpdateKanal? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // 1.0.10 hatte einen Dart-Empfaenger fuer Push im Hintergrund
        // hinterlegt, den es nicht mehr gibt ("Im Schopf laeuft" macht jetzt
        // schopf/SchopfPlayer.kt). Sonst startet jede Nachricht vergeblich
        // Flutter im Hintergrund.
        getSharedPreferences("io.flutter.firebase.messaging.callback", MODE_PRIVATE).edit()
            .remove("callback_handle").remove("user_callback_handle").apply()
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, AltdatenUebernahme.KANAL)
            .setMethodCallHandler(AltdatenUebernahme(applicationContext))
        val k = KontakteKanal(this).also { kontakte = it }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, KontakteKanal.KANAL)
            .setMethodCallHandler(k)
        val updateKanal = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, AppUpdateKanal.KANAL)
        updateKanal.setMethodCallHandler(AppUpdateKanal(this, updateKanal).also { update = it })
    }

    // Waehrend der Schicht: kurz nach Geraeten suchen, damit Android den
    // Roten Schopf als Ausgabegeraet koppelt (schopf/SchopfRoutenDienst.kt).
    // Im Hintergrund darf eine App nicht suchen.
    override fun onResume() {
        super.onResume()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && SchopfPlayer.aktiv(this)) {
            SchopfRoutenDienst.suchen(applicationContext)
        }
    }

    override fun onPause() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            SchopfRoutenDienst.sucheBeenden(applicationContext)
        }
        super.onPause()
    }

    override fun onDestroy() {
        update?.beenden()
        super.onDestroy()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        if (kontakte?.berechtigungErhalten(requestCode, grantResults) == true) return
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    }
}
