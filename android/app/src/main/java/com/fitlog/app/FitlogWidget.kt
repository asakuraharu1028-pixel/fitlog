package com.fitlog.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

class FitlogWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    companion object {
        fun updateWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val prefs = context.getSharedPreferences("FitlogWidget", Context.MODE_PRIVATE)
            val intake = prefs.getInt("todayIntake", -1)
            val burned = prefs.getInt("todayBurned", -1)
            val weight = prefs.getString("latestWeight", null)
            val date   = prefs.getString("lastUpdated", "")

            val views = RemoteViews(context.packageName, R.layout.widget_fitlog)

            views.setTextViewText(
                R.id.widget_intake,
                if (intake >= 0) "${intake} kcal" else "-- kcal"
            )
            views.setTextViewText(
                R.id.widget_burned,
                if (burned >= 0) "${burned} kcal" else "-- kcal"
            )
            views.setTextViewText(
                R.id.widget_weight,
                if (weight != null) "${weight} kg" else "-- kg"
            )
            views.setTextViewText(R.id.widget_date, date ?: "")

            // ログボタン → アプリ起動
            val launchIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("widget_action", "quick_log")
            }
            val pendingIntent = PendingIntent.getActivity(
                context, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_log_button, pendingIntent)

            // ウィジェット全体タップ → アプリ起動
            val openIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val openPending = PendingIntent.getActivity(
                context, 1, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, openPending)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
