# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# Gson
-keepattributes Signature
-keepattributes *Annotation*
-keep class ch.fwvraura.kitchendisplay.models.** { *; }

# Keep UpdateChecker data classes for Gson
-keep class ch.fwvraura.kitchendisplay.UpdateChecker$GitHubRelease { *; }
-keep class ch.fwvraura.kitchendisplay.UpdateChecker$Asset { *; }

# Keep Gson TypeToken and related
-keep class com.google.gson.reflect.TypeToken { *; }
-keep class * extends com.google.gson.reflect.TypeToken

# Keep all Gson annotations
-keepclassmembers,allowobfuscation class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# Prevent R8 from stripping generic type info
-keepattributes EnclosingMethod
-keepattributes InnerClasses
