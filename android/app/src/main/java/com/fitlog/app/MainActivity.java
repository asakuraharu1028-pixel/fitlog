package com.fitlog.app;

import android.Manifest;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
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
        registerPlugin(WidgetPlugin.class);
        super.onCreate(savedInstanceState);

        // WebView からのカメラ権限リクエストを許可
        WebView webView = getBridge().getWebView();
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                requestPermissions(
                    new String[]{Manifest.permission.CAMERA},
                    0
                );
                request.grant(request.getResources());
            }
        });

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
