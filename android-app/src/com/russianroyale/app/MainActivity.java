package com.russianroyale.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final String HOME = "https://russian-royale.russian-royale.workers.dev/";
    private static final String HOST = "russian-royale.russian-royale.workers.dev";
    private static final int PICK_FILE = 17;
    private WebView web;
    private LinearLayout error;
    private ProgressBar progress;
    private ValueCallback<Uri[]> pendingFile;
    private boolean pageFailed;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().setStatusBarColor(Color.rgb(241, 244, 249));
        getWindow().setNavigationBarColor(Color.rgb(241, 244, 249));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(241, 244, 249));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        root.addView(progress, new FrameLayout.LayoutParams(-1, dp(3)));
        error = new LinearLayout(this);
        error.setOrientation(LinearLayout.VERTICAL);
        error.setGravity(android.view.Gravity.CENTER);
        error.setPadding(dp(28), dp(28), dp(28), dp(28));
        error.setBackgroundColor(Color.rgb(241, 244, 249));
        TextView title = new TextView(this);
        title.setText("Не удалось открыть Русский Royale");
        title.setTextSize(23);
        title.setTextColor(Color.rgb(24, 36, 64));
        title.setGravity(android.view.Gravity.CENTER);
        error.addView(title);
        TextView hint = new TextView(this);
        hint.setText("Проверьте интернет и попробуйте ещё раз. Прогресс аккаунта хранится на сервере.");
        hint.setTextSize(16);
        hint.setTextColor(Color.rgb(66, 78, 102));
        hint.setPadding(0, dp(18), 0, dp(18));
        hint.setGravity(android.view.Gravity.CENTER);
        error.addView(hint);
        Button retry = new Button(this);
        retry.setText("Попробовать снова");
        retry.setOnClickListener(v -> { error.setVisibility(View.GONE); web.loadUrl(HOME); });
        error.addView(retry);
        root.addView(error, new FrameLayout.LayoutParams(-1, -1));
        error.setVisibility(View.GONE);
        setContentView(root);
        root.requestApplyInsets();

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isSite(uri)) return false;
                if (request.isForMainFrame() && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()) || "mailto".equals(uri.getScheme()) || "tel".equals(uri.getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (ActivityNotFoundException e) { Toast.makeText(MainActivity.this, "Не найдено приложение для этой ссылки", Toast.LENGTH_SHORT).show(); }
                }
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                pageFailed = false;
                error.setVisibility(View.GONE);
                progress.setVisibility(View.VISIBLE);
            }
            @Override public void onPageFinished(WebView view, String url) {
                CookieManager.getInstance().flush();
                progress.setVisibility(View.GONE);
                if (pageFailed) error.setVisibility(View.VISIBLE);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError failure) {
                if (request.isForMainFrame()) showError();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) showError();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) { progress.setProgress(value); }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!isSite(Uri.parse(view.getUrl() == null ? "" : view.getUrl()))) return false;
                if (pendingFile != null) pendingFile.onReceiveValue(null);
                pendingFile = callback;
                Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                picker.addCategory(Intent.CATEGORY_OPENABLE);
                picker.setType("image/*");
                picker.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/jpeg", "image/png", "image/webp"});
                try { startActivityForResult(picker, PICK_FILE); }
                catch (ActivityNotFoundException e) { pendingFile.onReceiveValue(null); pendingFile = null; }
                return true;
            }
        });
        Uri launch = getIntent().getData();
        if (isSite(launch)) web.loadUrl(launch.toString());
        else if (saved == null || web.restoreState(saved) == null) web.loadUrl(HOME);
    }

    private boolean isSite(Uri uri) { return uri != null && "https".equals(uri.getScheme()) && HOST.equalsIgnoreCase(uri.getHost()) && (uri.getPort() == -1 || uri.getPort() == 443); }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (web != null && isSite(intent.getData())) web.loadUrl(intent.getData().toString());
    }
    private int dp(int n) { return Math.round(n * getResources().getDisplayMetrics().density); }
    private void showError() { pageFailed = true; progress.setVisibility(View.GONE); error.setVisibility(View.VISIBLE); }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILE && pendingFile != null) {
            pendingFile.onReceiveValue(result == RESULT_OK && data != null && data.getData() != null ? new Uri[]{data.getData()} : null);
            pendingFile = null;
        }
    }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onSaveInstanceState(Bundle state) { web.saveState(state); super.onSaveInstanceState(state); }
    @Override protected void onPause() { CookieManager.getInstance().flush(); web.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() {
        if (pendingFile != null) { pendingFile.onReceiveValue(null); pendingFile = null; }
        web.destroy();
        super.onDestroy();
    }
}
