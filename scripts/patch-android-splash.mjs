#!/usr/bin/env node
/**
 * 给生成的 Android 工程补上「启动窗口背景色」，消除启动时的背景闪烁。
 *
 * 为什么需要：
 *   Tauri 的 Android 模板主题继承 `Theme.MaterialComponents.DayNight.NoActionBar`，
 *   它的 `android:windowBackground` 是 Material 灰底（暗色 #303030 / 亮色 #FAFAFA）。
 *   而启动动画的背景是深色品牌色 #071218（见 src/styles/launch.css 的 --launch-bg），
 *   于是点开应用会先闪一下灰/白，再跳进启动动画。
 *
 *   这里把窗口首帧背景固定成品牌色，与 index.html 首帧、launch.css 三层对齐。
 *   启动画面本身固定深色，不随系统 DayNight 切换。
 *
 * 用法：
 *   node scripts/patch-android-splash.mjs
 *   （tauri.conf.json 的 beforeBuildCommand 已自动调用，一般不用手动跑）
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const res = join(root, "src-tauri", "gen", "android", "app", "src", "main", "res");

if (!existsSync(res)) {
  console.log("[splash] Android 跳过：gen/android 还没生成（先跑 tauri android init）");
  process.exit(0);
}

// 与 src/styles/launch.css 的 --launch-bg、index.html 首帧背景一致
const BRAND = "#071218";
const THEME = "Theme.hghubx";
const valuesDir = join(res, "values");
const colorsPath = join(valuesDir, "colors.xml");
const pending = new Map();
let themeCount = 0;

function fail(path, message) {
  throw new Error(`[splash] Android XML 结构变化：${path}：${message}`);
}

// Match only this app's simple Tauri resources. Mask comments with spaces so
// offsets still refer to the original XML and commented examples stay intact.
function matches(xml, pattern) {
  const active = xml.replace(/<!--[\s\S]*?-->/g, (comment) => " ".repeat(comment.length));
  return [...active.matchAll(pattern)];
}

function setValue(xml, match, value, path) {
  const start = match.index + match[1].length;
  const end = start + match[2].length;
  const old = xml.slice(start, end);
  if (old.includes("<")) fail(path, "目标值不再是简单文本");
  const updated = old.replace(/^(\s*)[\s\S]*?(\s*)$/, (_, before, after) => `${before}${value}${after}`);
  return xml.slice(0, start) + updated + xml.slice(end);
}

// Qualified styles replace the whole default style; patch every existing copy.
const directories = readdirSync(res, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^values(?:-.+)?$/.test(entry.name))
  .map((entry) => entry.name).sort();
if (!directories.includes("values")) fail(valuesDir, "缺少默认 values 目录");

for (const directory of directories) {
  let directoryThemes = 0;
  let directoryColors = 0;
  const dir = join(res, directory);
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".xml"))
    .map((entry) => join(dir, entry.name)).sort();
  for (const path of files) {
    const original = readFileSync(path, "utf8");
    let xml = original;
    const themeOpenings = matches(xml, /<style\b[^>]*\sname\s*=\s*["']Theme\.hghubx["'][^>]*>/g);
    const themes = matches(xml, /(<style\b[^>]*\sname\s*=\s*["']Theme\.hghubx["'][^>]*>)([\s\S]*?)(<\/style\s*>)/g);
    if (themes.length !== themeOpenings.length) fail(path, `${THEME} 缺少结束标签`);
    directoryThemes += themes.length;
    if (directoryThemes > 1) fail(path, `${directory} 重复定义 ${THEME}`);
    if (themes.length) {
      const theme = themes[0];
      if (/\/\s*>$/.test(theme[1]) || /<\/?style\b/.test(theme[2])) fail(path, `${THEME} 结构变化`);
      const start = theme.index + theme[1].length;
      const end = start + theme[2].length;
      const body = xml.slice(start, end);
      const backgrounds = matches(body, /(<item\b[^>]*\sname\s*=\s*["']android:windowBackground["'][^>]*>)([^<]*)(<\/item\s*>)/g);
      const backgroundOpenings = matches(body, /<item\b[^>]*\sname\s*=\s*["']android:windowBackground["'][^>]*>/g);
      if (backgrounds.length !== backgroundOpenings.length) fail(path, "windowBackground 结构变化");
      if (backgrounds.length > 1) fail(path, `${THEME} 重复定义 windowBackground`);
      let updated;
      if (backgrounds.length) {
        updated = setValue(body, backgrounds[0], "@color/launch_background", path);
      } else {
        const marker = "<!-- Customize your theme here. -->";
        if (!body.includes(marker)) fail(path, `${THEME} 缺少模板插入标记`);
        updated = body.replace(marker, `${marker}\n        <item name="android:windowBackground">@color/launch_background</item>`);
      }
      xml = xml.slice(0, start) + updated + xml.slice(end);
    }

    // Refresh existing qualified colors too, so they cannot override BRAND.
    const colorOpenings = matches(xml, /<color\b[^>]*\sname\s*=\s*["']launch_background["'][^>]*>/g);
    const colors = matches(xml, /(<color\b[^>]*\sname\s*=\s*["']launch_background["'][^>]*>)([^<]*)(<\/color\s*>)/g);
    if (colors.length !== colorOpenings.length) fail(path, "launch_background 结构变化");
    directoryColors += colors.length;
    if (directoryColors > 1) fail(path, `${directory} 重复定义 launch_background`);
    if (colors.length) xml = setValue(xml, colors[0], BRAND, path);
    if (xml !== original) pending.set(path, xml);
  }
  if (directory === "values") {
    if (directoryThemes !== 1) fail(valuesDir, `预期一个默认主题 ${THEME}，找到 ${directoryThemes} 个`);
    if (!directoryColors) {
      let xml = pending.get(colorsPath) ?? (existsSync(colorsPath)
        ? readFileSync(colorsPath, "utf8") : "<resources>\n</resources>\n");
      const ends = matches(xml, /<\/resources\s*>/g);
      if (ends.length !== 1) fail(colorsPath, "缺少唯一的 resources 结束标签");
      const end = ends[0].index;
      xml = xml.slice(0, end) + `    <color name="launch_background">${BRAND}</color>\n` + xml.slice(end);
      pending.set(colorsPath, xml);
    }
  }
  themeCount += directoryThemes;
}

// Parse all targets before writing, so a changed template never leaves only one
// of the day/night variants patched.
for (const [path, xml] of pending) writeFileSync(path, xml);
console.log(`[splash] Android ${themeCount} 个主题背景已对齐 → ${BRAND}（更新 ${pending.size} 个文件）`);

// Standard edition (com.hghubx.app): keep edge-to-edge video while exposing
// native system-bar + cutout insets as CSS variables (--native-sat/sar/sab/sal).
// Old WebViews (e.g. Chromium 66 car headunits) lack CSS env(safe-area-inset-*)
// and report zero cutout despite persistent status/dock bars (#138).
const appActivityPath = join(root, "src-tauri", "gen", "android", "app", "src", "main", "java", "com", "hghubx", "app", "MainActivity.kt");
if (existsSync(appActivityPath)) {
  const templateActivity = `package com.hghubx.app
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }
}`;
  const patchedActivity = `package com.hghubx.app

import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.roundToInt

class MainActivity : TauriActivity() {
  private var insetScript = ""
  private var webViewHooked = false

  private fun findWebView(view: View?): WebView? {
    if (view is WebView) return view
    if (view is ViewGroup) {
      for (i in 0 until view.childCount) {
        findWebView(view.getChildAt(i))?.let { return it }
      }
    }
    return null
  }

  private fun pushInsets(content: View) {
    val script = insetScript
    if (script.isEmpty()) return
    val wv = findWebView(content) ?: return
    wv.evaluateJavascript(script, null)
    if (!webViewHooked) {
      webViewHooked = true
      for (delay in longArrayOf(150L, 600L, 1500L)) {
        wv.postDelayed({ if (insetScript.isNotEmpty()) wv.evaluateJavascript(insetScript, null) }, delay)
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    val content = findViewById<View>(android.R.id.content) ?: return
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      val density = view.resources.displayMetrics.density.coerceAtLeast(1f)
      val top = (bars.top / density).roundToInt()
      val right = (bars.right / density).roundToInt()
      val bottom = (bars.bottom / density).roundToInt()
      val left = (bars.left / density).roundToInt()
      insetScript =
        "(function(){var s=document.documentElement&&document.documentElement.style;if(!s)return;" +
          "s.setProperty('--native-sat','\${top}px');" +
          "s.setProperty('--native-sar','\${right}px');" +
          "s.setProperty('--native-sab','\${bottom}px');" +
          "s.setProperty('--native-sal','\${left}px');})();"
      pushInsets(content)
      insets
    }
    content.viewTreeObserver.addOnGlobalLayoutListener {
      if (!webViewHooked && insetScript.isNotEmpty()) pushInsets(content)
    }
    ViewCompat.requestApplyInsets(content)
  }
}
`;
  const normalize = (text) => text.trim().replace(/\s+/g, " ");
  const currentActivity = readFileSync(appActivityPath, "utf8");
  if (![templateActivity, patchedActivity].some((expected) => normalize(expected) === normalize(currentActivity))) {
    fail(appActivityPath, "MainActivity 与已知 Tauri 模板不同，请审阅原生改动后更新补丁");
  }
  if (normalize(currentActivity) !== normalize(patchedActivity)) {
    writeFileSync(appActivityPath, patchedActivity);
  }
  console.log("[splash] Android 标准版系统栏安全区桥接已写入 MainActivity.kt");
}
