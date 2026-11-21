package tr.com.rotapark.app;

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
    @PluginMethod
    public void getCapabilities(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", false);
        result.put("reason", "SDK_NOT_CONFIGURED");
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
        call.reject("Google navigation is not configured", "SDK_NOT_CONFIGURED");
    }

    @PluginMethod
    public void stop(PluginCall call) {
        JSObject result = new JSObject();
        result.put("active", false);
        call.resolve(result);
    }
}
