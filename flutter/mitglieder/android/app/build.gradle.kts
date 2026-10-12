plugins {
    id("com.android.application")
    id("com.google.gms.google-services")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "ch.fwvraura.fwv_app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // flutter_local_notifications braucht java.time auch auf aelteren
        // Android-Versionen.
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        // Dieselbe ID wie die bisherige Kotlin-App (members-android): so kommt die
        // Flutter-App bei den Mitgliedern als Update an, nicht als neue App.
        applicationId = "com.fwv.members"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = 26
        targetSdk = flutter.targetSdkVersion
        // Version kommt aus --build-name / --build-number (Workflow:
        // members-vX.Y.Z -> X.Y.Z, Code X*10000+Y*100+Z wie bei members-android).
        // Ohne diese Angaben gilt die Version aus pubspec.yaml.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        // Anmeldung ueber Authentik: AppAuth faengt die Rueckleitung
        // com.fwv.members:/oauth2redirect ab (wie members-android).
        manifestPlaceholders += mapOf("appAuthRedirectScheme" to "com.fwv.members")
    }

    // Upload-Schluessel: derselbe wie bei members-android, sonst nimmt Google
    // Play das Bundle nicht als Update von com.fwv.members an. Die Werte
    // setzt der Workflow build-android-members.yml aus den GitHub-Secrets
    // MEMBERS_KEYSTORE_BASE64 / MEMBERS_KEYSTORE_PASSWORD.
    val keystorePath = System.getenv("MEMBERS_KEYSTORE_PATH")
    val hatKeystore = !keystorePath.isNullOrBlank()

    signingConfigs {
        create("release") {
            if (hatKeystore) {
                storeFile = file(keystorePath!!)
                storePassword = System.getenv("MEMBERS_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("MEMBERS_KEY_ALIAS") ?: "members"
                keyPassword = System.getenv("MEMBERS_KEY_PASSWORD")
                    ?: System.getenv("MEMBERS_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            // Ohne Keystore (lokale Builds) mit dem Debug-Schluessel signieren —
            // so laesst sich ein Release-Build ueber die Debug-App installieren.
            signingConfig = if (hatKeystore) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
            // R8 bleibt wie im Flutter-Standard aktiv; eigene Regeln stehen in
            // proguard-rules.pro (Kontakte-Abgleich, Altdaten-Uebernahme).
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
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

dependencies {
    // Nur fuer die Uebernahme der Anmeldung aus der alten App
    // (EncryptedSharedPreferences "fwv_members_prefs", siehe MainActivity.kt).
    implementation("androidx.security:security-crypto:1.1.0")
    // Hinweis auf neue Versionen aus Play (lib/einstellungen/app_update.dart).
    implementation("com.google.android.play:app-update:2.1.0")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
}
