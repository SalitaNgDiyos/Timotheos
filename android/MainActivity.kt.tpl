// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
package __PKG__

import android.app.Activity
import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.PowerManager
import android.graphics.Color
import android.net.Uri
import android.provider.Settings
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import java.io.File

// Android 15 draws every app under the status bar and the navigation bar. The web view is kept between them:
// the content view gets the size of the bars (and of the keyboard) as padding, and the page tells us which colour
// to paint behind the bars and whether their icons must be light or dark (TwBars.set).
// On the Bible view the page asks for the navigation bar to be see-through (TwBars.edge(true)): the web view then
// reaches the bottom of the screen and the text runs under the bar; the page learns the bar's height as --nav-h.
class MainActivity : TauriActivity() {
  private var web: WebView? = null
  private var content: View? = null
  private var lastInsets: WindowInsetsCompat? = null
  private var edge = false

  override fun onCreate(savedInstanceState: Bundle?) {
    WindowCompat.setDecorFitsSystemWindows(window, false)
    super.onCreate(savedInstanceState)
    window.decorView.setBackgroundColor(Color.parseColor("#0d0f13"))
    @Suppress("DEPRECATION") window.navigationBarColor = Color.TRANSPARENT
    if (Build.VERSION.SDK_INT >= 29) window.isNavigationBarContrastEnforced = false   // no grey veil behind the buttons
    val c = findViewById<View>(android.R.id.content); content = c
    ViewCompat.setOnApplyWindowInsetsListener(c) { v, insets -> lastInsets = insets; pad(v, insets); WindowInsetsCompat.CONSUMED }
    ViewCompat.requestApplyInsets(c)
  }

  private fun pad(v: View, insets: WindowInsetsCompat) {
    val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
    val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
    val bottom = if (ime.bottom > 0) ime.bottom else if (edge) 0 else bars.bottom
    v.setPadding(bars.left, bars.top, bars.right, bottom)
    val h = bars.bottom / resources.displayMetrics.density
    web?.evaluateJavascript("document.documentElement.style.setProperty('--nav-h','${h}px')", null)
  }

  override fun onWebViewCreate(webView: WebView) {
    web = webView
    webView.settings.setSupportZoom(false)          // the page never zooms; a pinch on module text changes its size (see app.js)
    webView.settings.builtInZoomControls = false
    webView.settings.displayZoomControls = false
    webView.addJavascriptInterface(Bars(), "TwBars")
    webView.addJavascriptInterface(Files(), "TwFiles")
    webView.addJavascriptInterface(Speech(), "TwSpeech")
    // what the reading service says goes to the page (window.__twTts), as long as the page is there
    SpeechState.sink = { json -> runOnUiThread { web?.evaluateJavascript("window.__twTts && window.__twTts($json)", null) } }
  }

  override fun onDestroy() {
    SpeechState.sink = null
    super.onDestroy()
  }

  // Exports (topics, verse lists, reading plans): the page writes the file into the app's own "exports" folder and
  // then asks for it to be saved where the user chooses (Android's own "Save to" screen, e.g. Downloads or Drive).
  // The page hears the outcome through window.__twSaved("saved" | "cancelled" | "failed").
  private var pendingSave: File? = null
  private val saveRequest = 7411
  private fun saved(how: String) { web?.evaluateJavascript("window.__twSaved && window.__twSaved('$how')", null) }

  @Deprecated("Deprecated in Java")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode != saveRequest) return
    val src = pendingSave; pendingSave = null
    val uri = data?.data
    if (resultCode != Activity.RESULT_OK || uri == null || src == null) { saved("cancelled"); return }
    try {
      contentResolver.openOutputStream(uri)?.use { out -> src.inputStream().use { it.copyTo(out) } } ?: throw Exception("no stream")
      saved("saved")
    } catch (e: Exception) { saved("failed") }
  }

  // An update that the page has downloaded into the app's cache folder: Android's own installer screen takes it from here
  // (the user taps Install there; Android never installs silently). The first time, Android asks to let this app install apps.
  // The page hears the outcome through window.__twInstall("started" | "permission" | "failed").
  private fun installed(how: String) { web?.evaluateJavascript("window.__twInstall && window.__twInstall('$how')", null) }

  inner class Files {
    @JavascriptInterface
    fun install(path: String) {
      runOnUiThread {
        try {
          val f = File(path).canonicalFile
          // only an .apk inside the app's own cache folder
          if (!f.isFile || !f.name.endsWith(".apk") || !f.path.startsWith(cacheDir.canonicalPath)) { installed("failed"); return@runOnUiThread }
          if (Build.VERSION.SDK_INT >= 26 && !packageManager.canRequestPackageInstalls()) {
            startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
            installed("permission"); return@runOnUiThread
          }
          val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.updates", f)
          val i = Intent(Intent.ACTION_VIEW)
          i.setDataAndType(uri, "application/vnd.android.package-archive")
          i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
          startActivity(i); installed("started")
        } catch (e: Exception) { installed("failed") }
      }
    }

    @JavascriptInterface
    fun saveAs(path: String, name: String) {
      runOnUiThread {
        try {
          val f = File(path).canonicalFile
          // only a file of the app's own exports folder may leave this way
          if (!f.isFile || f.parentFile?.name != "exports") { saved("failed"); return@runOnUiThread }
          pendingSave = f
          val i = Intent(Intent.ACTION_CREATE_DOCUMENT)
          i.addCategory(Intent.CATEGORY_OPENABLE)
          i.type = "application/octet-stream"
          i.putExtra(Intent.EXTRA_TITLE, name)
          @Suppress("DEPRECATION") startActivityForResult(i, saveRequest)
        } catch (e: Exception) { pendingSave = null; saved("failed") }
      }
    }
  }

  // Reading aloud in the background: the playlist goes to SpeechService (a foreground service with its own speech engine, a
  // media notification with lock-screen buttons and a wake lock), so it goes on with the screen off. The page keeps the
  // verse marks and tops the playlist up. allowBackground() asks Android to leave the app out of battery optimisation.
  inner class Speech {
    @JavascriptInterface
    fun start(json: String) {
      runOnUiThread {
        try {
          if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7412)
          SpeechService.begin(this@MainActivity, json)
        } catch (e: Exception) { SpeechState.emit("{\"t\":\"err\",\"msg\":\"Could not start the reading service\"}") }
      }
    }
    @JavascriptInterface fun append(json: String) { runOnUiThread { SpeechService.instance?.append(json) } }
    @JavascriptInterface fun pause() { runOnUiThread { SpeechService.instance?.pause() } }
    @JavascriptInterface fun resume() { runOnUiThread { SpeechService.instance?.resume() } }
    @JavascriptInterface fun stop() { SpeechService.instance?.stopNow() }
    @JavascriptInterface fun next() { runOnUiThread { SpeechService.instance?.skip(1) } }
    @JavascriptInterface fun prev() { runOnUiThread { SpeechService.instance?.skip(-1) } }
    @JavascriptInterface fun state(): String = "{\"playing\":" + SpeechState.playing + ",\"paused\":" + SpeechState.paused + ",\"idx\":" + SpeechState.index + ",\"total\":" + SpeechState.total + "}"
    @JavascriptInterface fun snapshot(): String = SpeechState.snapshot
    @JavascriptInterface
    fun batteryOk(): Boolean = try { (getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(packageName) } catch (e: Exception) { true }
    @JavascriptInterface
    fun allowBackground() {
      runOnUiThread {
        try { startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))) }
        catch (e: Exception) {
          try { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) } catch (x: Exception) { /* no settings screen */ }
        }
      }
    }
  }

  inner class Bars {
    @JavascriptInterface
    fun set(color: String, lightBackground: Boolean) {
      runOnUiThread {
        try {
          window.decorView.setBackgroundColor(Color.parseColor(color))
          val c = WindowCompat.getInsetsController(window, window.decorView)
          c.isAppearanceLightStatusBars = lightBackground
          c.isAppearanceLightNavigationBars = lightBackground
        } catch (e: Exception) { /* keep the colours as they are */ }
      }
    }

    @JavascriptInterface
    fun edge(on: Boolean) {
      runOnUiThread {
        edge = on
        val v = content; val i = lastInsets
        if (v != null && i != null) pad(v, i)
      }
    }
  }
}

// the file provider that hands a downloaded update to Android's installer (declared in the manifest by the build)
class UpdateFileProvider : FileProvider()
