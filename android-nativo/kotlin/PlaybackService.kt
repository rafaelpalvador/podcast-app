package app.rafael.podcast

import android.app.PendingIntent
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/** Serviço de reprodução: toca o áudio fora da WebView, com notificação de mídia,
 *  controles na tela bloqueada, na cápsula do Honor, no fone e no carro. */
@OptIn(UnstableApi::class)
class PlaybackService : MediaSessionService() {
    companion object {
        @Volatile var instance: PlaybackService? = null
        @Volatile var backMs: Long = 15000L
        @Volatile var fwdMs: Long = 30000L
    }

    private var session: MediaSession? = null
    lateinit var exo: ExoPlayer
    private val main = Handler(Looper.getMainLooper())
    private var lastId: String = ""
    private val dayFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)

    private val ticker = object : Runnable {
        override fun run() {
            if (exo.isPlaying) {
                val id = exo.currentMediaItem?.mediaId ?: ""
                if (id.isNotEmpty()) {
                    val cal = Calendar.getInstance()
                    PodState.addListen(id + "|" + dayFmt.format(cal.time) + "|" + cal.get(Calendar.HOUR_OF_DAY), exo.playbackParameters.speed.toDouble())
                }
            }
            snapshot()
            main.postDelayed(this, 1000)
        }
    }

    override fun onCreate() {
        super.onCreate()
        exo = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_SPEECH).build(),
                true
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .setSeekBackIncrementMs(15000)
            .setSeekForwardIncrementMs(30000)
            .build()

        // Botões "anterior/próximo" da notificação, do fone e da cápsula viram voltar/avançar alguns segundos
        val forwarding = object : ForwardingPlayer(exo) {
            override fun getAvailableCommands(): Player.Commands =
                super.getAvailableCommands().buildUpon()
                    .add(Player.COMMAND_SEEK_TO_NEXT)
                    .add(Player.COMMAND_SEEK_TO_PREVIOUS)
                    .add(Player.COMMAND_SEEK_BACK)
                    .add(Player.COMMAND_SEEK_FORWARD)
                    .build()

            override fun isCommandAvailable(command: Int): Boolean =
                command == Player.COMMAND_SEEK_TO_NEXT || command == Player.COMMAND_SEEK_TO_PREVIOUS ||
                    command == Player.COMMAND_SEEK_BACK || command == Player.COMMAND_SEEK_FORWARD ||
                    super.isCommandAvailable(command)

            override fun seekToNext() { exo.seekTo(exo.currentPosition + fwdMs) }
            override fun seekToPrevious() { exo.seekTo(maxOf(0L, exo.currentPosition - backMs)) }
            override fun seekForward() { exo.seekTo(exo.currentPosition + fwdMs) }
            override fun seekBack() { exo.seekTo(maxOf(0L, exo.currentPosition - backMs)) }
        }

        val open = packageManager.getLaunchIntentForPackage(packageName) ?: Intent()
        val pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        session = MediaSession.Builder(this, forwarding).setSessionActivity(pi).build()

        exo.addListener(object : Player.Listener {
            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO && lastId.isNotEmpty()) PodState.markDone(lastId)
                lastId = mediaItem?.mediaId ?: ""
                loadArt(mediaItem)
                snapshot(); Widgets.refresh(this@PlaybackService)
            }

            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) {
                    val id = exo.currentMediaItem?.mediaId ?: ""
                    if (id.isNotEmpty()) PodState.markDone(id)
                }
                snapshot(); Widgets.refresh(this@PlaybackService)
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) { snapshot(); Widgets.refresh(this@PlaybackService) }

            override fun onPlayerError(error: PlaybackException) { PodState.error = error.errorCodeName; snapshot() }
        })
        instance = this
        main.post(ticker)
    }

    fun snapshot() {
        val item = exo.currentMediaItem
        val md = item?.mediaMetadata
        PodState.update(
            id = item?.mediaId ?: "",
            pos = exo.currentPosition,
            dur = if (exo.duration == C.TIME_UNSET) 0L else exo.duration,
            playing = exo.isPlaying || (exo.playWhenReady && exo.playbackState == Player.STATE_BUFFERING),
            speed = exo.playbackParameters.speed.toDouble(),
            title = md?.title?.toString() ?: "",
            show = md?.artist?.toString() ?: ""
        )
        PodState.saveLast(this)
    }

    private fun loadArt(item: MediaItem?) {
        val uri = item?.mediaMetadata?.artworkUri?.toString() ?: ""
        if (uri.isEmpty() || !uri.startsWith("http")) { Widgets.art = null; return }
        Thread {
            try {
                val c = URL(uri).openConnection() as HttpURLConnection
                c.connectTimeout = 10000; c.readTimeout = 15000; c.instanceFollowRedirects = true
                val raw = c.inputStream.use { BitmapFactory.decodeStream(it) }
                if (raw != null) {
                    val s = 240
                    Widgets.art = Bitmap.createScaledBitmap(raw, s, s, true)
                    main.post { Widgets.refresh(this) }
                }
            } catch (_: Exception) { }
        }.start()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        if (!exo.playWhenReady || exo.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        main.removeCallbacks(ticker)
        instance = null
        session?.run { player.release(); release() }
        session = null
        super.onDestroy()
    }
}
