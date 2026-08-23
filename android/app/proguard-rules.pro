# Keep Android framework classes
-keep class android.** { *; }
-keep interface android.** { *; }

# Keep React Native
-keep class com.facebook.react.** { *; }
-keep interface com.facebook.react.** { *; }

# Keep Expo modules
-keep class expo.modules.** { *; }
-keep interface expo.modules.** { *; }
-keep class expo.** { *; }

# Keep your app package
-keep class com.webazi.ussdapp.** { *; }
-keep interface com.webazi.ussdapp.** { *; }

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep custom application classes
-keep public class * extends android.app.Activity
-keep public class * extends android.app.Service
-keep public class * extends android.content.BroadcastReceiver
-keep public class * extends android.content.ContentProvider
-keep public class * extends android.app.Fragment

# Keep view constructors
-keepclasseswithmembers class * {
    public <init>(android.content.Context, android.util.AttributeSet);
}

# Remove logging in production
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
    public static *** println(...);
}

# Keep enums
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Keep Parcelable implementations
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# Optimization flags
-optimizationpasses 5
-dontusemixedcaseclassnames
