package com.fitlog.app

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "FitlogWidget")
class WidgetPlugin : Plugin() {

    @PluginMethod
    fun updateData(call: PluginCall) {
        val context: Context = activity ?: return

        val prefs = context.getSharedPreferences("FitlogWidget", Context.MODE_PRIVATE)
        val editor = prefs.edit()

        if (call.hasOption("todayIntake"))  editor.putInt("todayIntake",  call.getInt("todayIntake", -1)!!)
        if (call.hasOption("todayBurned"))  editor.putInt("todayBurned",  call.getInt("todayBurned", -1)!!)
        if (call.hasOption("latestWeight")) editor.putString("latestWeight", call.getString("latestWeight"))
        if (call.hasOption("lastUpdated"))  editor.putString("lastUpdated",  call.getString("lastUpdated"))
        editor.apply()

        // 全ウィジェットを強制更新
        val manager = AppWidgetManager.getInstance(context)
        val ids = manager.getAppWidgetIds(ComponentName(context, FitlogWidget::class.java))
        for (id in ids) {
            FitlogWidget.updateWidget(context, manager, id)
        }

        call.resolve(JSObject().put("updated", ids.size))
    }
}
