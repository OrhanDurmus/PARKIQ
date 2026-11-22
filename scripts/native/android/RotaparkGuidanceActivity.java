package tr.com.rotapark.app;

import android.os.Bundle;
import android.Manifest;
import android.content.pm.PackageManager;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.view.View;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import com.google.android.libraries.navigation.NavigationApi;
import com.google.android.libraries.navigation.Navigator;
import com.google.android.libraries.navigation.SupportNavigationFragment;
import com.google.android.libraries.navigation.Waypoint;
import com.google.android.gms.maps.GoogleMap;

/** Experimental native guidance screen; not registered or enabled in production. */
public class RotaparkGuidanceActivity extends AppCompatActivity {
    private Navigator navigator;
    private boolean closed;
    private double latitude;
    private double longitude;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        latitude = getIntent().getDoubleExtra("latitude", Double.NaN);
        longitude = getIntent().getDoubleExtra("longitude", Double.NaN);
        if (!Double.isFinite(latitude) || !Double.isFinite(longitude)
                || Math.abs(latitude) > 90 || Math.abs(longitude) > 180
                || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                    != PackageManager.PERMISSION_GRANTED) {
            fail("Geçerli hedef ve konum izni gerekli");
            return;
        }
        FrameLayout container = new FrameLayout(this);
        container.setId(View.generateViewId());
        setContentView(container);
        SupportNavigationFragment fragment = SupportNavigationFragment.newInstance();
        getSupportFragmentManager().beginTransaction()
                .replace(container.getId(), fragment).commitNow();
        NavigationApi.getNavigator(this, new NavigationApi.NavigatorListener() {
            @Override public void onNavigatorReady(Navigator value) {
                if (closed || isFinishing()) return;
                navigator = value;
                fragment.setNavigationUiEnabled(true);
                fragment.getMapAsync(map -> {
                    if (!closed) map.followMyLocation(GoogleMap.CameraPerspective.TILTED);
                });
                try {
                    Waypoint destination = Waypoint.builder()
                            .setLatLng(latitude, longitude).build();
                    navigator.setDestination(destination).setOnResultListener(status -> {
                        if (closed || isFinishing()) return;
                        if (status == Navigator.RouteStatus.OK) navigator.startGuidance();
                        else fail("Rota oluşturulamadı: " + status);
                    });
                } catch (Exception e) { fail("Navigasyon başlatılamadı"); }
            }
            @Override public void onError(int code) {
                if (!closed) fail("Navigasyon kullanılamıyor: " + code);
            }
        });
    }

    private void fail(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
        setResult(RESULT_CANCELED);
        finish();
    }

    @Override protected void onDestroy() {
        closed = true;
        if (navigator != null) {
            navigator.stopGuidance();
            navigator.clearDestinations();
            navigator.cleanup();
            navigator = null;
        }
        super.onDestroy();
    }
}
