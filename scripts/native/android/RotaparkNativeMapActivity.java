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
        notice.setText("Native harita önizlemesi • Otopark verileri henüz bağlı değil");
        notice.setTextColor(Color.WHITE);
        notice.setTextSize(12);
        notice.setGravity(Gravity.CENTER);
        notice.setPadding(dp(12), dp(12), dp(12), dp(12));
        notice.setBackgroundColor(Color.rgb(24, 24, 24));
        FrameLayout.LayoutParams noticeParams = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        root.addView(notice, noticeParams);
        setContentView(root);
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    @Override protected void onStart() { super.onStart(); if (mapView != null) mapView.onStart(); }
    @Override protected void onStop() { if (mapView != null) mapView.onStop(); super.onStop(); }
    @Override public void onLowMemory() { super.onLowMemory(); if (mapView != null) mapView.onLowMemory(); }
    @Override protected void onDestroy() { if (mapView != null) mapView.onDestroy(); super.onDestroy(); }
}
