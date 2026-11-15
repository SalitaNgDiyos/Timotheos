// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
package __PKG__

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

// Reading aloud that goes on with the screen off. The page hands over a whole playlist (verse by verse, several chapters
// ahead) and this foreground service speaks it with Android's own text-to-speech, so nothing depends on the web page being
// awake: the service holds audio focus for the whole reading, keeps the CPU awake (wake lock) and shows a media notification
// with previous / pause / next / stop that also appears on the lock screen. Pieces are queued two ahead, so there is no gap
// between verses. The page hears what is being read through SpeechState.sink (window.__twTts).
object SpeechState {
  @Volatile var sink: ((String) -> Unit)? = null
  @Volatile var playing = false
  @Volatile var paused = false
  @Volatile var index = 0
  @Volatile var total = 0
  @Volatile var snapshot = "{}"
  fun emit(json: String) { try { sink?.invoke(json) } catch (e: Exception) { /* the page is gone */ } }
}

class SpeechService : Service() {
  companion object {
    @Volatile var instance: SpeechService? = null
    var pendingStart: String? = null
    const val CHANNEL = "timotheos_speech"
    const val NOTE_ID = 7420
    const val ACT_PAUSE = "org.timotheos.bible.SPEECH_PAUSE"
    const val ACT_PREV = "org.timotheos.bible.SPEECH_PREV"
    const val ACT_NEXT = "org.timotheos.bible.SPEECH_NEXT"
    const val ACT_STOP = "org.timotheos.bible.SPEECH_STOP"
    const val ACT_BEGIN = "org.timotheos.bible.SPEECH_BEGIN"

    fun begin(ctx: Context, json: String) {
      pendingStart = json
      val i = Intent(ctx, SpeechService::class.java).setAction(ACT_BEGIN)
      if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
    }
  }

  private val main = Handler(Looper.getMainLooper())
  private var tts: TextToSpeech? = null
  private var ready = false
  private var failed = false
  private var whenReady: Runnable? = null

  private val pieces = ArrayList<JSONObject>()
  private var loop = false
  private var voiceId = ""
  private var lang = ""
  private var rate = 1f
  private var pitch = 1f
  private var volume = 1f
  private var ctx = ""
  private var label = ""
  private var gen = 0
  private var cur = 0          // the piece being read (counts on past the end of the list when it loops)
  private var queued = -1      // the last piece handed to the engine
  private var playing = false
  private var paused = false
  private var focusAt = 0L
  private var session: MediaSession? = null
  private var wake: PowerManager.WakeLock? = null
  private var focusReq: AudioFocusRequest? = null
  private var wasPlayingBeforeLoss = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26) {
      val ch = NotificationChannel(CHANNEL, "Reading aloud", NotificationManager.IMPORTANCE_LOW)
      ch.description = "The player shown while Timotheos reads aloud"
      ch.setShowBadge(false)
      nm.createNotificationChannel(ch)
    }
    try {
      val s = MediaSession(this, "TimotheosSpeech")
      s.setCallback(object : MediaSession.Callback() {
        override fun onPlay() { main.post { if (paused) resume() } }
        override fun onPause() { main.post { if (!paused) pause() } }
        override fun onSkipToNext() { main.post { skip(1) } }
        override fun onSkipToPrevious() { main.post { skip(-1) } }
        override fun onStop() { main.post { finish("stopped") } }
      })
      session = s
    } catch (e: Exception) { session = null }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val act = intent?.action
    // a foreground service must show its notification at once, whatever else it was asked
    startFg()
    when (act) {
      ACT_BEGIN -> { val j = pendingStart; pendingStart = null; if (j != null) begin(j) else finish("stopped") }
      ACT_PAUSE -> if (paused) resume() else pause()
      ACT_PREV -> skip(-1)
      ACT_NEXT -> skip(1)
      ACT_STOP -> finish("stopped")
      else -> if (!playing && !paused) finish("stopped")
    }
    return START_NOT_STICKY
  }

  private fun startFg() {
    val n = note()
    if (Build.VERSION.SDK_INT >= 29) startForeground(NOTE_ID, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    else startForeground(NOTE_ID, n)
  }

  private fun pi(act: String, code: Int): PendingIntent {
    val i = Intent(this, SpeechService::class.java).setAction(act)
    return PendingIntent.getService(this, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun action(icon: Int, title: String, act: String, code: Int): Notification.Action =
    Notification.Action.Builder(Icon.createWithResource(this, icon), title, pi(act, code)).build()

  private fun note(): Notification {
    val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
    val open = packageManager.getLaunchIntentForPackage(packageName)
    val content = if (open != null) PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE) else null
    b.setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentTitle(if (label.isEmpty()) "Timotheos" else label)
      .setContentText(if (paused) "Paused" else "Reading aloud")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
    if (content != null) b.setContentIntent(content)
    b.addAction(action(android.R.drawable.ic_media_previous, "Previous verse", ACT_PREV, 1))
    b.addAction(action(if (paused) android.R.drawable.ic_media_play else android.R.drawable.ic_media_pause, if (paused) "Continue" else "Pause", ACT_PAUSE, 2))
    b.addAction(action(android.R.drawable.ic_media_next, "Next verse", ACT_NEXT, 3))
    b.addAction(action(android.R.drawable.ic_menu_close_clear_cancel, "Stop", ACT_STOP, 4))
    val st = Notification.MediaStyle().setShowActionsInCompactView(0, 1, 2)
    session?.let { st.setMediaSession(it.sessionToken) }
    b.setStyle(st)
    return b.build()
  }

  private fun refreshUi() {
    try { (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTE_ID, note()) } catch (e: Exception) { /* keep going */ }
    try {
      val s = session ?: return
      val acts = PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_PLAY_PAUSE or
        PlaybackState.ACTION_SKIP_TO_NEXT or PlaybackState.ACTION_SKIP_TO_PREVIOUS or PlaybackState.ACTION_STOP
      val state = if (paused) PlaybackState.STATE_PAUSED else PlaybackState.STATE_PLAYING
      s.setPlaybackState(PlaybackState.Builder().setActions(acts).setState(state, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f).build())
      s.setMetadata(MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, if (label.isEmpty()) "Timotheos" else label)
        .putString(MediaMetadata.METADATA_KEY_ARTIST, "Timotheos").build())
      s.isActive = true
    } catch (e: Exception) { /* the notification still works */ }
  }

  // ---- the reading ----

  private fun begin(json: String) {
    try {
      val o = JSONObject(json)
      val arr = o.getJSONArray("pieces")
      pieces.clear()
      for (k in 0 until arr.length()) pieces.add(arr.getJSONObject(k))
      loop = o.optBoolean("loop", false)
      voiceId = o.optString("voice", ""); lang = o.optString("lang", "")
      rate = o.optDouble("rate", 1.0).toFloat(); pitch = o.optDouble("pitch", 1.0).toFloat(); volume = o.optDouble("volume", 1.0).toFloat()
      ctx = o.optString("ctx", ""); label = o.optString("label", "")
      val start = o.optInt("start", 0)
      if (pieces.isEmpty()) { finish("stopped"); return }
      playing = true; paused = false
      acquire()
      refreshUi()
      withEngine { speakFrom(start) }
    } catch (e: Exception) { SpeechState.emit("{\"t\":\"err\",\"msg\":\"" + (e.message ?: "bad playlist").replace("\"", "'") + "\"}"); finish("error") }
  }

  fun append(json: String) {
    try {
      val arr = JSONArray(json)
      for (k in 0 until arr.length()) pieces.add(arr.getJSONObject(k))
      publish()
      if (playing && !paused) fill()
    } catch (e: Exception) { /* keep what is queued */ }
  }

  private fun withEngine(run: () -> Unit) {
    if (ready) { run(); return }
    whenReady = Runnable { run() }
    if (tts == null) {
      tts = TextToSpeech(applicationContext) { status ->
        main.post {
          if (status == TextToSpeech.SUCCESS) {
            ready = true
            try {
              tts?.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
              tts?.setOnUtteranceProgressListener(listener)
            } catch (e: Exception) { /* defaults */ }
            val r = whenReady; whenReady = null; r?.run()
          } else {
            failed = true
            SpeechState.emit("{\"t\":\"err\",\"msg\":\"The text-to-speech engine did not start\"}")
            finish("error")
          }
        }
      }
    }
  }

  private val listener = object : UtteranceProgressListener() {
    override fun onStart(id: String?) { val p = parse(id) ?: return; main.post { started(p.first, p.second) } }
    override fun onDone(id: String?) { val p = parse(id) ?: return; main.post { done(p.first, p.second) } }
    @Deprecated("Superseded by onError(String, Int)")
    override fun onError(id: String?) { val p = parse(id) ?: return; main.post { done(p.first, p.second) } }
    override fun onError(id: String?, code: Int) { val p = parse(id) ?: return; main.post { done(p.first, p.second) } }
  }

  private fun parse(id: String?): Pair<Int, Int>? {
    if (id == null) return null
    val a = id.split(":"); if (a.size != 2) return null
    return try { Pair(a[0].toInt(), a[1].toInt()) } catch (e: Exception) { null }
  }

  private fun at(n: Int): JSONObject = pieces[if (loop) n % pieces.size else n]

  private fun applyVoice() {
    val t = tts ?: return
    try {
      var set = false
      if (voiceId.isNotEmpty()) {
        val v = t.voices?.firstOrNull { it.name == voiceId }
        if (v != null) { t.voice = v; set = true }
      }
      if (!set && lang.isNotEmpty()) t.language = Locale.forLanguageTag(lang)
      t.setSpeechRate(rate); t.setPitch(pitch)
    } catch (e: Exception) { /* the engine's own voice */ }
  }

  private fun speakFrom(n: Int) {
    val t = tts ?: return
    gen++
    try { t.stop() } catch (e: Exception) { /* idle */ }
    if (!requestFocus()) { /* speak anyway: some devices refuse focus while another app plays */ }
    applyVoice()
    cur = n; queued = n - 1
    focusAt = System.currentTimeMillis()
    fill()
  }

  private fun total(): Int = if (loop) Int.MAX_VALUE else pieces.size

  private fun fill() {
    val t = tts ?: return
    while (queued + 1 < total() && queued + 1 < cur + 3) {
      val n = queued + 1
      val p = at(n)
      val params = Bundle(); params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume)
      val r = t.speak(p.optString("t", ""), TextToSpeech.QUEUE_ADD, params, "$gen:$n")
      if (r != TextToSpeech.SUCCESS) break
      queued = n
    }
  }

  private fun started(g: Int, n: Int) {
    if (g != gen) return
    cur = n
    val p = at(n)
    val l = p.optString("l", "")
    if (l.isNotEmpty() && l != label) { label = l; refreshUi() }
    publish()
    SpeechState.emit("{\"t\":\"piece\",\"i\":" + (if (loop) n % pieces.size else n) + "}")
  }

  private fun done(g: Int, n: Int) {
    if (g != gen) return
    if (!loop && n + 1 >= pieces.size) {
      // the end of the playlist: the page may have a longer one waiting, so give it a moment before closing
      main.postDelayed({ if (g == gen && !paused && cur == n && queued + 1 >= pieces.size) { SpeechState.emit("{\"t\":\"end\"}"); finish("ended") } }, 1500)
      return
    }
    fill()
  }

  fun skip(d: Int) {
    if (!playing || pieces.isEmpty()) return
    val base = cur - (if (loop) cur % pieces.size else 0)
    val i = if (loop) cur % pieces.size else cur
    val g = at(cur).optInt("g", 0)
    var target = i
    if (d > 0) {
      var k = i; while (k < pieces.size && pieces[k].optInt("g", 0) <= g) k++
      if (k >= pieces.size) { if (loop) k = 0 else { return } }
      target = k
    } else {
      var k = i; while (k >= 0 && pieces[k].optInt("g", 0) >= g) k--
      if (k < 0) { target = 0 } else { val pg = pieces[k].optInt("g", 0); while (k > 0 && pieces[k - 1].optInt("g", 0) == pg) k--; target = k }
    }
    cur = base + target
    if (paused) { paused = false; acquire() }
    speakFrom(cur)
    refreshUi(); publish(); emitState()
  }

  fun pause() {
    if (!playing || paused) return
    paused = true; gen++
    try { tts?.stop() } catch (e: Exception) { /* idle */ }
    refreshUi(); publish(); emitState()
  }

  fun resume() {
    if (!playing || !paused) return
    paused = false
    acquire()
    speakFrom(cur)      // the piece that was being read is read again from its start
    refreshUi(); publish(); emitState()
  }

  fun stopNow() { main.post { finish("stopped") } }

  private fun finish(why: String) {
    playing = false; paused = false; gen++
    try { tts?.stop() } catch (e: Exception) { /* idle */ }
    abandonFocus()
    releaseWake()
    try { session?.isActive = false } catch (e: Exception) { /* gone */ }
    SpeechState.playing = false; SpeechState.paused = false; SpeechState.snapshot = "{}"
    SpeechState.emit("{\"t\":\"state\",\"playing\":false,\"paused\":false,\"why\":\"" + why + "\"}")
    stopForegroundCompat()
    stopSelf()
  }

  @Suppress("DEPRECATION")
  private fun stopForegroundCompat() {
    try { stopForeground(true) } catch (e: Exception) { /* not in the foreground */ }
  }

  private fun emitState() {
    SpeechState.emit("{\"t\":\"state\",\"playing\":" + playing + ",\"paused\":" + paused + "}")
  }

  /** what the page may ask for when it comes back (state() and snapshot()) */
  private fun publish() {
    SpeechState.playing = playing; SpeechState.paused = paused
    SpeechState.index = if (pieces.isEmpty()) 0 else (if (loop) cur % pieces.size else Math.min(cur, pieces.size - 1))
    SpeechState.total = pieces.size
    try {
      val o = JSONObject()
      o.put("playing", playing); o.put("paused", paused); o.put("idx", SpeechState.index); o.put("loop", loop); o.put("ctx", ctx); o.put("label", label)
      val a = JSONArray()
      for (p in pieces) { val q = JSONObject(); q.put("g", p.optInt("g", 0)); q.put("l", p.optString("l", "")); q.put("r", p.optString("r", "")); a.put(q) }
      o.put("pieces", a)
      SpeechState.snapshot = o.toString()
    } catch (e: Exception) { /* the live state is still right */ }
  }

  // ---- audio focus, wake lock ----

  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    main.post {
      when (change) {
        AudioManager.AUDIOFOCUS_LOSS, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
          // a call or another player; a loss right after our own start is the engine's own focus request, not a reason to stop
          if (playing && !paused && System.currentTimeMillis() - focusAt > 1500) { wasPlayingBeforeLoss = true; pause() }
        }
        AudioManager.AUDIOFOCUS_GAIN -> { if (wasPlayingBeforeLoss && paused) { wasPlayingBeforeLoss = false; resume() } }
      }
    }
  }

  private fun requestFocus(): Boolean {
    val am = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return false
    val attrs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
    return if (Build.VERSION.SDK_INT >= 26) {
      if (focusReq == null) focusReq = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attrs).setOnAudioFocusChangeListener(focusListener).build()
      am.requestAudioFocus(focusReq!!) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    } else {
      legacyFocus(am)
    }
  }

  @Suppress("DEPRECATION")
  private fun legacyFocus(am: AudioManager): Boolean =
    am.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED

  @Suppress("DEPRECATION")
  private fun legacyAbandon(am: AudioManager) { am.abandonAudioFocus(focusListener) }

  private fun abandonFocus() {
    val am = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
    try {
      if (Build.VERSION.SDK_INT >= 26) { focusReq?.let { am.abandonAudioFocusRequest(it) } } else { legacyAbandon(am) }
    } catch (e: Exception) { /* none held */ }
  }

  private fun acquire() {
    try {
      if (wake == null) wake = (getSystemService(Context.POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "timotheos:speech")
      if (wake?.isHeld != true) wake?.acquire(6 * 60 * 60 * 1000L)
    } catch (e: Exception) { /* the foreground service alone keeps it going */ }
  }

  private fun releaseWake() { try { if (wake?.isHeld == true) wake?.release() } catch (e: Exception) { /* released */ } }

  override fun onDestroy() {
    playing = false
    releaseWake(); abandonFocus()
    try { tts?.stop(); tts?.shutdown() } catch (e: Exception) { /* gone */ }
    tts = null; ready = false
    try { session?.release() } catch (e: Exception) { /* gone */ }
    session = null
    instance = null
    super.onDestroy()
  }
}
