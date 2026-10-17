// Kassen-App FWV Raura (Oktober 2026)
//
// Huelle um die Web-Kasse order.fwv-raura.ch als Trusted Web Activity: Chrome
// zeigt die Kasse ohne Adressleiste, mit allem, was sie im Browser kann
// (T400-Suche, QR-Login, Zwischenspeicher). Nur App-Symbol und Download sind
// neu. Signiert mit demselben Schluessel wie die Kuechen-App; ihr
// Fingerabdruck steht in order.fwv-raura.ch/.well-known/assetlinks.json -
// ohne passenden Eintrag zeigt Chrome eine Adressleiste.
plugins {
    id("com.android.application")
}

android {
    namespace = "ch.fwvraura.kasse"
    compileSdk = 35

    defaultConfig {
        applicationId = "ch.fwvraura.kasse"
        minSdk = 24
        targetSdk = 35
        // Release-Workflow setzt Version aus dem Tag kasse-vX.Y[.Z]
        versionCode = 1000
        versionName = "1.0"
        manifestPlaceholders["kasseUrl"] = "https://order.fwv-raura.ch/"
        manifestPlaceholders["kasseHost"] = "order.fwv-raura.ch"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")
}
