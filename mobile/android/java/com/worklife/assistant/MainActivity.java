package com.worklife.assistant;

import android.app.Activity;
import android.content.Intent;
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
import android.webkit.ValueCallback;
import android.widget.FrameLayout;
import android.widget.TextView;

import java.util.ArrayList;

/**
 * 朝暮 · 安卓壳
 * 只做一件事：一个干净的 WebView 打开线上手机版 PWA（数据仍存在 WebView 的 IndexedDB 里）。
 * 点开图标立刻有反馈：先显示“正在打开”，连不上就显示原因和重试入口，不会停在白屏上。
 */
public class MainActivity extends Activity {

    private static final String START_URL =
            "https://soren-lgt.github.io/article-to-Work-Life-Assistant/mobile/index.html";
    private static final int REQ_FILE = 1001;

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
        s.setUserAgentString(s.getUserAgentString() + " ChaomuApp/1.0.1");
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
