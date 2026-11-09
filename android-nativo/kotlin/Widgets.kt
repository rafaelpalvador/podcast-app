package app.rafael.podcast

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.widget.RemoteViews
import org.json.JSONObject

class PlayerWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = Widgets.refresh(context)
}
class MiniWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = Widgets.refresh(context)
}
class InfoWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = Widgets.refresh(context)
}

/** Botões dos widgets: tocar/pausar, voltar e avançar. */
class WidgetActions : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val p = PlaybackService.instance?.exo
        if (p == null || p.mediaItemCount == 0) { Widgets.openApp(context, "continuar"); return }
        when (intent.action) {
            "app.rafael.podcast.TOGGLE" -> if (p.isPlaying) p.pause() else p.play()
            "app.rafael.podcast.BACK" -> p.seekTo(maxOf(0L, p.currentPosition - PlaybackService.backMs))
            "app.rafael.podcast.FWD" -> p.seekTo(p.currentPosition + PlaybackService.fwdMs)
        }
    }
}

object Widgets {
    @Volatile var art: Bitmap? = null

    fun openApp(ctx: Context, action: String) {
        val i = Intent(Intent.ACTION_VIEW, Uri.parse("podcast-app://$action")).setClass(ctx, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        ctx.startActivity(i)
    }

    private fun openPi(ctx: Context, action: String, code: Int): PendingIntent {
        val i = Intent(Intent.ACTION_VIEW, Uri.parse("podcast-app://$action")).setClass(ctx, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun actionPi(ctx: Context, action: String, code: Int): PendingIntent =
        PendingIntent.getBroadcast(ctx, code, Intent(ctx, WidgetActions::class.java).setAction(action), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    fun refresh(ctx: Context) {
        try {
            val m = AppWidgetManager.getInstance(ctx)
            val title = PodState.title.ifEmpty { "Nada tocando" }
            val show = if (PodState.title.isEmpty()) "Toque para abrir o Podcast" else PodState.show
            val playIcon = if (PodState.playing) R.drawable.ic_w_pause else R.drawable.ic_w_play
            val info = try { JSONObject(ctx.getSharedPreferences("podcast", Context.MODE_PRIVATE).getString("widget", "{}") ?: "{}") } catch (_: Exception) { JSONObject() }

            for (id in m.getAppWidgetIds(ComponentName(ctx, PlayerWidget::class.java))) {
                val v = RemoteViews(ctx.packageName, R.layout.widget_player)
                v.setTextViewText(R.id.w_title, title)
                v.setTextViewText(R.id.w_show, show)
                v.setImageViewResource(R.id.w_play, playIcon)
                val a = art; if (a != null) v.setImageViewBitmap(R.id.w_art, a) else v.setImageViewResource(R.id.w_art, R.drawable.ic_w_logo)
                v.setOnClickPendingIntent(R.id.w_root, openPi(ctx, "player", 1))
                v.setOnClickPendingIntent(R.id.w_play, actionPi(ctx, "app.rafael.podcast.TOGGLE", 2))
                v.setOnClickPendingIntent(R.id.w_back, actionPi(ctx, "app.rafael.podcast.BACK", 3))
                v.setOnClickPendingIntent(R.id.w_fwd, actionPi(ctx, "app.rafael.podcast.FWD", 4))
                m.updateAppWidget(id, v)
            }
            for (id in m.getAppWidgetIds(ComponentName(ctx, MiniWidget::class.java))) {
                val v = RemoteViews(ctx.packageName, R.layout.widget_mini)
                v.setTextViewText(R.id.w_title, title)
                v.setImageViewResource(R.id.w_play, playIcon)
                val a = art; if (a != null) v.setImageViewBitmap(R.id.w_art, a) else v.setImageViewResource(R.id.w_art, R.drawable.ic_w_logo)
                v.setOnClickPendingIntent(R.id.w_root, openPi(ctx, "player", 5))
                v.setOnClickPendingIntent(R.id.w_play, actionPi(ctx, "app.rafael.podcast.TOGGLE", 6))
                m.updateAppWidget(id, v)
            }
            for (id in m.getAppWidgetIds(ComponentName(ctx, InfoWidget::class.java))) {
                val v = RemoteViews(ctx.packageName, R.layout.widget_info)
                v.setTextViewText(R.id.w_week, info.optString("week", "0 min"))
                v.setTextViewText(R.id.w_saved, info.optString("saved", ""))
                val n = info.optInt("inbox", 0)
                v.setTextViewText(R.id.w_inbox, if (n == 0) "Caixa de entrada em dia" else "$n na caixa de entrada")
                v.setTextViewText(R.id.w_next, info.optString("next", ""))
                v.setOnClickPendingIntent(R.id.w_root, openPi(ctx, "inbox", 7))
                m.updateAppWidget(id, v)
            }
        } catch (_: Exception) { }
    }
}
