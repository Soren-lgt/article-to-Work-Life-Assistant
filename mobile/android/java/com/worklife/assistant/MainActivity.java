package com.worklife.assistant;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.pm.PackageManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup.LayoutParams;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;

/**
 * 朝暮 · 安卓壳
 * 只做一件事：一个干净的 WebView 打开线上手机版 PWA（数据仍存在 WebView 的 IndexedDB 里）。
 * 点开图标立刻有反馈：先显示“正在打开”，连不上就显示原因和重试入口，不会停在白屏上。
 */
public class MainActivity extends Activity {

    private static final String START_URL =
            "https://soren-lgt.github.io/article-to-Work-Life-Assistant/mobile/index.html";
    private static final int REQ_FILE = 1001;
    private static final int REQ_NOTIFY = 1002;
    private static final String CHANNEL_ID = "chaomu-notice";

    private WebView web;
    private FrameLayout root;
    private TextView layer;
    private ValueCallback<Uri[]> fileCallback;
    private boolean loadFailed = false;
    private String failText = "";

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        root = new FrameLayout(this);
        root.setLayoutParams(new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));

        layer = new TextView(this);
        layer.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        layer.setGravity(Gravity.CENTER);
        layer.setTextColor(Color.rgb(30, 70, 50));
        layer.setBackgroundColor(Color.rgb(244, 246, 243));
        layer.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        layer.setLineSpacing(dp(6), 1.0f);
        layer.setPadding(dp(28), dp(28), dp(28), dp(28));
        layer.setVisibility(View.GONE);
        layer.setOnClickListener(v -> retry());
        root.addView(layer);

        web = new WebView(this);
        web.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        root.addView(web);
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " ChaomuApp/1.0.3");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        CookieManager.getInstance().setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        }

        // 站内链接留在应用里，站外链接交给系统浏览器
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url != null && (url.startsWith("https://soren-lgt.github.io/")
                        || url.startsWith("about:") || url.startsWith("data:"))) {
                    return false;
                }
                openInSystem(url);
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && req != null && req.isForMainFrame()) {
                    onLoadFail("网络没有连上（" + (err == null ? "" : err.getDescription()) + "）");
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest req, WebResourceResponse resp) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && req != null
                        && req.isForMainFrame() && resp != null && resp.getStatusCode() >= 400) {
                    onLoadFail("服务器返回 " + resp.getStatusCode() + "，页面暂时打不开");
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (loadFailed) {
                    showLayer(failText);
                } else {
                    layer.setVisibility(View.GONE);
                }
            }
        });

        // 弹窗 / 文件选择 / 下载都要 chrome client 才生效
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view,
                                             ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = callback;
                try {
                    Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                    pick.addCategory(Intent.CATEGORY_OPENABLE);
                    pick.setType("*/*");
                    if (params != null && params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                        pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    }
                    startActivityForResult(Intent.createChooser(pick, "选择文件"), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        // 导出备份点击后走系统下载
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            openInSystem(url);
        });

        // 通知：WebView 里没有 Web Notification API，网页拿不到系统通知，
        // 所以这里注入一个原生桥（window.ChaomuNotify），由壳负责权限询问和往通知栏推送。
        createChannel();
        web.addJavascriptInterface(new NotifyBridge(), "ChaomuNotify");

        // 个人自用包，一直开着调试口：万一还有问题，可以用电脑 Chrome 的 chrome://inspect 看日志
        WebView.setWebContentsDebuggingEnabled(true);

        // 恢复上次的页面状态（重建时不重新加载）
        if (state != null) {
            web.restoreState(state);
            layer.setVisibility(View.GONE);
        } else {
            startLoad();
        }
    }

    /** 通知渠道：Android 8 以上必须先注册渠道，通知才会真的显示 */
    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm == null) return;
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "朝暮提醒", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("计划、开发、同组里的待办提醒");
            nm.createNotificationChannel(ch);
        }
    }

    /** granted / denied / default（还没问过） */
    private String notifyState() {
        if (Build.VERSION.SDK_INT >= 33) {
            boolean ok = checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
            return ok ? "granted" : "default";
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null && !nm.areNotificationsEnabled()) return "denied";
        }
        return "granted";
    }

    /** 网页侧能力：state() 查状态、request() 要权限、notify() 推一条到通知栏 */
    private class NotifyBridge {
        @JavascriptInterface
        public String state() {
            return notifyState();
        }

        @JavascriptInterface
        public String request() {
            if (Build.VERSION.SDK_INT >= 33) {
                if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                    return "granted";
                }
                try {
                    requestPermissions(new String[]{ Manifest.permission.POST_NOTIFICATIONS }, REQ_NOTIFY);
                    return "requesting";
                } catch (Exception e) {
                    return "denied";
                }
            }
            return notifyState();
        }

        /** 把整份提醒清单交给系统闹钟（网页每次数据变化后重发一份，壳内部先全撤再排，幂等） */
        @JavascriptInterface
        public int syncAlarms(String json) {
            return MainActivity.this.syncAlarms(json);
        }

        @JavascriptInterface
        public boolean notify(String id, String title, String body) {
            if (!"granted".equals(notifyState())) return false;
            try {
                NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                if (nm == null) return false;
                Notification.Builder b;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    b = new Notification.Builder(MainActivity.this, CHANNEL_ID);
                } else {
                    b = new Notification.Builder(MainActivity.this);
                }
                Intent open = new Intent(MainActivity.this, MainActivity.class);
                open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
                String key = (id == null || id.length() == 0) ? "chaomu" : id;
                PendingIntent pi = PendingIntent.getActivity(MainActivity.this,
                        Math.abs(key.hashCode()) % 100000, open, flags);
                String text = body == null ? "" : body;
                b.setSmallIcon(android.R.drawable.ic_dialog_info)
                        .setContentTitle(title == null ? "朝暮" : title)
                        .setContentText(text)
                        .setStyle(new Notification.BigTextStyle().bigText(text))
                        .setContentIntent(pi)
                        .setAutoCancel(true)
                        .setShowWhen(true);
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                    b.setPriority(Notification.PRIORITY_DEFAULT);
                }
                String tag = (id == null || id.length() == 0) ? "chaomu" : ("notice-" + id);
                nm.notify(tag, Math.abs(tag.hashCode()) % 100000, b.build());
                return true;
            } catch (Exception e) {
                return false;
            }
        }
    }

    /** 计划提醒用的那枚闹钟（同一个 id 用同一个 requestCode，才能取消掉上次的） */
    private PendingIntent reminderPI(String id, String title, String body) {
        Intent it = new Intent(this, NotifyReceiver.class);
        it.setAction(NotifyReceiver.ACTION);
        it.putExtra("id", id == null ? "" : id);
        if (title != null) it.putExtra("title", title);
        if (body != null) it.putExtra("body", body);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        String key = "remind-" + (id == null ? "" : id);
        return PendingIntent.getBroadcast(this, Math.abs(key.hashCode()) % 100000, it, flags);
    }

    /** 整份清单重排：先撤掉上次排的，再把"时间还没到"的一条条挂到系统闹钟上 */
    private int syncAlarms(String json) {
        AlarmManager am = (AlarmManager) getSystemService(ALARM_SERVICE);
        if (am == null) return -1;
        SharedPreferences sp = getSharedPreferences("chaomu-alarms", Context.MODE_PRIVATE);
        HashSet<String> old = new HashSet<>(sp.getStringSet("ids", new HashSet<String>()));
        for (String id : old) {
            try { am.cancel(reminderPI(id, null, null)); } catch (Exception ignored) { }
        }
        HashSet<String> fresh = new HashSet<>();
        int count = 0;
        long nowMs = System.currentTimeMillis();
        try {
            JSONArray arr = new JSONArray(json == null || json.length() == 0 ? "[]" : json);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                String id = o.optString("id", "");
                long ts = o.optLong("ts", 0L);
                if (id.length() == 0 || ts <= nowMs) continue;
                PendingIntent pi;
                try {
                    pi = reminderPI(id, o.optString("title", "计划提醒"), o.optString("body", ""));
                } catch (Exception e) {
                    continue;
                }
                try {
                    if (Build.VERSION.SDK_INT >= 31) {
                        if (am.canScheduleExactAlarms()) {
                            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ts, pi);
                        } else {
                            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ts, pi);
                        }
                    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ts, pi);
                    } else {
                        am.setExact(AlarmManager.RTC_WAKEUP, ts, pi);
                    }
                    fresh.add(id);
                    count++;
                } catch (Exception ignored) { }
            }
        } catch (Exception ignored) { }
        sp.edit().putStringSet("ids", fresh).apply();
        return count;
    }

    /** 点开就先给个可见的反馈，避免“点了没反应”的错觉 */
    private void startLoad() {
        loadFailed = false;
        failText = "";
        showLayer("正在打开…\n\n第一次打开要联网加载页面，请等几秒。");
        try {
            web.loadUrl(START_URL);
        } catch (Exception e) {
            onLoadFail("页面没能启动（" + e.getClass().getSimpleName() + "）");
        }
    }

    private void retry() {
        startLoad();
    }

    private void onLoadFail(String why) {
        loadFailed = true;
        failText = "没连上\n\n"
                + why
                + "\n\n应用是靠网络打开页面的。请检查手机有没有网（WiFi 或流量），"
                + "然后点一下屏幕重试。\n\n"
                + "如果几台网络都试过还是这样，多半是这台手机访问不了 GitHub Pages，"
                + "可以先在手机浏览器里打开：\nsoren-lgt.github.io/article-to-Work-Life-Assistant/mobile/index.html";
        showLayer(failText);
    }

    private void showLayer(String text) {
        layer.setText(text);
        layer.setVisibility(View.VISIBLE);
        layer.bringToFront();
    }

    private void openInSystem(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception ignored) { }
    }

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE) {
            if (fileCallback != null) {
                Uri[] out = null;
                if (res == RESULT_OK && data != null) {
                    if (data.getClipData() != null) {
                        int n = data.getClipData().getItemCount();
                        ArrayList<Uri> list = new ArrayList<>();
                        for (int i = 0; i < n; i++) {
                            list.add(data.getClipData().getItemAt(i).getUri());
                        }
                        out = list.toArray(new Uri[0]);
                    } else if (data.getData() != null) {
                        out = new Uri[]{ data.getData() };
                    }
                }
                fileCallback.onReceiveValue(out);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(req, res, data);
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] results) {
        if (req == REQ_NOTIFY) {
            boolean anyGranted = false;
            for (int r : results) {
                if (r == PackageManager.PERMISSION_GRANTED) anyGranted = true;
            }
            String state = anyGranted ? "granted" : "denied";
            final String s2 = state;
            final WebView target = web;
            if (target != null) {
                target.post(new Runnable() {
                    public void run() {
                        target.evaluateJavascript(
                                "window.__chaomuNotifyState&&window.__chaomuNotifyState('" + s2 + "')", null);
                    }
                });
            }
            return;
        }
        super.onRequestPermissionsResult(req, perms, results);
    }

    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(code, e);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
