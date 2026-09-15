#!/usr/bin/env python3
"""Serves ui/ for `tauri dev`.

The only reason this is not `python3 -m http.server` is caching. That sends no
Cache-Control, so the webview applies heuristic freshness and shows you the
stylesheet and the modules from some minutes ago — including, confusingly, on
a fresh run of the app. Everything here is no-store, and conditional requests
are ignored so nothing can come back 304 either.
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


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
