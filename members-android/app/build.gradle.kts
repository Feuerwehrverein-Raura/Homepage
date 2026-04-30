// FWV Raura Mitglieder-App – Feuerwehrverein Raura

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.github.triplet.play")
}

// Version aus Git-Tag ableiten (members-v1.2.0 -> 1.2.0).
fun getVersionFromTag(): String {
    return try {
        val tag = providers.exec {
            commandLine("git", "describe", "--tags", "--match", "members-v*", "--abbrev=0")
        }.standardOutput.asText.get().trim()
        tag.removePrefix("members-v")
    } catch (_: Exception) {
        "1.0.0"
    }
}

fun getVersionCode(): Int {
    return try {
        val v = getVersionFromTag()
        val parts = v.split(".").map { it.toIntOrNull() ?: 0 }
        parts.getOrElse(0) { 0 } * 10000 + parts.getOrElse(1) { 0 } * 100 + parts.getOrElse(2) { 0 }
    } catch (_: Exception) { 1 }
}

android {
    namespace = "ch.fwvraura.members"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.fwv.members"
        minSdk = 26
        targetSdk = 35
        versionCode = getVersionCode()
        versionName = getVersionFromTag()

        // AppAuth-Redirect-URI Scheme (fuer Authentik-OIDC)
        manifestPlaceholders["appAuthRedirectScheme"] = "com.fwv.members"
    }

    signingConfigs {
        create("release") {
            // Werte werden im CI ueber GitHub-Secrets gesetzt; lokal ist nur Debug-Build sinnvoll.
            val keystorePath = System.getenv("MEMBERS_KEYSTORE_PATH")
            if (!keystorePath.isNullOrBlank()) {
                storeFile = file(keystorePath)
                storePassword = System.getenv("MEMBERS_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("MEMBERS_KEY_ALIAS") ?: "members"
                keyPassword = System.getenv("MEMBERS_KEY_PASSWORD")
                    ?: System.getenv("MEMBERS_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Wenn Keystore-Env-Vars gesetzt sind, mit Release-Key signieren,
            // sonst Debug-Key (der CI generiert ggf. einen einmaligen Keystore).
            val hasKeystore = System.getenv("MEMBERS_KEYSTORE_PATH") != null
            if (hasKeystore) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    buildFeatures { viewBinding = true }
}

// Gradle Play Publisher — laed das App-Bundle (.aab) in den Play Store.
// Aktiv nur wenn die Service-Account-JSON ueber Env-Var bereitgestellt wird;
// lokal/PR-Builds bleiben ohne Play-Upload.
play {
    val keyFile = System.getenv("PLAY_SERVICE_ACCOUNT_JSON_PATH")
    if (!keyFile.isNullOrBlank()) {
        serviceAccountCredentials.set(file(keyFile))
    }
    enabled.set(!keyFile.isNullOrBlank())
    track.set("internal")               // erst Internal Testing, manuell Promote zu Closed/Production
    defaultToAppBundles.set(true)        // .aab statt .apk hochladen
    // DRAFT statt COMPLETED — Bundle wird hochgeladen, aber NICHT automatisch
    // verteilt. Der Vorstand klickt manuell auf "Roll out" in der Play Console.
    // Pflicht solange die App noch nie veroeffentlicht wurde (Status "Entwurf"
    // in der Console).
    releaseStatus.set(com.github.triplet.gradle.androidpublisher.ReleaseStatus.DRAFT)
}

dependencies {
    // AndroidX Core + UI
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.fragment:fragment-ktx:1.8.5")
    implementation("androidx.constraintlayout:constraintlayout:2.2.0")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    implementation("androidx.cardview:cardview:1.0.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.preference:preference-ktx:1.2.1")

    // Material 3
    implementation("com.google.android.material:material:1.12.0")

    // Lifecycle
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")

    // Networking
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.google.code.gson:gson:2.11.0")

    // Image Loading
    implementation("io.coil-kt:coil:2.7.0")
    implementation("io.coil-kt:coil-svg:2.7.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // Encrypted Token-Storage
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // OIDC-Login bei Authentik
    implementation("net.openid:appauth:0.11.1")

    // QR-Code-Scanner (kein ML Kit -> 16 KB Page-Size-kompatibel)
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
}
