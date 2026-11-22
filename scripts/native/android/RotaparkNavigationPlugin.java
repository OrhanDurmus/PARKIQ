package tr.com.rotapark.app;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.Manifest;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Preparation-only bridge. Intentionally not registered in release builds.
 * Never reports Google guidance as available until the SDK adapter is installed.
 */
@CapacitorPlugin(name = "RotaparkNavigation")
public class RotaparkNavigationPlugin extends Plugin {
    private static final String SDK_FLAG = "rotapark.navigation.sdk.enabled";
    private boolean enabled() {
        try {
            android.content.pm.ApplicationInfo info = getContext().getPackageManager().getApplicationInfo(
                getContext().getPackageName(), PackageManager.GET_META_DATA);
            return info.metaData != null && info.metaData.getBoolean(SDK_FLAG, false);
        } catch (PackageManager.NameNotFoundException e) { return false; }
    }

    @PluginMethod
    public void getCapabilities(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", enabled());
        result.put("reason", enabled() ? "READY_FOR_DEVICE_VALIDATION" : "SDK_NOT_CONFIGURED");
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        Double latitude = call.getDouble("latitude");
        Double longitude = call.getDouble("longitude");
        if (latitude == null || longitude == null ||
                !Double.isFinite(latitude) || !Double.isFinite(longitude) ||
                Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
            call.reject("Invalid destination coordinates", "INVALID_DESTINATION");
            return;
        }
        if (!enabled()) {
            call.reject("Google navigation is not configured", "SDK_NOT_CONFIGURED");
            return;
        }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            call.reject("Precise location permission required", "LOCATION_PERMISSION_REQUIRED");
            return;
        }
        if (RotaparkGuidanceActivity.isActive()) {
            call.reject("Navigation session already active", "NAVIGATION_ALREADY_ACTIVE");
            return;
        }
        Intent intent = new Intent(getContext(), RotaparkGuidanceActivity.class);
        intent.putExtra("latitude", latitude);
        intent.putExtra("longitude", longitude);
        getActivity().startActivity(intent);
        JSObject result = new JSObject();
        result.put("launched", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        RotaparkGuidanceActivity.stopActive();
        JSObject result = new JSObject();
        result.put("active", false);
        call.resolve(result);
    }
}
