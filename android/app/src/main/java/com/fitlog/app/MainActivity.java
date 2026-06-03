package com.fitlog.app;

import android.os.Bundle;
import androidx.activity.result.ActivityResultLauncher;
import androidx.health.connect.client.PermissionController;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.util.Set;

public class MainActivity extends BridgeActivity {
    public static ActivityResultLauncher<Set<String>> healthPermissionsLauncher;
    public static PluginCall pendingHealthCall;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HealthConnectPlugin.class);
        super.onCreate(savedInstanceState);

        healthPermissionsLauncher = registerForActivityResult(
            PermissionController.createRequestPermissionResultContract(),
            granted -> {
                android.util.Log.d("FitLog-HC", "Permission result: " + granted);
                if (pendingHealthCall != null) {
                    JSObject result = new JSObject();
                    result.put("granted", granted != null && !granted.isEmpty());
                    pendingHealthCall.resolve(result);
                    pendingHealthCall = null;
                }
            }
        );
    }
}
