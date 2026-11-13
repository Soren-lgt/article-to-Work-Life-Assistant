# -*- coding: utf-8 -*-
"""工作生活助手 · 移动版本地预览服务。
以项目根目录为静态根（页面通过 ../../app 复用业务层），不修改原 app/server.py。
用法：python serve-mobile.py [端口]  默认 8088
"""
import http.server, socketserver, sys, pathlib, webbrowser

ROOT = pathlib.Path(__file__).resolve().parent.parent  # mobile/ 的上一级 = 项目根
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8088

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)
    def log_message(self, fmt, *args):
        pass

if __name__ == "__main__":
    url = f"http://127.0.0.1:{PORT}/mobile/index.html"
    print("工作生活助手 · 移动版预览：", url)
    print("按 Ctrl+C 停止。Service Worker / PWA 安装仅在 http(s) 或 localhost 下可用。")
    try:
        with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")
