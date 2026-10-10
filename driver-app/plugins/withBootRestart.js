/**
 * Expo config plugin: restart GPS tracking automatically after the phone is switched back on.
 *
 * Android sends BOOT_COMPLETED when the phone finishes starting. A small receiver catches it and
 * starts a headless JS task ("TrucksyBootRestart", see src/lib/boot.ts). That task restarts the
 * background location service if the driver was online and still signed in.
 * Android allows a location foreground service to start right after boot, which is why this works
 * without the driver opening the app.
 */
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const RECEIVER = '.TrucksyBootReceiver';
const SERVICE = '.TrucksyBootService';

function kotlin(pkg) {
  return {
    'TrucksyBootReceiver.kt': `package ${pkg}

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService

/** Phone switched back on (or app updated): ask JS to resume tracking. */
class TrucksyBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_LOCKED_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      "android.intent.action.QUICKBOOT_POWERON",
      "com.htc.intent.action.QUICKBOOT_POWERON" -> {
        try {
          context.startService(Intent(context, TrucksyBootService::class.java))
          HeadlessJsTaskService.acquireWakeLockNow(context)
        } catch (_: Exception) {
          // Never crash on boot. Tracking resumes next time the driver opens the app.
        }
      }
    }
  }
}
`,
    'TrucksyBootService.kt': `package ${pkg}

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/** Runs the JS task "TrucksyBootRestart" for up to 60 s with no UI. */
class TrucksyBootService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
    HeadlessJsTaskConfig("TrucksyBootRestart", Arguments.createMap(), 60_000L, true)
}
`,
  };
}

const withBootManifest = (config) =>
  withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    AndroidConfig.Permissions.ensurePermissions(manifest, [
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.WAKE_LOCK',
    ]);
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    app.receiver = (app.receiver || []).filter((r) => r.$['android:name'] !== RECEIVER);
    app.receiver.push({
      $: { 'android:name': RECEIVER, 'android:enabled': 'true', 'android:exported': 'true', 'android:directBootAware': 'false' },
      'intent-filter': [{
        action: [
          'android.intent.action.BOOT_COMPLETED',
          'android.intent.action.LOCKED_BOOT_COMPLETED',
          'android.intent.action.MY_PACKAGE_REPLACED',
          'android.intent.action.QUICKBOOT_POWERON',
          'com.htc.intent.action.QUICKBOOT_POWERON',
        ].map((n) => ({ $: { 'android:name': n } })),
      }],
    });
    app.service = (app.service || []).filter((s) => s.$['android:name'] !== SERVICE);
    app.service.push({ $: { 'android:name': SERVICE, 'android:exported': 'false' } });
    return cfg;
  });

const withBootSources = (config) =>
  withDangerousMod(config, ['android', async (cfg) => {
    const pkg = cfg.android && cfg.android.package;
    const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'java', ...pkg.split('.'));
    fs.mkdirSync(dir, { recursive: true });
    for (const [file, src] of Object.entries(kotlin(pkg))) fs.writeFileSync(path.join(dir, file), src);
    return cfg;
  }]);

module.exports = (config) => withBootSources(withBootManifest(config));
