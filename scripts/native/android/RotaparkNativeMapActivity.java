package tr.com.rotapark.app;

import androidx.activity.ComponentActivity;
import android.graphics.Color;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.widget.ScrollView;
import android.graphics.Typeface;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.mapbox.maps.MapView;
import com.mapbox.maps.Style;
import com.mapbox.maps.CameraOptions;
import com.mapbox.geojson.Point;
import com.mapbox.bindgen.Value;
import com.mapbox.bindgen.Expected;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Staging-only native map shell. Parking data and turn-by-turn navigation are not wired yet. */
public final class RotaparkNativeMapActivity extends ComponentActivity {
    private static final String TAG = "ROTAPARK_NATIVE";
    private MapView mapView;
    private final StringBuilder diagnostics = new StringBuilder();
    private TextView diagnosticsText;
    private void record(String message) {
        Log.i(TAG, message);
        diagnostics.append(message).append('\n');
        if (diagnosticsText != null) diagnosticsText.setText(diagnostics.toString());
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        mapView = new MapView(this);
        FrameLayout root = new FrameLayout(this);
        root.addView(mapView, new FrameLayout.LayoutParams(-1, -1));
        // Show a useful Istanbul fallback without waiting for GPS permission.
        mapView.getMapboxMap().setCamera(new CameraOptions.Builder()
                .center(Point.fromLngLat(29.0, 41.02))
                .zoom(12.0)
                .build());
        // Observe the actual Mapbox style/resource lifecycle; never log the token value.
        int tokenId = getResources().getIdentifier("mapbox_access_token", "string", getPackageName());
        String token = tokenId == 0 ? "" : getString(tokenId);
        record("Token present=" + token.startsWith("pk.") + ", style=" + Style.SATELLITE_STREETS);
        mapView.getMapboxMap().subscribeMapLoadingError(event ->
                record("MAP_LOADING_ERROR: " + event));
        mapView.getMapboxMap().subscribeStyleLoaded(event ->
                record("STYLE_LOADED: " + event));
        // A loaded style is not proof that the first map frame was rendered.
        mapView.getMapboxMap().subscribeMapLoaded(event ->
                record("MAP_LOADED: " + event));
        mapView.addOnLayoutChangeListener((v, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) ->
                record("MAP_VIEW_LAYOUT: width=" + (right - left)
                        + ", height=" + (bottom - top)
                        + ", shown=" + v.isShown()
                        + ", alpha=" + v.getAlpha()
                        + ", visibility=" + v.getVisibility()));
        mapView.getMapboxMap().loadStyleUri(Style.SATELLITE_STREETS, style ->
                record("STYLE_CALLBACK: satellite-streets style available"));

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(16), dp(12), dp(16), dp(12));
        header.setBackgroundColor(Color.rgb(15, 15, 15));

        TextView back = new TextView(this);
        back.setText("‹  Geri");
        back.setTextColor(Color.rgb(225, 184, 88));
        back.setTextSize(18);
        back.setContentDescription("Önceki ekrana dön");
        back.setOnClickListener(v -> finish());
        header.addView(back, new LinearLayout.LayoutParams(dp(88), dp(48)));

        TextView title = new TextView(this);
        title.setText("ROTAPARK");
        title.setTextColor(Color.rgb(225, 184, 88));
        title.setTextSize(20);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        header.addView(title, new LinearLayout.LayoutParams(0, dp(48), 1));

        TextView stage = new TextView(this);
        stage.setText("STAGING");
        stage.setTextColor(Color.WHITE);
        stage.setTextSize(11);
        stage.setGravity(Gravity.CENTER);
        header.addView(stage, new LinearLayout.LayoutParams(dp(88), dp(48)));

        FrameLayout.LayoutParams headerParams = new FrameLayout.LayoutParams(-1, -2, Gravity.TOP);
        root.addView(header, headerParams);

        TextView notice = new TextView(this);
        notice.setText("Native harita • Otopark verileri okunuyor…");
        loadParkingSummary(notice);
        notice.setTextColor(Color.WHITE);
        notice.setTextSize(12);
        notice.setGravity(Gravity.CENTER);
        notice.setPadding(dp(12), dp(12), dp(12), dp(12));
        notice.setBackgroundColor(Color.rgb(24, 24, 24));
        FrameLayout.LayoutParams noticeParams = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        root.addView(notice, noticeParams);
        TextView diagnosticsButton = new TextView(this);
        diagnosticsButton.setText("TEŞHİS / KOPYALA");
        diagnosticsButton.setTextColor(Color.WHITE);
        diagnosticsButton.setTextSize(14);
        diagnosticsButton.setGravity(Gravity.CENTER);
        diagnosticsButton.setBackgroundColor(Color.rgb(15, 15, 15));
        FrameLayout.LayoutParams buttonParams = new FrameLayout.LayoutParams(dp(180), dp(48), Gravity.TOP | Gravity.RIGHT);
        buttonParams.topMargin = dp(72);
        root.addView(diagnosticsButton, buttonParams);
        ScrollView diagnosticPanel = new ScrollView(this);
        diagnosticPanel.setBackgroundColor(Color.rgb(20, 20, 20));
        diagnosticsText = new TextView(this);
        diagnosticsText.setTextColor(Color.WHITE);
        diagnosticsText.setTextSize(12);
        diagnosticsText.setPadding(dp(12), dp(12), dp(12), dp(12));
        diagnosticsText.setText("ROTAPARK STAGING DIAGNOSTICS\\n" + diagnostics);
        diagnosticPanel.addView(diagnosticsText);
        FrameLayout.LayoutParams panelParams = new FrameLayout.LayoutParams(-1, dp(280), Gravity.BOTTOM);
        panelParams.bottomMargin = dp(65);
        root.addView(diagnosticPanel, panelParams);
        diagnosticPanel.setVisibility(View.GONE);
        diagnosticsButton.setOnClickListener(v -> {
            if (diagnosticPanel.getVisibility() == View.GONE) {
                diagnosticPanel.setVisibility(View.VISIBLE);
                diagnosticsButton.setText("KOPYALA / KAPAT");
            } else {
                ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                clipboard.setPrimaryClip(ClipData.newPlainText("ROTAPARK diagnostics", diagnostics.toString()));
                diagnosticPanel.setVisibility(View.GONE);
                diagnosticsButton.setText("TEŞHİS / KOPYALA");
            }
        });
        record("DIAGNOSTICS_READY");
        setContentView(root);
    }

    /** Reads the packaged national parking data without WebView or a network request. */
    private void loadParkingSummary(TextView notice) {
        new Thread(() -> {
            String status;
            try (InputStream stream = getAssets().open("rotapark-parking.json");
                 ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[16384];
                int length;
                while ((length = stream.read(chunk)) != -1) buffer.write(chunk, 0, length);
                String json = buffer.toString(StandardCharsets.UTF_8.name());
                Object root = new org.json.JSONTokener(json).nextValue();
                JSONArray points = null;
                if (root instanceof JSONArray) points = (JSONArray) root;
                else if (root instanceof JSONObject) {
                    JSONObject obj = (JSONObject) root;
                    for (String key : new String[]{"points", "parkings", "parking", "features", "data", "items"}) {
                        JSONArray candidate = obj.optJSONArray(key);
                        if (candidate != null) { points = candidate; break; }
                    }
                }
                if (points == null) status = "Otopark veri formatı kontrol edilmeli";
                else {
                    JSONArray features = new JSONArray();
                    for (int i = 0; i < points.length(); i++) {
                        JSONObject item = points.optJSONObject(i);
                        if (item == null) continue;
                        JSONObject geometry = item.optJSONObject("geometry");
                        JSONArray coords = geometry == null ? null : geometry.optJSONArray("coordinates");
                        double lat = item.optDouble("lat", item.optDouble("latitude", Double.NaN));
                        double lng = item.optDouble("lng", item.optDouble("lon", item.optDouble("longitude", Double.NaN)));
                        if (coords != null && coords.length() >= 2) {
                            lng = coords.optDouble(0, Double.NaN);
                            lat = coords.optDouble(1, Double.NaN);
                        }
                        if (!Double.isFinite(lat) || !Double.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
                        JSONObject point = new JSONObject().put("type", "Point")
                            .put("coordinates", new JSONArray().put(lng).put(lat));
                        features.put(new JSONObject().put("type", "Feature").put("geometry", point)
                            .put("properties", new JSONObject()));
                    }
                    JSONObject geojson = new JSONObject().put("type", "FeatureCollection").put("features", features);
                    JSONObject source = new JSONObject().put("type", "geojson").put("data", geojson);
                    JSONObject paint = new JSONObject().put("circle-radius", 5)
                        .put("circle-color", "#D4AF37").put("circle-stroke-width", 1.5)
                        .put("circle-stroke-color", "#111111");
                    JSONObject layer = new JSONObject().put("id", "rotapark-parking-circles")
                        .put("type", "circle").put("source", "rotapark-parking-source").put("paint", paint);
                    final String sourceJson = source.toString(), layerJson = layer.toString();
                    final int validCount = features.length(), totalCount = points.length();
                    runOnUiThread(() -> {
                        if (isFinishing() || isDestroyed()) return;
                        mapView.getMapboxMap().getStyle(style -> {
                            try {
                                Expected<String, Value> src = Value.fromJson(sourceJson);
                                Expected<String, Value> lyr = Value.fromJson(layerJson);
                                if (src.getValue() == null || lyr.getValue() == null) throw new IllegalStateException("Invalid style JSON");
                                if (style.addStyleSource("rotapark-parking-source", src.getValue()).getError() != null)
                                    throw new IllegalStateException("Mapbox rejected parking source");
                                if (style.addStyleLayer(lyr.getValue(), null).getError() != null)
                                    throw new IllegalStateException("Mapbox rejected parking layer");
                                notice.setText("Native otopark pinleri: " + validCount + " / " + totalCount);
                            } catch (Exception ex) {
                                android.util.Log.e("ROTAPARK_NATIVE", "Parking layer failed", ex);
                                notice.setText("Otopark pin katmanı yüklenemedi");
                            }
                        });
                    });
                    status = null; // The style callback owns the final pin count or error message.
                }
            } catch (Exception error) {
                android.util.Log.e("ROTAPARK_NATIVE", "Parking asset read failed", error);
                status = "Otopark verisi okunamadı";
            }
            final String result = status;
            if (result != null) runOnUiThread(() -> { if (!isFinishing() && !isDestroyed()) notice.setText(result); });
        }, "rotapark-parking-load").start();
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    // ComponentActivity is a LifecycleOwner; Mapbox v11 manages MapView lifecycle automatically.
    // Do not forward onStart/onStop/onDestroy manually: it double-dispatches lifecycle events.
}
