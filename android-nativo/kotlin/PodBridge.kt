package app.rafael.podcast

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.annotation.OptIn
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import org.json.JSONArray
import org.json.JSONObject

/** Estado compartilhado entre o serviço, os widgets e a interface. */
object PodState {
    @Volatile var json: String = "{}"
    @Volatile var title: String = ""
    @Volatile var show: String = ""
    @Volatile var playing: Boolean = false
    @Volatile var error: String = ""
    @Volatile var pendingAction: String? = null
    private val done = ArrayList<String>()
    private val listen = HashMap<String, DoubleArray>()
    private var lastSave = 0L

    fun update(id: String, pos: Long, dur: Long, playing: Boolean, speed: Double, title: String, show: String) {
        this.title = title; this.show = show; this.playing = playing
        json = JSONObject().put("id", id).put("pos", pos).put("dur", dur).put("playing", playing)
            .put("speed", speed).put("error", error).toString()
    }
    fun markDone(id: String) { synchronized(done) { if (!done.contains(id)) done.add(id) } }
    fun takeDone(): String = synchronized(done) { val a = JSONArray(done); done.clear(); a.toString() }
    fun addListen(key: String, speed: Double) {
        synchronized(listen) { val v = listen.getOrPut(key) { DoubleArray(2) }; v[0] += 1.0; v[1] += speed }
    }
    fun takeListen(): String = synchronized(listen) {
        val o = JSONObject(); for ((k, v) in listen) o.put(k, JSONArray().put(v[0]).put(v[1])); listen.clear(); o.toString()
    }
    fun saveLast(ctx: Context) {
        val now = System.currentTimeMillis(); if (now - lastSave < 5000) return; lastSave = now
        ctx.getSharedPreferences("podcast", Context.MODE_PRIVATE).edit().putString("last", json).apply()
    }
}

/** Ponte entre o JavaScript da interface (window.PodNative) e o player nativo. */
@OptIn(UnstableApi::class)
class PodBridge(private val ctx: Context, private val web: WebView) {
    private val main = Handler(Looper.getMainLooper())
    private var controller: MediaController? = null
    private val pending = ArrayList<(ExoPlayer) -> Unit>()

    init { main.post { connect() } }

    private fun connect() {
        val token = SessionToken(ctx, ComponentName(ctx, PlaybackService::class.java))
        val future = MediaController.Builder(ctx, token).buildAsync()
        future.addListener({
            try { controller = future.get() } catch (_: Exception) { }
            flush()
        }, ContextCompat.getMainExecutor(ctx))
    }

    private fun flush() {
        val p = PlaybackService.instance?.exo
        if (p == null) { main.postDelayed({ flush() }, 200); return }
        val list = ArrayList(pending); pending.clear()
        list.forEach { try { it(p) } catch (_: Exception) { } }
    }

    private fun run(fn: (ExoPlayer) -> Unit) {
        main.post {
            val p = PlaybackService.instance?.exo
            if (p != null && controller != null) { try { fn(p) } catch (_: Exception) { } } else pending.add(fn)
        }
    }

    private fun item(o: JSONObject): MediaItem {
        val md = MediaMetadata.Builder()
            .setTitle(o.optString("title"))
            .setArtist(o.optString("artist"))
            .setAlbumTitle(o.optString("artist"))
        val art = o.optString("art")
        if (art.startsWith("http")) md.setArtworkUri(Uri.parse(art))
        return MediaItem.Builder().setMediaId(o.getString("id")).setUri(o.getString("url")).setMediaMetadata(md.build()).build()
    }

    private fun items(a: JSONArray): List<MediaItem> = (0 until a.length()).map { item(a.getJSONObject(it)) }

    fun emit() { main.post { web.evaluateJavascript("window.__podEvt&&window.__podEvt()", null) } }

    @JavascriptInterface fun available(): Boolean = true
    @JavascriptInterface fun alive(): Boolean = (PlaybackService.instance?.exo?.mediaItemCount ?: 0) > 0

    private val sleepR = Runnable { PlaybackService.instance?.exo?.pause() }
    @JavascriptInterface fun sleepIn(ms: Double) {
        main.post { main.removeCallbacks(sleepR); if (ms > 0) main.postDelayed(sleepR, ms.toLong()) }
    }

    @JavascriptInterface fun load(json: String) {
        val o = JSONObject(json)
        run { p ->
            PodState.error = ""
            p.setMediaItems(items(o.getJSONArray("items")), 0, o.optLong("startMs", 0L))
            p.playbackParameters = PlaybackParameters(o.optDouble("speed", 1.0).toFloat())
            p.prepare()
            p.playWhenReady = o.optBoolean("play", true)
            PlaybackService.instance?.snapshot(); emit()
        }
    }

    @JavascriptInterface fun setQueue(json: String) {
        val a = JSONArray(json)
        run { p ->
            val from = p.currentMediaItemIndex + 1
            if (from < p.mediaItemCount) p.removeMediaItems(from, p.mediaItemCount)
            p.addMediaItems(items(a))
        }
    }

    @JavascriptInterface fun play() = run { p -> if (p.playbackState == androidx.media3.common.Player.STATE_ENDED) p.seekTo(0); p.play() }
    @JavascriptInterface fun pause() = run { p -> p.pause() }
    @JavascriptInterface fun seekTo(ms: Double) = run { p -> p.seekTo(ms.toLong()) }
    @JavascriptInterface fun skip(ms: Double) = run { p -> p.seekTo(maxOf(0L, p.currentPosition + ms.toLong())) }
    @JavascriptInterface fun setSpeed(s: Double) = run { p -> p.playbackParameters = PlaybackParameters(s.toFloat()) }
    @JavascriptInterface fun next() = run { p -> if (p.hasNextMediaItem()) p.seekToNextMediaItem() else { p.pause(); p.seekTo(0) } }
    @JavascriptInterface fun stop() = run { p -> p.stop(); p.clearMediaItems() }
    @JavascriptInterface fun pauseAtEnd(on: Boolean) = run { p -> p.pauseAtEndOfMediaItems = on }
    @JavascriptInterface fun setSkip(back: Double, fwd: Double) { PlaybackService.backMs = back.toLong(); PlaybackService.fwdMs = fwd.toLong() }

    @JavascriptInterface fun state(): String {
        if (PlaybackService.instance == null) return ctx.getSharedPreferences("podcast", Context.MODE_PRIVATE).getString("last", "{}") ?: "{}"
        return PodState.json
    }
    @JavascriptInterface fun takeDone(): String = PodState.takeDone()
    @JavascriptInterface fun takeListen(): String = PodState.takeListen()
    @JavascriptInterface fun takeAction(): String { val a = PodState.pendingAction ?: ""; PodState.pendingAction = null; return a }

    @JavascriptInterface fun setWidgetInfo(json: String) {
        ctx.getSharedPreferences("podcast", Context.MODE_PRIVATE).edit().putString("widget", json).apply()
        main.post { Widgets.refresh(ctx) }
    }
}
