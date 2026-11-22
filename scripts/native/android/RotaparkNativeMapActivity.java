package tr.com.rotapark.app;

import android.app.Activity;
import android.os.Bundle;
import android.widget.FrameLayout;
import com.mapbox.maps.MapView;
import com.mapbox.maps.Style;

/**
 * First native Android map surface for ROTAPARK Staging.
 * No WebView, no navigation claims: parking data and guidance are later milestones.
 */
public final class RotaparkNativeMapActivity extends Activity {
    private MapView mapView;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        mapView = new MapView(this);
        FrameLayout root = new FrameLayout(this);
        root.addView(mapView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        mapView.getMapboxMap().loadStyleUri(Style.SATELLITE_STREETS);
    }

    @Override protected void onStart() { super.onStart(); if (mapView != null) mapView.onStart(); }
    @Override protected void onStop() { if (mapView != null) mapView.onStop(); super.onStop(); }
    @Override public void onLowMemory() { super.onLowMemory(); if (mapView != null) mapView.onLowMemory(); }
    @Override protected void onDestroy() { if (mapView != null) mapView.onDestroy(); super.onDestroy(); }
}
