#!/usr/bin/env bash
# Adiciona ao projeto Android gerado pelo Tauri: player nativo (Media3), widgets e atalhos.
set -euo pipefail
G=src-tauri/gen/android/app
PKG=$G/src/main/java/app/rafael/podcast
M=$G/src/main/AndroidManifest.xml
[ -d "$PKG" ] || PKG=$(dirname "$(find $G/src/main/java -name MainActivity.kt | head -1)")
echo "Pacote: $PKG"

cp android-nativo/kotlin/*.kt "$PKG/"
cp -r android-nativo/res/. $G/src/main/res/

# MainActivity: liga a ponte JavaScript <-> player nativo e recebe os atalhos
MA=$PKG/MainActivity.kt
echo "--- MainActivity gerada:"; cat "$MA"
perl -0pi -e 's/(class MainActivity\s*:\s*TauriActivity\(\))\s*$/$1 {\n}\n/' "$MA"
perl -0pi -e 's/^(package [^\n]+\n)/$1\nimport android.content.Intent\nimport android.webkit.WebView\n/' "$MA"
perl -0pi -e 's/\}\s*$/
  private var podWeb: WebView? = null

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    podWeb = webView
    webView.addJavascriptInterface(PodBridge(applicationContext, webView), "PodNative")
    podIntent(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    podIntent(intent)
    podWeb?.evaluateJavascript("window.__podAction&&window.__podAction()", null)
  }

  private fun podIntent(i: Intent?) {
    val d = i?.data ?: return
    if (d.scheme == "podcast-app") PodState.pendingAction = d.host
  }
}
/' "$MA"
echo "--- MainActivity final:"; cat "$MA"

# Manifesto: serviço de mídia, widgets e atalhos
APP_XML='
        <service android:name=".PlaybackService" android:exported="true" android:foregroundServiceType="mediaPlayback">
            <intent-filter><action android:name="androidx.media3.session.MediaSessionService" /></intent-filter>
        </service>
        <receiver android:name=".WidgetActions" android:exported="false" />
        <receiver android:name=".PlayerWidget" android:exported="false" android:label="Podcast: player">
            <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/widget_player_info" />
        </receiver>
        <receiver android:name=".MiniWidget" android:exported="false" android:label="Podcast: mini player">
            <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/widget_mini_info" />
        </receiver>
        <receiver android:name=".InfoWidget" android:exported="false" android:label="Podcast: semana e caixa de entrada">
            <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/widget_info_info" />
        </receiver>
'
APP_XML="$APP_XML" perl -0pi -e 's#(</application>)#$ENV{APP_XML}$1#' "$M"
perl -0pi -e 's#(</activity>)#    <meta-data android:name="android.app.shortcuts" android:resource="\@xml/shortcuts" />\n        $1#' "$M"
perl -0pi -e 's#(<category android:name="android.intent.category.LAUNCHER"\s*/>\s*</intent-filter>)#$1\n            <intent-filter>\n                <action android:name="android.intent.action.VIEW" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <data android:scheme="podcast-app" />\n            </intent-filter>#' "$M"
for P in INTERNET ACCESS_NETWORK_STATE WAKE_LOCK FOREGROUND_SERVICE FOREGROUND_SERVICE_MEDIA_PLAYBACK POST_NOTIFICATIONS; do
  grep -q "android.permission.$P\"" "$M" || perl -0pi -e "s#(<manifest[^>]*>)#\$1\n    <uses-permission android:name=\"android.permission.$P\" />#" "$M"
done
echo "--- Manifesto final:"; cat "$M"

# Dependências do Media3
cat >> $G/build.gradle.kts <<'GRADLE'

dependencies {
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-session:1.4.1")
}
GRADLE
grep -n "compileSdk\|minSdk\|targetSdk" $G/build.gradle.kts || true
