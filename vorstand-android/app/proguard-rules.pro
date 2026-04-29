# Retrofit
-keepattributes Signature, *Annotation*, EnclosingMethod, InnerClasses
-keepattributes RuntimeVisibleAnnotations, RuntimeInvisibleAnnotations
-keep class retrofit2.** { *; }
-keep,allowshrinking,allowobfuscation interface * extends retrofit2.Call
-keepclasseswithmembers class * { @retrofit2.http.* <methods>; }
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}

# Gson – Modelle und alle inneren/Generic-Typen behalten
-keep class ch.fwvraura.vorstand.data.model.** { *; }
-keep class ch.fwvraura.vorstand.data.model.**$* { *; }
-keepclassmembers class ch.fwvraura.vorstand.data.model.** { *; }
-keepclassmembers,allowobfuscation class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# Gson generische TypeToken / Reflection
-keep class com.google.gson.** { *; }
-keep class com.google.gson.reflect.TypeToken { *; }
-keep class * extends com.google.gson.reflect.TypeToken
-keep,allowobfuscation,allowshrinking class * extends com.google.gson.TypeAdapter
-keep,allowobfuscation,allowshrinking class * extends com.google.gson.TypeAdapterFactory
-keep,allowobfuscation,allowshrinking class * extends com.google.gson.JsonSerializer
-keep,allowobfuscation,allowshrinking class * extends com.google.gson.JsonDeserializer

# Kotlin-Metadata (wichtig fuer Gson + Kotlin Data classes)
-keep class kotlin.Metadata { *; }
-keepclassmembers class kotlin.** { *; }
-dontwarn kotlin.**

# Coroutines
-keep class kotlinx.coroutines.** { *; }
-dontwarn kotlinx.coroutines.**

# UpdateChecker (Gson-serialisierte innere Klassen)
-keep class ch.fwvraura.vorstand.util.UpdateChecker$* { *; }

# AppAuth (OIDC)
-keep class net.openid.** { *; }

# ZXing-android-embedded
-keep class com.journeyapps.barcodescanner.** { *; }
-keep class com.google.zxing.** { *; }

# OkHttp
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# Coil
-dontwarn coil.**
