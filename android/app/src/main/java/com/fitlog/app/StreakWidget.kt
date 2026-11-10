package com.fitlog.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.widget.RemoteViews
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * カテゴリ別の連続記録ウィジェット（src/lib/streak.ts の StreakCategory と対応）。
 * データは FitlogWidget と同じ SharedPreferences に "<key>Streak" などの名前で入っている。
 */
enum class StreakCategory(
    val key: String,
    val title: String,
    val route: String,
    val requestCode: Int,
    val provider: Class<out AppWidgetProvider>,
) {
    EXERCISE("exercise", "💪 運動", "/exercise", 10, ExerciseWidget::class.java),
    MEAL("meal", "🍽️ 食事", "/meal", 11, MealStreakWidget::class.java),
    BODY("body", "⚖️ 体重・睡眠", "/body", 12, BodyStreakWidget::class.java),
    HABIT("habit", "✨ 習慣", "/", 13, HabitStreakWidget::class.java),
}

/** 各カテゴリのウィジェットの共通処理 */
abstract class StreakWidget(private val category: StreakCategory) : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            render(context, appWidgetManager, appWidgetId, category)
        }
    }

    companion object {
        /** 1週間（月〜日）に使えるフリーズ回数。src/lib/streak.ts の FREEZES_PER_WEEK と合わせる */
        private const val FREEZES_PER_WEEK = 1

        private fun weekStart(date: LocalDate): LocalDate =
            date.minusDays((date.dayOfWeek.value - 1).toLong()) // 月曜始まり

        private val DAY_IDS = intArrayOf(
            R.id.ex_day0, R.id.ex_day1, R.id.ex_day2, R.id.ex_day3,
            R.id.ex_day4, R.id.ex_day5, R.id.ex_day6,
        )

        /** 全カテゴリの配置済みウィジェットを更新し、更新した数を返す */
        fun updateAll(context: Context, manager: AppWidgetManager): Int {
            var count = 0
            for (category in StreakCategory.values()) {
                val ids = manager.getAppWidgetIds(ComponentName(context, category.provider))
                for (id in ids) render(context, manager, id, category)
                count += ids.size
            }
            return count
        }

        fun render(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int,
            category: StreakCategory,
        ) {
            val k = category.key
            val prefs = context.getSharedPreferences("FitlogWidget", Context.MODE_PRIVATE)
            val lastUpdated = prefs.getString("lastUpdated", null)
                ?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
            val savedStreak  = prefs.getInt("${k}Streak", -1)
            val best         = prefs.getInt("${k}Best", -1)
            val savedFreezes = prefs.getInt("${k}FreezesLeft", -1)
            // 最後に同期した日を末尾とする直近7日の状態（R=記録 F=フリーズ M=記録なし P=未定）
            val recent  = prefs.getString("${k}Recent", "") ?: ""

            val today = LocalDate.now()
            // 最後の同期から何日経ったか（アプリを開いていない日の分だけ表示をずらす）
            val daysSince = lastUpdated?.let { ChronoUnit.DAYS.between(it, today).toInt() } ?: 0
            val doneOnLastSync = prefs.getBoolean("${k}Done", false)
            val doneToday = daysSince == 0 && doneOnLastSync

            // 同期していない日は記録なしとして、streak.ts と同じ規則でフリーズ・途切れを当てはめる
            var streak = savedStreak
            var freezes = savedFreezes
            val gapStatus = HashMap<LocalDate, Char>()
            if (lastUpdated != null && daysSince > 0 && streak >= 0 && freezes >= 0) {
                var week = weekStart(lastUpdated)
                // 同期した日に記録済みならその日は記録あり。まだなら翌日以降と同じく記録なし扱い
                var d = if (doneOnLastSync) lastUpdated.plusDays(1) else lastUpdated
                while (d.isBefore(today)) {
                    val w = weekStart(d)
                    if (w != week) { week = w; freezes = FREEZES_PER_WEEK }
                    if (streak > 0 && freezes > 0) {
                        freezes--
                        gapStatus[d] = 'F'
                    } else {
                        streak = 0
                        freezes = FREEZES_PER_WEEK // 途切れたらフリーズの使用回数はリセット
                        gapStatus[d] = 'M'
                    }
                    d = d.plusDays(1)
                }
                if (weekStart(today) != week) freezes = FREEZES_PER_WEEK
            }

            val views = RemoteViews(context.packageName, R.layout.widget_exercise)
            views.setTextViewText(R.id.ex_title, category.title)

            // 背景色で今日の状態を伝える（済み=緑、連続中でまだ=オレンジ〜赤、途切れている=グレー）
            views.setInt(
                R.id.ex_root, "setBackgroundResource",
                when {
                    doneToday -> R.drawable.widget_exercise_bg_done
                    streak > 0 -> R.drawable.widget_exercise_bg_pending
                    else -> R.drawable.widget_exercise_bg_idle
                }
            )

            views.setTextViewText(R.id.ex_streak, if (streak >= 0) "🔥$streak" else "🔥--")
            views.setTextViewText(
                R.id.ex_best,
                (if (best >= 0) "最長${best}日" else "最長--日") + (if (freezes >= 0) "・🧊$freezes" else "")
            )
            views.setTextViewText(
                R.id.ex_status,
                when {
                    doneToday -> "日連続・今日も達成！"
                    streak > 0 -> "日連続・途切れさせないで！"
                    else -> "今日から連続記録スタート"
                }
            )

            for (i in 0 until 7) {
                val date = today.minusDays((6 - i).toLong())
                val index = i + daysSince
                val status = when {
                    date == today && doneToday -> 'R'
                    date == today -> 'P'
                    gapStatus.containsKey(date) -> gapStatus.getValue(date)
                    index in 0 until 7 && index < recent.length ->
                        recent[index].let { if (it == 'P') 'M' else it } // 同期時点で未定だった日は記録なし扱い
                    else -> 'M'
                }
                views.setTextViewText(DAY_IDS[i], when (status) {
                    'R' -> "✓"
                    'F' -> "🧊"
                    'P' -> "○"
                    else -> "・"
                })
                views.setTextColor(DAY_IDS[i], Color.parseColor(
                    when (status) {
                        'R', 'P' -> "#FFFFFF"
                        'F' -> "#E1F5FE"
                        else -> "#88FFFFFF"
                    }
                ))
            }

            // タップでそのカテゴリの画面を開く
            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(WidgetPlugin.EXTRA_ROUTE, category.route)
            }
            val pending = PendingIntent.getActivity(
                context, category.requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.ex_root, pending)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}

/** 運動の連続記録（配置済みのウィジェットが消えないよう、クラス名は従来のまま） */
class ExerciseWidget : StreakWidget(StreakCategory.EXERCISE)

/** 食事の連続記録 */
class MealStreakWidget : StreakWidget(StreakCategory.MEAL)

/** 体重・睡眠（Health Connect）の連続記録 */
class BodyStreakWidget : StreakWidget(StreakCategory.BODY)

/** 習慣（セルフケア）の連続記録 */
class HabitStreakWidget : StreakWidget(StreakCategory.HABIT)
