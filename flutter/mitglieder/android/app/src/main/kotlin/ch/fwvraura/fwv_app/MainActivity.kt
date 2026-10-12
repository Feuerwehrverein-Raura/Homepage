package ch.fwvraura.fwv_app

import ch.fwvraura.fwv_app.kontakte.KontakteKanal
import com.ryanheise.audioservice.AudioServiceActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

// AudioServiceActivity (eine FlutterActivity) fuer die Musik im Hintergrund.
class MainActivity : AudioServiceActivity() {
    private var kontakte: KontakteKanal? = null
    private var update: AppUpdateKanal? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, AltdatenUebernahme.KANAL)
            .setMethodCallHandler(AltdatenUebernahme(applicationContext))
        val k = KontakteKanal(this).also { kontakte = it }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, KontakteKanal.KANAL)
            .setMethodCallHandler(k)
        val updateKanal = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, AppUpdateKanal.KANAL)
        updateKanal.setMethodCallHandler(AppUpdateKanal(this, updateKanal).also { update = it })
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
