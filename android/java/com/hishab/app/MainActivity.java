package com.hishab.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 4001;

    private WebView webView;
    private AssetServer server;
    private ValueCallback<Uri[]> filePathCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            server = new AssetServer(getAssets(), "www");
            int port = server.start();

            webView = new WebView(this);
            setContentView(webView);

            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(true);
            settings.setLoadWithOverviewMode(true);
            settings.setUseWideViewPort(true);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
            settings.setSupportZoom(false);
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);
            settings.setSupportMultipleWindows(false);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);

            webView.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    return openExternalIfNeeded(request.getUrl());
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView view, String url) {
                    return openExternalIfNeeded(Uri.parse(url));
                }
            });

            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onShowFileChooser(
                        WebView view,
                        ValueCallback<Uri[]> callback,
                        FileChooserParams params
                ) {
                    if (filePathCallback != null) {
                        filePathCallback.onReceiveValue(null);
                    }
                    filePathCallback = callback;

                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
                            "application/pdf",
                            "image/*",
                            "text/*",
                            "text/csv",
                            "application/vnd.ms-excel",
                            "application/octet-stream"
                    });

                    try {
                        startActivityForResult(
                                Intent.createChooser(intent, "Choose a statement"),
                                FILE_CHOOSER_REQUEST
                        );
                    } catch (Exception error) {
                        filePathCallback = null;
                        callback.onReceiveValue(null);
                        toast("No file picker available");
                    }
                    return true;
                }
            });

            webView.addJavascriptInterface(new AndroidBridge(), "HishabAndroid");

            webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception error) {
                    toast("This download needs a browser");
                }
            });

            webView.loadUrl("http://127.0.0.1:" + port + "/index.html");
        } catch (Exception error) {
            toast("Could not start Hishab: " + error.getMessage());
            finish();
        }
    }

    private boolean openExternalIfNeeded(Uri uri) {
        String scheme = uri.getScheme();
        if ("http".equals(scheme) || "https".equals(scheme)) {
            String host = uri.getHost();
            if ("127.0.0.1".equals(host) || "localhost".equals(host)) {
                return false;
            }
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) {
                // No browser installed.
            }
            return true;
        }
        if ("mailto".equals(scheme) || "tel".equals(scheme) || "sms".equals(scheme)) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) {
                // No matching app installed.
            }
            return true;
        }
        return false;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback == null) return;

            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                ClipData clip = data.getClipData();
                if (clip != null) {
                    results = new Uri[clip.getItemCount()];
                    for (int i = 0; i < clip.getItemCount(); i += 1) {
                        results[i] = clip.getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[] { data.getData() };
                }
            }

            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (server != null) server.stop();
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private void toast(String message) {
        runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
    }

    private final class AndroidBridge {
        @JavascriptInterface
        public String getPlatform() {
            return "android";
        }

        @JavascriptInterface
        public void saveBase64(String filename, String base64) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                String safe = String.valueOf(filename == null ? "hishab-file" : filename)
                        .replaceAll("[^A-Za-z0-9._-]", "_");
                if (safe.isEmpty()) safe = "hishab-file";

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, mimeTypeForName(safe));
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Hishab");
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri != null) {
                        try (OutputStream output = getContentResolver().openOutputStream(uri)) {
                            if (output != null) {
                                output.write(bytes);
                                toast("Saved to Downloads/Hishab/" + safe);
                                return;
                            }
                        }
                    }
                }

                File dir = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "Hishab");
                if (!dir.exists() && !dir.mkdirs()) {
                    dir = new File(getFilesDir(), "Hishab");
                    if (!dir.exists()) dir.mkdirs();
                }
                File file = new File(dir, safe);
                try (FileOutputStream output = new FileOutputStream(file)) {
                    output.write(bytes);
                }
                toast("Saved to " + file.getAbsolutePath());
            } catch (Exception error) {
                toast("Could not save the file");
            }
        }
    }

    private static String mimeTypeForName(String name) {
        String lower = name.toLowerCase();
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".csv")) return "text/csv";
        if (lower.endsWith(".txt")) return "text/plain";
        if (lower.endsWith(".pdf")) return "application/pdf";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        return "application/octet-stream";
    }
}
