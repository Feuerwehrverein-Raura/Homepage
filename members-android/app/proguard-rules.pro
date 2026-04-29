-keepattributes Signature, *Annotation*, EnclosingMethod, InnerClasses
-keep class ch.fwvraura.members.data.model.** { *; }
-keep class com.google.gson.** { *; }

# Retrofit
-keep,allowshrinking,allowobfuscation interface * extends retrofit2.Call
-keep class retrofit2.** { *; }

# OkHttp
-keep class okhttp3.** { *; }
-keep class okio.** { *; }

# AppAuth
-keep class net.openid.** { *; }

# ZXing
-keep class com.journeyapps.barcodescanner.** { *; }
-keep class com.google.zxing.** { *; }
