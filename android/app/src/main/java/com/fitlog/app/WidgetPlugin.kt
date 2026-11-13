package com.fitlog.app

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

        /**
         * Intent から開く画面を取り出し、二重に処理しないよう消す。
         * ウィジェットは EXTRA_ROUTE、NFC タグは fitlog://stock?item=T01 → "/stock?item=T01"
         */
        fun takeRoute(intent: Intent?): String? {
            if (intent == null) return null
            intent.getStringExtra(EXTRA_ROUTE)?.let {
                intent.removeExtra(EXTRA_ROUTE)
                return it
            }
            val data = intent.data ?: return null
            if (data.scheme != "fitlog" || data.host != "stock") return null
            intent.data = null
            intent.action = null
            val query = data.encodedQuery
            return if (query.isNullOrEmpty()) "/stock" else "/stock?$query"
        }
    }

    /** リスナー登録前に届いた画面指定 */
    private var pendingRoute: String? = null

    @PluginMethod
    fun updateData(call: PluginCall) {
        val context: Context = activity ?: return

        val prefs = context.getSharedPreferences("FitlogWidget", Context.MODE_PRIVATE)
        val editor = prefs.edit()

        if (call.hasOption("todayIntake"))  editor.putInt("todayIntake",  call.getInt("todayIntake", -1)!!)
        if (call.hasOption("todayBurned"))  editor.putInt("todayBurned",  call.getInt("todayBurned", -1)!!)
        if (call.hasOption("latestWeight")) editor.putString("latestWeight", call.getString("latestWeight"))
        if (call.hasOption("lastUpdated"))  editor.putString("lastUpdated",  call.getString("lastUpdated"))
        // 連続記録（カテゴリごとに "<key>Done" "<key>Streak" "<key>Best" "<key>FreezesLeft" "<key>Recent"）
        for (category in StreakCategory.values()) {
            val k = category.key
            if (call.hasOption("${k}Done"))        editor.putBoolean("${k}Done", call.getBoolean("${k}Done", false)!!)
            if (call.hasOption("${k}Streak"))      editor.putInt("${k}Streak", call.getInt("${k}Streak", 0)!!)
            if (call.hasOption("${k}Best"))        editor.putInt("${k}Best", call.getInt("${k}Best", 0)!!)
            if (call.hasOption("${k}FreezesLeft")) editor.putInt("${k}FreezesLeft", call.getInt("${k}FreezesLeft", 0)!!)
            if (call.hasOption("${k}Recent"))      editor.putString("${k}Recent", call.getString("${k}Recent"))
        }
        editor.apply()

        // 全ウィジェットを強制更新
        val updated = FitlogWidget.updateAllWidgets(context)

        call.resolve(JSObject().put("updated", updated))
    }

    /** ウィジェットからアプリを起動したときの画面を返し、二重に処理しないよう消す */
    @PluginMethod
    fun consumeLaunchRoute(call: PluginCall) {
        val route = pendingRoute ?: takeRoute(activity?.intent)
        pendingRoute = null
        call.resolve(JSObject().put("route", route))
    }

    /** アプリ起動中にウィジェットがタップされたときは、イベントで画面を知らせる */
    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        val route = takeRoute(intent) ?: return
        // 起動直後（NFC タグでの起動など）は Web 側のリスナーがまだないので、consumeLaunchRoute で渡す
        if (!hasListeners("routeRequested")) {
            pendingRoute = route
            return
        }
        notifyListeners("routeRequested", JSObject().put("route", route))
    }
}
