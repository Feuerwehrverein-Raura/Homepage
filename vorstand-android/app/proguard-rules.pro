# Retrofit
-keepattributes Signature
-keepattributes *Annotation*
-keep class retrofit2.** { *; }
-keepclasseswithmembers class * { @retrofit2.http.* <methods>; }

# Gson
-keep class ch.fwvraura.vorstand.data.model.** { *; }
-keepclassmembers class ch.fwvraura.vorstand.data.model.** { *; }

# UpdateChecker (Gson-serialisierte innere Klassen)
-keep class ch.fwvraura.vorstand.util.UpdateChecker$* { *; }

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**

# Coil
-dontwarn coil.**
