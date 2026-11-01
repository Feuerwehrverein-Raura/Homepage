plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "ch.fwvraura.musik"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // Nicht im Play Store: Download von www.fwv-raura.ch/download/musik.apk,
        // die App aktualisiert sich selbst (lib/update.dart).
        applicationId = "ch.fwvraura.musik"
        minSdk = 24
        targetSdk = flutter.targetSdkVersion
        // Aus dem Tag musik-vX.Y.Z (--build-name / --build-number), wie die
        // Desktop-Programme: Code X*10000 + Y*100 + Z.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        // Anmeldung ueber Authentik: AppAuth faengt die Rueckleitung
        // ch.fwvraura.musik:/oauth2redirect ab (Provider fwv-members-app).
        manifestPlaceholders += mapOf("appAuthRedirectScheme" to "ch.fwvraura.musik")
    }

    buildTypes {
        release {
            // Lokal mit dem Debug-Schluessel; der Workflow build-desktop-musik.yml
            // signiert das Release-APK danach mit apksigner (Schluessel der
            // Kuechen- und Kassen-App).
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
