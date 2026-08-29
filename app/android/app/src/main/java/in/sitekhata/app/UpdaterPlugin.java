package in.sitekhata.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Updating a sideloaded app from the phone itself.
 *
 * There is no silent path here and there should not be: Android will not let
 * an app replace itself without the person watching it happen. So this plugin
 * does the two things the web layer cannot — read the version actually
 * installed, and hand a downloaded file to the system installer — and the
 * last tap stays his.
 *
 * Everything else (asking GitHub what the newest build is, downloading it,
 * showing him the prompt) is ordinary JavaScript in src/lib/update.ts.
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {

    /** What is installed right now, so the web layer can compare. */
    @PluginMethod
    public void current(PluginCall call) {
        JSObject out = new JSObject();
        try {
            PackageInfo info = getContext().getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? info.getLongVersionCode()
                    : (long) info.versionCode;
            out.put("code", code);
            out.put("name", info.versionName);
            out.put("ok", true);
        } catch (Exception e) {
            out.put("ok", false);
            out.put("error", String.valueOf(e.getMessage()));
        }
        call.resolve(out);
    }

    /**
     * Whether this app is allowed to hand the installer a file. On Android 8
     * and up it is a per-app switch the person has to turn on once; before
     * that it was a single system-wide setting and nothing to check.
     */
    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean ok;
        try {
            ok = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                    || getContext().getPackageManager().canRequestPackageInstalls();
        } catch (Exception e) {
            ok = false;
        }
        JSObject out = new JSObject();
        out.put("value", ok);
        call.resolve(out);
    }

    /** Opens the one settings page where that switch lives. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("এই ফোনে ওই সেটিংসটা খোলা গেল না", e);
        }
    }

    /**
     * Hand the downloaded file to the system installer. He sees Android's own
     * install screen and taps Install; nothing is replaced behind his back.
     */
    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("ফাইলের ঠিকানা পাওয়া গেল না");
            return;
        }
        if (path.startsWith("file://")) path = path.substring(7);

        File apk = new File(path);
        if (!apk.exists() || apk.length() == 0) {
            call.reject("ফাইলটা পাওয়া গেল না");
            return;
        }

        try {
            Uri uri = FileProvider.getUriForFile(
                    getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()), e);
        }
    }
}
