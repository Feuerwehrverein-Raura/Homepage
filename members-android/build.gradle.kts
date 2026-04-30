plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    // Lädt fertige App-Bundles in den Play Store Closed-Testing-Track hoch.
    id("com.github.triplet.play") version "3.12.1" apply false
    // Firebase: erzeugt R-Klassen aus google-services.json zur Build-Zeit.
    id("com.google.gms.google-services") version "4.4.2" apply false
}
