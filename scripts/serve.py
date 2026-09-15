#!/usr/bin/env python3
"""Serves ui/ for `tauri dev`.

The only reason this is not `python3 -m http.server` is caching. That sends no
Cache-Control, so the webview applies heuristic freshness and shows you the
stylesheet and the modules from some minutes ago — including, confusingly, on
a fresh run of the app. Everything here is no-store, and conditional requests
are ignored so nothing can come back 304 either.
"""
import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ASSET = re.compile(rb'(?P<a>(?:src|href)=")(?P<p>(?:src|css)/[\w./-]+)(?P<b>")')
IMPORT = re.compile(rb"(?P<a>(?:from|import)\s*\(?\s*['\"])(?P<p>\./[\w./-]+\.js)(?P<b>['\"])")


def newest(root):
    """Latest mtime anywhere under root, as the cache-busting token."""
    latest = 0
    for base, _, files in os.walk(root):
        for f in files:
            try:
                latest = max(latest, os.stat(os.path.join(base, f)).st_mtime_ns)
            except OSError:
                pass
    return str(latest // 1_000_000)


class NoCache(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript', '.mjs': 'text/javascript',
        '.css': 'text/css', '.org': 'text/plain; charset=utf-8',
    }

    def send_head(self):
        self.headers.__delitem__('If-Modified-Since')
        self.headers.__delitem__('If-None-Match')
        return super().send_head()

    def do_GET(self):
        """Stamp a token onto every asset URL and every relative import.

        no-store alone is not enough: a copy cached *before* that header
        existed is still considered fresh, and the app keeps running code from
        an hour ago. Changing the URL leaves the browser no choice. The token
        is the newest mtime under ui/, so it only changes when something does.
        """
        path = self.translate_path(self.path.split('?', 1)[0])
        if path.endswith(('.html', '.js')) and os.path.isfile(path):
            token = (self.path.split('v=', 1)[1].split('&')[0]
                     if 'v=' in self.path else newest(self.directory)).encode()
            body = open(path, 'rb').read()
            stamp = lambda m: m['a'] + m['p'] + b'?v=' + token + m['b']
            body = (ASSET if path.endswith('.html') else IMPORT).sub(stamp, body)
            self.send_response(200)
            self.send_header('Content-type', self.guess_type(path))
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, *a):
        pass                      # tauri dev prints plenty already


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    root = sys.argv[2] if len(sys.argv) > 2 else 'ui'
    with ThreadingHTTPServer(('127.0.0.1', port), partial(NoCache, directory=root)) as srv:
        print(f'gitrove: serving {root}/ on http://localhost:{port} (no-store)', flush=True)
        srv.serve_forever()
