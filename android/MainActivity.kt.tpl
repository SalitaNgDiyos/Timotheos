package __PKG__

import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

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
    webView.addJavascriptInterface(Bars(), "TwBars")
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
