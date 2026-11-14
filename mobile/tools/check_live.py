# -*- coding: utf-8 -*-
"""上线自检：把 mobile 页面真正会用到的每个资源，逐个请求线上地址，确认全部 200。

用法（项目根目录）：
    python mobile/tools/check_live.py

为什么需要它：页面用 ES module，任何一个 import 返回 404，整页脚本就完全不执行，
表现是「界面能看、点什么都没反应」。这类问题本地测不出来，只有线上能发现。
"""
import io
import os
import re
import sys
import time
import urllib.request

BASE = "https://soren-lgt.github.io/article-to-Work-Life-Assistant/"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def collect():
    """只取页面真正会加载的资源：mobile 的 js/css/icons 与根文件，加上 app/js 里被 import 的文件。"""
    targets = []
    keep_root = ("index.html", "sw.js", "manifest.webmanifest")
    for dirpath, _dirnames, filenames in os.walk(os.path.join(ROOT, "mobile")):
        rel_dir = os.path.relpath(dirpath, os.path.join(ROOT, "mobile")).replace(os.sep, "/")
        if rel_dir != "." and not rel_dir.startswith(("js", "css", "icons")):
            continue
        for fn in filenames:
            if not fn.endswith((".js", ".css", ".webmanifest", ".png", ".svg", ".html", ".json")):
                continue
            if rel_dir == "." and fn not in keep_root:
                continue
            targets.append(os.path.relpath(os.path.join(dirpath, fn), ROOT).replace(os.sep, "/"))
    imported = set()
    for dirpath, _dirnames, filenames in os.walk(os.path.join(ROOT, "mobile", "js")):
        for fn in filenames:
            if not fn.endswith(".js"):
                continue
            path = os.path.join(dirpath, fn)
            text = io.open(path, encoding="utf-8").read()
            for m in re.finditer(r"from[\s]+['\"]([^'\"]+)['\"]", text):
                rel = m.group(1)
                if not rel.startswith("."):
                    continue
                abs_p = os.path.normpath(os.path.join(os.path.dirname(path), rel))
                line = os.path.relpath(abs_p, ROOT).replace(os.sep, "/")
                if line.startswith("app/"):
                    imported.add(line)
    targets.extend(sorted(imported))
    return sorted(set(targets))


def main():
    targets = collect()
    bad = []
    for rel in targets:
        url = BASE + rel
        err = None
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, method="GET")
                req.add_header("User-Agent", "chaomu-check")
                urllib.request.urlopen(req, timeout=25).read(1)
                err = None
                break
            except Exception as exc:
                err = exc
                if getattr(exc, "code", None) == 404:
                    break
                time.sleep(1.5 * (attempt + 1))
        if err is not None:
            bad.append((rel, getattr(err, "code", str(err))))
    print("checked %d urls, failed %d" % (len(targets), len(bad)))
    for rel, code in bad:
        print("  %s  %s" % (code, rel))
    if bad:
        print("\n线上有资源 404 —— 页面脚本会整片不执行，先把它补上再发布。")
        return 1
    print("全部 200，页面依赖完整。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
