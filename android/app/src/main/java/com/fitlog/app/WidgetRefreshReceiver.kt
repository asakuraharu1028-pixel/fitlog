package com.fitlog.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * アプリを更新したときに、アプリを開くのを待たずに保存済みのデータで全ウィジェットを描き直す。
 * （更新直後はレイアウトの仮表示のままになるため）
 */
class WidgetRefreshReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            FitlogWidget.updateAllWidgets(context)
        }
    }
}
