package com.fitlog.app

import android.content.Context
import android.content.Intent
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.Ndef
import android.nfc.tech.NdefFormatable
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

    // ---- NFC タグへの書き込み（日用品のタグ作り） ----
    // 書き込みモードのあいだはリーダーモードにして、かざしたタグに writeUri を書く。
    // リーダーモード中はタグを読んでも fitlog:// で画面を開かない

    /** 書き込みモード中か（一時停止から戻ったらリーダーモードを入れ直す） */
    private var nfcWriting = false
    /** 次にかざしたタグに書く URI。書き込めたら null にして、同じ内容を続けて書かない */
    @Volatile private var writeUri: String? = null

    private val readerCallback = NfcAdapter.ReaderCallback { tag -> onTagForWrite(tag) }

    private fun enableReader() {
        val act = activity ?: return
        val adapter = NfcAdapter.getDefaultAdapter(act) ?: return
        act.runOnUiThread {
            adapter.enableReaderMode(
                act, readerCallback,
                NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or
                    NfcAdapter.FLAG_READER_NFC_F or NfcAdapter.FLAG_READER_NFC_V,
                null,
            )
        }
    }

    private fun disableReader() {
        val act = activity ?: return
        val adapter = NfcAdapter.getDefaultAdapter(act) ?: return
        act.runOnUiThread { adapter.disableReaderMode(act) }
    }

    /** 書き込みモードを始める（すでに始めていれば、次に書く内容だけ変える）。NFC が使えるかを返す */
    @PluginMethod
    fun startNfcWrite(call: PluginCall) {
        val uri = call.getString("uri")
        if (uri == null || !uri.startsWith("fitlog:")) {
            call.reject("invalid uri")
            return
        }
        val adapter = activity?.let { NfcAdapter.getDefaultAdapter(it) }
        if (adapter == null) {
            call.resolve(JSObject().put("available", false).put("enabled", false))
            return
        }
        if (!adapter.isEnabled) {
            call.resolve(JSObject().put("available", true).put("enabled", false))
            return
        }
        writeUri = uri
        if (!nfcWriting) {
            nfcWriting = true
            enableReader()
        }
        call.resolve(JSObject().put("available", true).put("enabled", true))
    }

    @PluginMethod
    fun stopNfcWrite(call: PluginCall) {
        nfcWriting = false
        writeUri = null
        disableReader()
        call.resolve()
    }

    override fun handleOnResume() {
        super.handleOnResume()
        if (nfcWriting) enableReader()
    }

    override fun handleOnPause() {
        super.handleOnPause()
        if (nfcWriting) disableReader()
    }

    /** かざしたタグに書く（NFC のスレッドで呼ばれる）。結果は nfcWriteResult で知らせる */
    private fun onTagForWrite(tag: Tag) {
        val uri = writeUri ?: return
        val message = NdefMessage(arrayOf(NdefRecord.createUri(uri)))
        val result = JSObject().put("uri", uri)
        try {
            val ndef = Ndef.get(tag)
            if (ndef != null) {
                ndef.connect()
                try {
                    if (!ndef.isWritable) throw WriteError("read-only")
                    if (ndef.maxSize < message.byteArrayLength) throw WriteError("too-small")
                    ndef.writeNdefMessage(message)
                } finally {
                    try { ndef.close() } catch (_: Exception) {}
                }
            } else {
                // 未フォーマットのタグ
                val formatable = NdefFormatable.get(tag) ?: throw WriteError("not-ndef")
                formatable.connect()
                try {
                    formatable.format(message)
                } finally {
                    try { formatable.close() } catch (_: Exception) {}
                }
            }
            if (writeUri == uri) writeUri = null
            result.put("ok", true)
        } catch (e: WriteError) {
            result.put("ok", false).put("error", e.message)
        } catch (e: Exception) {
            // 書いている途中でタグが離れたときなど
            result.put("ok", false).put("error", "io")
        }
        notifyListeners("nfcWriteResult", result)
    }

    private class WriteError(code: String) : Exception(code)
}
