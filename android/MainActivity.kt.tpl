package __PKG__

import android.graphics.Color
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
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    WindowCompat.setDecorFitsSystemWindows(window, false)
    super.onCreate(savedInstanceState)
    window.decorView.setBackgroundColor(Color.parseColor("#0d0f13"))
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
      WindowInsetsCompat.CONSUMED
    }
    ViewCompat.requestApplyInsets(content)
  }

  override fun onWebViewCreate(webView: WebView) {
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
  }
}
