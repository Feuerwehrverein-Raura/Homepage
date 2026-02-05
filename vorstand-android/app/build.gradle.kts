// FWV Vorstand Android App - Feuerwehrverein Raura
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Version aus Git-Tag ableiten (vorstand-v1.2.0 → 1.2.0)
fun getVersionFromTag(): String {
    return try {
        val tag = providers.exec {
            commandLine("git", "describe", "--tags", "--match", "vorstand-v*", "--abbrev=0")
        }.standardOutput.asText.get().trim()
        tag.removePrefix("vorstand-v")
    } catch (_: Exception) {
        "1.0.0"
    }
}

fun getVersionCode(): Int {
    return try {
        val version = getVersionFromTag()
        val parts = version.split(".").map { it.toIntOrNull() ?: 0 }
        parts.getOrElse(0) { 0 } * 10000 + parts.getOrElse(1) { 0 } * 100 + parts.getOrElse(2) { 0 }
    } catch (_: Exception) {
        1
    }
}

android {
    namespace = "ch.fwvraura.vorstand"
    compileSdk = 35

    defaultConfig {
        applicationId = "ch.fwvraura.vorstand"
        minSdk = 30
        targetSdk = 35
        versionCode = getVersionCode()
        versionName = getVersionFromTag()
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        viewBinding = true
    }
}

dependencies {
    // AndroidX Core
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.fragment:fragment-ktx:1.8.5")
    implementation("androidx.constraintlayout:constraintlayout:2.2.0")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    implementation("androidx.cardview:cardview:1.0.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.preference:preference-ktx:1.2.1")

    // Material Design 3
    implementation("com.google.android.material:material:1.12.0")

    // Navigation
    implementation("androidx.navigation:navigation-fragment-ktx:2.8.5")
    implementation("androidx.navigation:navigation-ui-ktx:2.8.5")

    // Lifecycle (ViewModel)
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")

    // Networking: OkHttp + Retrofit
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")

    // JSON
    implementation("com.google.code.gson:gson:2.11.0")

    // Image Loading
    implementation("io.coil-kt:coil:2.7.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // Encrypted SharedPreferences
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
}
