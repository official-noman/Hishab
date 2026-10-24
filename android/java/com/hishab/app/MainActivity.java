package com.hishab.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 4001;
    private static final int VOICE_PERMISSION_REQUEST = 4002;

    private WebView webView;
    private AssetServer server;
    private ValueCallback<Uri[]> filePathCallback;

    private SpeechRecognizer speechRecognizer;
    private String speechLanguage = "en-US";
    private boolean speechActive = false;
    private boolean speechPermissionPending = false;
    private int speechSession = 0;
    private final Handler speechHandler = new Handler(Looper.getMainLooper());

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
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != VOICE_PERMISSION_REQUEST) return;

        boolean wasPending = speechPermissionPending;
        speechPermissionPending = false;
        if (!wasPending) return;

        boolean granted = grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (granted) {
            startNativeSpeech();
        } else {
            emitVoiceEvent("error", "", "not-allowed");
        }
    }

    private void requestAndStartSpeech(String language) {
        speechLanguage = language != null && language.toLowerCase().startsWith("bn")
                ? "bn-BD" : "en-US";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            speechPermissionPending = true;
            try {
                requestPermissions(
                        new String[] { Manifest.permission.RECORD_AUDIO },
                        VOICE_PERMISSION_REQUEST
                );
            } catch (Exception error) {
                speechPermissionPending = false;
                emitVoiceEvent("error", "", "not-allowed");
            }
            return;
        }
        startNativeSpeech();
    }

    private void startNativeSpeech() {
        speechPermissionPending = false;
        cancelNativeSpeech(false);

        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            emitVoiceEvent("error", "", "service-not-available");
            return;
        }

        final int session = speechSession;
        speechActive = true;

        try {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
        } catch (Exception error) {
            speechActive = false;
            emitVoiceEvent("error", "", "service-not-available");
            return;
        }

        if (speechRecognizer == null) {
            speechActive = false;
            emitVoiceEvent("error", "", "service-not-available");
            return;
        }

        speechRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override
            public void onReadyForSpeech(Bundle params) {
                // The web layer already shows its listening state.
            }

            @Override
            public void onBeginningOfSpeech() {
            }

            @Override
            public void onRmsChanged(float rmsdB) {
            }

            @Override
            public void onBufferReceived(byte[] buffer) {
            }

            @Override
            public void onEndOfSpeech() {
            }

            @Override
            public void onError(int error) {
                if (session != speechSession || !speechActive) return;
                finishNativeSpeech("error", "", mapSpeechError(error));
            }

            @Override
            public void onResults(Bundle results) {
                if (session != speechSession || !speechActive) return;
                String text = firstSpeechResult(results);
                if (text.isEmpty()) {
                    finishNativeSpeech("error", "", "no-speech");
                } else {
                    finishNativeSpeech("result", text, "");
                }
            }

            @Override
            public void onPartialResults(Bundle partialResults) {
                if (session != speechSession || !speechActive) return;
                String text = firstSpeechResult(partialResults);
                if (!text.isEmpty()) emitVoiceEvent("partial", text, "");
            }

            @Override
            public void onEvent(int eventType, Bundle params) {
            }
        });

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
        );
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, speechLanguage);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, speechLanguage);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);

        try {
            speechRecognizer.startListening(intent);
            emitVoiceEvent("start", "", "");
        } catch (Exception error) {
            finishNativeSpeech("error", "", "client");
        }
    }

    private void stopNativeSpeech() {
        speechPermissionPending = false;
        if (!speechActive || speechRecognizer == null) {
            emitVoiceEvent("end", "", "");
            return;
        }

        final int session = speechSession;
        try {
            speechRecognizer.stopListening();
        } catch (Exception error) {
            finishNativeSpeech("error", "", "client");
            return;
        }

        // Some speech services never deliver a final callback after stopListening.
        speechHandler.postDelayed(() -> {
            if (session == speechSession && speechActive) {
                finishNativeSpeech("end", "", "");
            }
        }, 2500);
    }

    private void cancelNativeSpeech(boolean notifyWeb) {
        speechPermissionPending = false;
        speechActive = false;
        speechSession += 1;
        speechHandler.removeCallbacksAndMessages(null);

        SpeechRecognizer recognizer = speechRecognizer;
        speechRecognizer = null;
        if (recognizer != null) {
            try {
                recognizer.cancel();
            } catch (Exception ignored) {
                // The service may already be gone.
            }
            try {
                recognizer.destroy();
            } catch (Exception ignored) {
                // Nothing else to clean up.
            }
        }

        if (notifyWeb) emitVoiceEvent("end", "", "");
    }

    private void finishNativeSpeech(String type, String text, String code) {
        if (!speechActive) return;

        speechActive = false;
        speechSession += 1;
        speechHandler.removeCallbacksAndMessages(null);

        SpeechRecognizer recognizer = speechRecognizer;
        speechRecognizer = null;
        if (recognizer != null) {
            try {
                recognizer.cancel();
            } catch (Exception ignored) {
                // The service may already be gone.
            }
            try {
                recognizer.destroy();
            } catch (Exception ignored) {
                // Nothing else to clean up.
            }
        }

        emitVoiceEvent(type, text, code);
    }

    private static String firstSpeechResult(Bundle results) {
        if (results == null) return "";
        ArrayList<String> matches = results.getStringArrayList(
                SpeechRecognizer.RESULTS_RECOGNITION
        );
        if (matches == null || matches.isEmpty()) return "";
        String text = matches.get(0);
        return text == null ? "" : text.trim();
    }

    private static String mapSpeechError(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_AUDIO:
                return "audio-capture";
            case SpeechRecognizer.ERROR_CLIENT:
                return "client";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "not-allowed";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                return "network";
            case SpeechRecognizer.ERROR_NO_MATCH:
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return "no-speech";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                return "busy";
            case SpeechRecognizer.ERROR_SERVER:
                return "service-not-allowed";
            default:
                return "unknown";
        }
    }

    private void emitVoiceEvent(String type, String text, String code) {
        final String script = "window.HishabVoiceEvent&&window.HishabVoiceEvent("
                + JSONObject.quote(type)
                + ","
                + JSONObject.quote(text == null ? "" : text)
                + ","
                + JSONObject.quote(code == null ? "" : code)
                + ");";
        runOnUiThread(() -> {
            if (webView != null) webView.evaluateJavascript(script, null);
        });
    }

    private void openAppSettings() {
        try {
            Intent intent = new Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.fromParts("package", getPackageName(), null)
            );
            startActivity(intent);
        } catch (Exception error) {
            toast("Open Settings > Apps > Hishab > Permissions");
        }
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
        cancelNativeSpeech(false);
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
        public void startVoice(String language) {
            runOnUiThread(() -> requestAndStartSpeech(language));
        }

        @JavascriptInterface
        public void stopVoice() {
            runOnUiThread(MainActivity.this::stopNativeSpeech);
        }

        @JavascriptInterface
        public void abortVoice() {
            runOnUiThread(() -> cancelNativeSpeech(false));
        }

        @JavascriptInterface
        public void openAppSettings() {
            runOnUiThread(MainActivity.this::openAppSettings);
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
