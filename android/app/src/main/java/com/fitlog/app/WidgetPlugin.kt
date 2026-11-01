package com.fitlog.app

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "FitlogWidget")
class WidgetPlugin : Plugin() {

    companion object {
        /** ウィジェットのタップで開く画面（例: "/exercise"）を渡す Intent extra */
        const val EXTRA_ROUTE = "widget_route"
    }

    @PluginMethod
    fun updateData(call: PluginCall) {
        val context: Context = activity ?: return

        val prefs = context.getSharedPreferences("FitlogWidget", Context.MODE_PRIVATE)
        val editor = prefs.edit()

        if (call.hasOption("todayIntake"))  editor.putInt("todayIntake",  call.getInt("todayIntake", -1)!!)
        if (call.hasOption("todayBurned"))  editor.putInt("todayBurned",  call.getInt("todayBurned", -1)!!)
        if (call.hasOption("latestWeight")) editor.putString("latestWeight", call.getString("latestWeight"))
        if (call.hasOption("lastUpdated"))  editor.putString("lastUpdated",  call.getString("lastUpdated"))
        if (call.hasOption("exerciseDone"))   editor.putBoolean("exerciseDone", call.getBoolean("exerciseDone", false)!!)
        if (call.hasOption("exerciseStreak")) editor.putInt("exerciseStreak", call.getInt("exerciseStreak", 0)!!)
        if (call.hasOption("exerciseBest"))   editor.putInt("exerciseBest", call.getInt("exerciseBest", 0)!!)
        if (call.hasOption("exerciseFreezesLeft")) editor.putInt("exerciseFreezesLeft", call.getInt("exerciseFreezesLeft", 0)!!)
        if (call.hasOption("exerciseRecent")) editor.putString("exerciseRecent", call.getString("exerciseRecent"))
        editor.apply()

        // 全ウィジェットを強制更新
        val manager = AppWidgetManager.getInstance(context)
        val ids = manager.getAppWidgetIds(ComponentName(context, FitlogWidget::class.java))
        for (id in ids) {
            FitlogWidget.updateWidget(context, manager, id)
        }
        val exerciseIds = manager.getAppWidgetIds(ComponentName(context, ExerciseWidget::class.java))
        for (id in exerciseIds) {
            ExerciseWidget.updateWidget(context, manager, id)
        }

        call.resolve(JSObject().put("updated", ids.size + exerciseIds.size))
    }

    /** ウィジェットからアプリを起動したときの画面を返し、二重に処理しないよう消す */
    @PluginMethod
    fun consumeLaunchRoute(call: PluginCall) {
        val intent = activity?.intent
        val route = intent?.getStringExtra(EXTRA_ROUTE)
        intent?.removeExtra(EXTRA_ROUTE)
        call.resolve(JSObject().put("route", route))
    }

    /** アプリ起動中にウィジェットがタップされたときは、イベントで画面を知らせる */
    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        val route = intent.getStringExtra(EXTRA_ROUTE) ?: return
        intent.removeExtra(EXTRA_ROUTE)
        notifyListeners("routeRequested", JSObject().put("route", route))
    }
}
