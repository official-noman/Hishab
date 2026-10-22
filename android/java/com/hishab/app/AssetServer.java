package com.hishab.app;

import android.content.res.AssetManager;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * A tiny loopback HTTP server for the bundled web app.
 *
 * Loading file:///android_asset works, but workers, service workers and
 * localStorage are much more reliable on a real http://localhost origin.
 */
final class AssetServer {
    private final AssetManager assets;
    private final String root;
    private final ExecutorService executor = Executors.newFixedThreadPool(4);
    private ServerSocket server;
    private volatile boolean running;

    AssetServer(AssetManager assets, String root) {
        this.assets = assets;
        this.root = root;
    }

    int start() throws IOException {
        server = new ServerSocket();
        server.setReuseAddress(true);
        server.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0), 32);
        running = true;
        Thread thread = new Thread(this::acceptLoop, "HishabAssetServer");
        thread.setDaemon(true);
        thread.start();
        return server.getLocalPort();
    }

    void stop() {
        running = false;
        try {
            if (server != null) server.close();
        } catch (IOException ignored) {
            // Closing an already-closed server is harmless.
        }
        executor.shutdownNow();
    }

    private void acceptLoop() {
        while (running) {
            try {
                Socket socket = server.accept();
                executor.execute(() -> handle(socket));
            } catch (IOException error) {
                if (running) {
                    // A transient accept failure should not kill the app.
                    try {
                        Thread.sleep(30);
                    } catch (InterruptedException ignored) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                }
            }
        }
    }

    private void handle(Socket socket) {
        try (Socket client = socket) {
            client.setSoTimeout(15000);
            InputStream input = client.getInputStream();
            BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8));
            String requestLine = reader.readLine();
            if (requestLine == null || requestLine.isEmpty()) return;

            String line;
            while ((line = reader.readLine()) != null && !line.isEmpty()) {
                // Drain request headers.
            }

            String[] parts = requestLine.split(" ");
            if (parts.length < 2) {
                writeText(client, 400, "Bad request");
                return;
            }
            String method = parts[0];
            if (!"GET".equals(method) && !"HEAD".equals(method)) {
                writeText(client, 405, "Method not allowed");
                return;
            }

            String path = URLDecoder.decode(parts[1], "UTF-8");
            int query = path.indexOf('?');
            if (query >= 0) path = path.substring(0, query);
            int fragment = path.indexOf('#');
            if (fragment >= 0) path = path.substring(0, fragment);
            if (path.isEmpty() || "/".equals(path)) path = "/index.html";
            if (!path.startsWith("/")) path = "/" + path;
            if (path.contains("..")) {
                writeText(client, 403, "Forbidden");
                return;
            }

            byte[] data;
            try (InputStream asset = assets.open(root + path)) {
                data = readAll(asset);
            } catch (IOException missing) {
                // A missing static file should be a real 404, not a fake app page.
                writeText(client, 404, "Not found");
                return;
            }

            String mime = mimeType(path);
            String header = "HTTP/1.1 200 OK\r\n"
                    + "Content-Type: " + mime + "\r\n"
                    + "Content-Length: " + data.length + "\r\n"
                    + "Cache-Control: no-cache\r\n"
                    + "X-Content-Type-Options: nosniff\r\n"
                    + "Connection: close\r\n\r\n";
            OutputStream out = client.getOutputStream();
            out.write(header.getBytes(StandardCharsets.UTF_8));
            if (!"HEAD".equals(method)) out.write(data);
            out.flush();
        } catch (Exception ignored) {
            // The WebView may close a connection while a page is navigating.
        }
    }

    private static byte[] readAll(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream(Math.max(1024, input.available()));
        byte[] buffer = new byte[16384];
        int count;
        while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        return output.toByteArray();
    }

    private static void writeText(Socket socket, int status, String text) throws IOException {
        byte[] body = text.getBytes(StandardCharsets.UTF_8);
        String header = "HTTP/1.1 " + status + " Error\r\n"
                + "Content-Type: text/plain; charset=utf-8\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Connection: close\r\n\r\n";
        OutputStream out = socket.getOutputStream();
        out.write(header.getBytes(StandardCharsets.UTF_8));
        out.write(body);
        out.flush();
    }

    private static String mimeType(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=utf-8";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript; charset=utf-8";
        if (lower.endsWith(".css")) return "text/css; charset=utf-8";
        if (lower.endsWith(".json") || lower.endsWith(".webmanifest")) return "application/json; charset=utf-8";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".wasm")) return "application/wasm";
        if (lower.endsWith(".pdf")) return "application/pdf";
        if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain; charset=utf-8";
        // .gz traineddata must stay application/octet-stream. Setting
        // Content-Encoding:gzip makes the browser decompress it once and then
        // Tesseract tries to decompress it again.
        if (lower.endsWith(".gz")) return "application/octet-stream";
        return "application/octet-stream";
    }
}
