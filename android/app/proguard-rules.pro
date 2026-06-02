# Keep WebView JavaScript interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep FileProvider
-keep class androidx.core.content.FileProvider { *; }
