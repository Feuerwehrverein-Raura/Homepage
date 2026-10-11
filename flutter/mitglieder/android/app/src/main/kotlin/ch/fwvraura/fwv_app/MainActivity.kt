package ch.fwvraura.fwv_app

import ch.fwvraura.fwv_app.kontakte.KontakteKanal
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var kontakte: KontakteKanal? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, AltdatenUebernahme.KANAL)
            .setMethodCallHandler(AltdatenUebernahme(applicationContext))
        val k = KontakteKanal(this).also { kontakte = it }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, KontakteKanal.KANAL)
            .setMethodCallHandler(k)
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
