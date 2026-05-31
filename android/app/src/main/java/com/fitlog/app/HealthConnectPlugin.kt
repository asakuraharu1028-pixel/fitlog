package com.fitlog.app

import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Mass
import androidx.health.connect.client.units.Percentage
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.*

@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {

    private val scope = CoroutineScope(Dispatchers.IO)

    private val PERMISSIONS = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getWritePermission(WeightRecord::class),
        HealthPermission.getReadPermission(BodyFatRecord::class),
        HealthPermission.getWritePermission(BodyFatRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getWritePermission(SleepSessionRecord::class),
    )

    @PluginMethod
    fun checkAvailability(call: PluginCall) {
        val status = HealthConnectClient.getSdkStatus(context)
        val result = JSObject()
        result.put("status", when (status) {
            HealthConnectClient.SDK_AVAILABLE -> "available"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "needsUpdate"
            else -> "unavailable"
        })
        call.resolve(result)
    }

    // パーミッションが許可済みか確認する
    @PluginMethod
    fun checkHCPermissions(call: PluginCall) {
        if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) {
            val res = JSObject(); res.put("granted", false); call.resolve(res); return
        }
        scope.launch {
            try {
                val client = HealthConnectClient.getOrCreate(context)
                val granted = client.permissionController.getGrantedPermissions()
                val res = JSObject()
                res.put("granted", granted.containsAll(PERMISSIONS))
                withContext(Dispatchers.Main) { call.resolve(res) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { call.reject(e.message ?: "unknown error") }
            }
        }
    }

    // パーミッション画面を開き、結果を返す
    @PluginMethod
    fun requestHCPermissions(call: PluginCall) {
        try {
            if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) {
                call.reject("Health Connect not available"); return
            }
            call.setKeepAlive(true)
            MainActivity.pendingHealthCall = call
            activity.runOnUiThread {
                android.util.Log.d("FitLog-HC", "Launching permissions. Set size=${PERMISSIONS.size}, perms=$PERMISSIONS")
                val launcher = MainActivity.healthPermissionsLauncher
                if (launcher == null) {
                    android.util.Log.e("FitLog-HC", "Launcher is null!")
                    call.reject("Launcher not initialized")
                    MainActivity.pendingHealthCall = null
                } else {
                    launcher.launch(PERMISSIONS)
                    android.util.Log.d("FitLog-HC", "launch() called")
                }
            }
        } catch (e: Exception) {
            call.reject(e.message ?: "failed to open permissions")
        }
    }

    @PluginMethod
    fun readSteps(call: PluginCall) {
        val startStr = call.getString("startDate") ?: return call.reject("startDate required")
        val endStr   = call.getString("endDate")   ?: return call.reject("endDate required")
        scope.launch {
            try {
                val client = HealthConnectClient.getOrCreate(context)
                val start = LocalDate.parse(startStr).atStartOfDay(ZoneId.systemDefault()).toInstant()
                val end   = LocalDate.parse(endStr).plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant()
                val response = client.readRecords(
                    ReadRecordsRequest(StepsRecord::class, TimeRangeFilter.between(start, end))
                )
                val arr = JSArray()
                for (r in response.records) {
                    val obj = JSObject()
                    obj.put("date", r.startTime.atZone(ZoneId.systemDefault()).toLocalDate().toString())
                    obj.put("steps", r.count)
                    arr.put(obj)
                }
                val res = JSObject(); res.put("data", arr)
                withContext(Dispatchers.Main) { call.resolve(res) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { call.reject(e.message) }
            }
        }
    }

    @PluginMethod
    fun readWeight(call: PluginCall) {
        val startStr = call.getString("startDate") ?: return call.reject("startDate required")
        val endStr   = call.getString("endDate")   ?: return call.reject("endDate required")
        scope.launch {
            try {
                val client = HealthConnectClient.getOrCreate(context)
                val start = LocalDate.parse(startStr).atStartOfDay(ZoneId.systemDefault()).toInstant()
                val end   = LocalDate.parse(endStr).plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant()
                val response = client.readRecords(
                    ReadRecordsRequest(WeightRecord::class, TimeRangeFilter.between(start, end))
                )
                val arr = JSArray()
                for (r in response.records) {
                    val obj = JSObject()
                    obj.put("date", r.time.atZone(ZoneId.systemDefault()).toLocalDate().toString())
                    obj.put("weightKg", r.weight.inKilograms)
                    arr.put(obj)
                }
                val res = JSObject(); res.put("data", arr)
                withContext(Dispatchers.Main) { call.resolve(res) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { call.reject(e.message) }
            }
        }
    }

    @PluginMethod
    fun writeWeight(call: PluginCall) {
        val date     = call.getString("date")     ?: return call.reject("date required")
        val weightKg = call.getDouble("weightKg") ?: return call.reject("weightKg required")
        scope.launch {
            try {
                val client = HealthConnectClient.getOrCreate(context)
                val instant = LocalDate.parse(date).atTime(8, 0).atZone(ZoneId.systemDefault()).toInstant()
                client.insertRecords(listOf(
                    WeightRecord(
                        time = instant,
                        zoneOffset = ZoneId.systemDefault().rules.getOffset(instant),
                        weight = Mass.kilograms(weightKg),
                        metadata = Metadata.manualEntry()
                    )
                ))
                withContext(Dispatchers.Main) { call.resolve(JSObject()) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { call.reject(e.message) }
            }
        }
    }

    @PluginMethod
    fun readSleep(call: PluginCall) {
        val startStr = call.getString("startDate") ?: return call.reject("startDate required")
        val endStr   = call.getString("endDate")   ?: return call.reject("endDate required")
        scope.launch {
            try {
                val client = HealthConnectClient.getOrCreate(context)
                val start = LocalDate.parse(startStr).atStartOfDay(ZoneId.systemDefault()).toInstant()
                val end   = LocalDate.parse(endStr).plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant()
                val response = client.readRecords(
                    ReadRecordsRequest(SleepSessionRecord::class, TimeRangeFilter.between(start, end))
                )
                val arr = JSArray()
                for (r in response.records) {
                    val durationMin = Duration.between(r.startTime, r.endTime).toMinutes()
                    val obj = JSObject()
                    obj.put("date", r.startTime.atZone(ZoneId.systemDefault()).toLocalDate().toString())
                    obj.put("startTime", r.startTime.toString())
                    obj.put("endTime", r.endTime.toString())
                    obj.put("durationMin", durationMin)
                    arr.put(obj)
                }
                val res = JSObject(); res.put("data", arr)
                withContext(Dispatchers.Main) { call.resolve(res) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { call.reject(e.message) }
            }
        }
    }

    @PluginMethod
    fun writeSleep(call: PluginCall) {
        val startTime = call.getString("startTime") ?: return call.reject("startTime required")
        val endTime   = call.getString("endTime")   ?: return call.reject("endTime required")
        scope.launch {
            try {
                val client = HealthConnectClient.getOrCreate(context)
                val start = Instant.parse(startTime)
                val end   = Instant.parse(endTime)
                client.insertRecords(listOf(
                    SleepSessionRecord(
                        startTime = start,
                        startZoneOffset = ZoneId.systemDefault().rules.getOffset(start),
                        endTime = end,
                        endZoneOffset = ZoneId.systemDefault().rules.getOffset(end),
                        metadata = Metadata.manualEntry()
                    )
                ))
                withContext(Dispatchers.Main) { call.resolve(JSObject()) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { call.reject(e.message) }
            }
        }
    }

    @PluginMethod
    fun writeBodyFat(call: PluginCall) {
        val date       = call.getString("date")         ?: return call.reject("date required")
        val bodyFatPct = call.getDouble("bodyFatPct")   ?: return call.reject("bodyFatPct required")
        scope.launch {
            try {
                val client = HealthConnectClient.getOrCreate(context)
                val instant = LocalDate.parse(date).atTime(8, 0).atZone(ZoneId.systemDefault()).toInstant()
                client.insertRecords(listOf(
                    BodyFatRecord(
                        time = instant,
                        zoneOffset = ZoneId.systemDefault().rules.getOffset(instant),
                        percentage = Percentage(bodyFatPct),
                        metadata = Metadata.manualEntry()
                    )
                ))
                withContext(Dispatchers.Main) { call.resolve(JSObject()) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { call.reject(e.message) }
            }
        }
    }

    @PluginMethod
    fun readBodyFat(call: PluginCall) {
        val startStr = call.getString("startDate") ?: return call.reject("startDate required")
        val endStr   = call.getString("endDate")   ?: return call.reject("endDate required")
        scope.launch {
            try {
                val client = HealthConnectClient.getOrCreate(context)
                val start = LocalDate.parse(startStr).atStartOfDay(ZoneId.systemDefault()).toInstant()
                val end   = LocalDate.parse(endStr).plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant()
                val response = client.readRecords(
                    ReadRecordsRequest(BodyFatRecord::class, TimeRangeFilter.between(start, end))
                )
                val arr = JSArray()
                for (r in response.records) {
                    val obj = JSObject()
                    obj.put("date", r.time.atZone(ZoneId.systemDefault()).toLocalDate().toString())
                    obj.put("bodyFatPct", r.percentage.value)
                    arr.put(obj)
                }
                val res = JSObject(); res.put("data", arr)
                withContext(Dispatchers.Main) { call.resolve(res) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { call.reject(e.message) }
            }
        }
    }
}
