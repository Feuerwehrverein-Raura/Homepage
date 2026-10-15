// Kitchen Display Android App - FWV Raura
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ch.fwvraura.kitchendisplay"
    compileSdk = 35

    defaultConfig {
        applicationId = "ch.fwvraura.kitchendisplay"
        // Android 7.0 (Kuechendisplay laeuft mit 7.1.2)
        minSdk = 24
        targetSdk = 35
        // versionCode folgt dem Schema des Release-Workflows
        // (major*1000 + minor*100 + patch): kds-v2.6.1 war 2601, 3.0 ist 3000.
        // Ein kleinerer Code (z.B. 30) liesse sich ueber 2.6.1 nicht installieren.
        versionCode = 3000
        versionName = "3.0"
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
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }

    buildFeatures {
        viewBinding = true
    }

    lint {
        // Kiosk-App: feste Queransicht ist gewollt.
        disable += setOf("LockedOrientationActivity", "DiscouragedApi")
        abortOnError = false
    }
}

dependencies {
    // AndroidX Core
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.activity:activity-ktx:1.8.1")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    implementation("androidx.cardview:cardview:1.0.0")
    implementation("androidx.preference:preference-ktx:1.2.1")

    // Material Design
    implementation("com.google.android.material:material:1.10.0")

    // OkHttp for WebSocket and HTTP
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Gson for JSON parsing
    implementation("com.google.code.gson:gson:2.10.1")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

    testImplementation("junit:junit:4.13.2")
}
