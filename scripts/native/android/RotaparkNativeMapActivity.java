package tr.com.rotapark.app;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.mapbox.maps.MapView;
import com.mapbox.maps.Style;
import com.mapbox.maps.CameraOptions;
import com.mapbox.geojson.Point;
import com.mapbox.geojson.Feature;
import com.mapbox.geojson.FeatureCollection;
import com.mapbox.maps.extension.style.sources.generated.GeoJsonSource;
import com.mapbox.maps.extension.style.layers.generated.CircleLayer;
import com.mapbox.maps.extension.style.StyleExtensionImplKt;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Staging-only native map shell. Parking data and turn-by-turn navigation are not wired yet. */
public final class RotaparkNativeMapActivity extends Activity {
    private MapView mapView;

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
        mapView.getMapboxMap().loadStyleUri(Style.SATELLITE_STREETS);

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
                    List<Feature> features = new ArrayList<>();
                    for (int i = 0; i < points.length(); i++) {
                        JSONObject item = points.optJSONObject(i);
                        if (item == null) continue;
                        JSONObject geometry = item.optJSONObject("geometry");
                        JSONArray coordinates = geometry == null ? null : geometry.optJSONArray("coordinates");
                        double lat = item.optDouble("lat", item.optDouble("latitude", Double.NaN));
                        double lng = item.optDouble("lng", item.optDouble("lon", item.optDouble("longitude", Double.NaN)));
                        if (coordinates != null && coordinates.length() >= 2) {
                            lng = coordinates.optDouble(0, Double.NaN);
                            lat = coordinates.optDouble(1, Double.NaN);
                        }
                        if (!Double.isFinite(lat) || !Double.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
                        features.add(Feature.fromGeometry(Point.fromLngLat(lng, lat)));
                    }
                    final FeatureCollection collection = FeatureCollection.fromFeatures(features);
                    final int count = features.size();
                    runOnUiThread(() -> {
                        if (isFinishing() || isDestroyed()) return;
                        mapView.getMapboxMap().getStyle(style -> {
                            GeoJsonSource source = new GeoJsonSource.Builder("rotapark-parking-source")
                                .featureCollection(collection).build();
                            StyleExtensionImplKt.addSource(style, source);
                            CircleLayer layer = new CircleLayer("rotapark-parking-circles", "rotapark-parking-source");
                            layer.circleRadius(5.0);
                            layer.circleColor("#D4AF37");
                            layer.circleStrokeWidth(1.5);
                            layer.circleStrokeColor("#111111");
                            StyleExtensionImplKt.addLayer(style, layer);
                        });
                    });
                    status = "Native otopark pinleri: " + count + " / " + points.length();
                }
            } catch (Exception error) {
                android.util.Log.e("ROTAPARK_NATIVE", "Parking asset read failed", error);
                status = "Otopark verisi okunamadı";
            }
            final String result = status;
            runOnUiThread(() -> { if (!isFinishing() && !isDestroyed()) notice.setText(result); });
        }, "rotapark-parking-load").start();
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    @Override protected void onStart() { super.onStart(); if (mapView != null) mapView.onStart(); }
    @Override protected void onStop() { if (mapView != null) mapView.onStop(); super.onStop(); }
    @Override public void onLowMemory() { super.onLowMemory(); if (mapView != null) mapView.onLowMemory(); }
    @Override protected void onDestroy() { if (mapView != null) mapView.onDestroy(); super.onDestroy(); }
}
