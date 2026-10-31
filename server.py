# AI生成
# -*- coding: utf-8 -*-
# AI生成
"""本地静态服务（零依赖）：启动 / 停止 / 状态

用法:
    python server.py            # 启动（前台运行，自动打开浏览器）
    python server.py stop       # 停止
    python server.py status     # 查看状态

说明:
    - 双击 启动.cmd / 启动.command 即可，无需记命令。
    - 端口从 8000 起自动挑选空闲端口；PID 与端口写入同目录 .server.pid。
    - 前台运行：关闭窗口或按 Ctrl+C 也可停止。
    - 设置环境变量 APP_NO_OPEN=1 可跳过自动打开浏览器。
"""
import os
import sys
import signal
import socket
import subprocess

ROOT = os.path.dirname(os.path.abspath(__file__))
APPDIR = os.path.join(ROOT, 'app')
PIDFILE = os.path.join(ROOT, '.server.pid')


def free_port(start=8000, end=8050):
    for p in range(start, end):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.bind(('127.0.0.1', p))
            s.close()
            return p
        except OSError:
            s.close()
    return 0


def read_pid():
    try:
        with open(PIDFILE, 'r', encoding='utf-8') as f:
            parts = f.read().split()
        if parts:
            return int(parts[0]), (int(parts[1]) if len(parts) > 1 else 0)
    except Exception:
        pass
    return None, 0


def alive(pid):
    # 零依赖判断进程是否存在（Windows 用 tasklist，类 Unix 用 os.kill(pid, 0) 探测）
    if not pid:
        return False
    try:
        if os.name == 'nt':
            out = subprocess.run(['tasklist', '/FI', 'PID eq %d' % pid],
                                 capture_output=True, text=True)
            return str(pid) in (out.stdout or '')
        os.kill(pid, 0)
        return True
    except Exception:
        return False


def do_stop():
    pid, _port = read_pid()
    if not pid:
        print('没有运行中的服务（未发现 .server.pid）。')
        return 0
    if alive(pid):
        try:
            if os.name == 'nt':
                subprocess.run(['taskkill', '/PID', str(pid), '/F'],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                os.kill(pid, signal.SIGTERM)
            print('已停止 (PID %d)' % pid)
        except Exception as e:
            print('停止失败：%s' % e)
    else:
        print('进程可能已退出 (PID %d)。' % pid)
    try:
        os.remove(PIDFILE)
    except OSError:
        pass
    return 0


def do_status():
    pid, port = read_pid()
    if alive(pid):
        print('running  PID=%d  http://localhost:%d/' % (pid, port))
    else:
        print('not running')
    return 0


def open_browser(url):
    if os.environ.get('APP_NO_OPEN') == '1':
        return
    try:
        import webbrowser
        webbrowser.open(url)
    except Exception:
        pass


def do_start():
    index = os.path.join(APPDIR, 'index.html')
    if not os.path.isfile(index):
        print('[错误] 未找到 %s' % index)
        return 1

    pid, port = read_pid()
    if alive(pid):
        url = 'http://localhost:%d/' % (port or 8000)
        print('服务已在运行：%s (PID %d)' % (url, pid))
        open_browser(url)
        return 0

    port = free_port()
    if not port:
        print('[错误] 8000-8049 端口都不可用。')
        return 1

    with open(PIDFILE, 'w', encoding='utf-8') as f:
        f.write('%d %d\n' % (os.getpid(), port))

    url = 'http://localhost:%d/' % port
    print('已启动：%s' % url)
    print('停止：双击 停止.cmd（Windows）/ 停止.command，或运行 python server.py stop')
    print('（本窗口为服务窗口，可按 Ctrl+C 或直接关闭）')
    open_browser(url)

    import functools
    import http.server
    import socketserver

    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=APPDIR)
    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(('127.0.0.1', port), handler) as httpd:
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print('\n已停止。')
    finally:
        try:
            os.remove(PIDFILE)
        except OSError:
            pass
    return 0


def main():
    cmd = sys.argv[1].lower() if len(sys.argv) > 1 else 'start'
    if cmd in ('stop', 'kill'):
        return do_stop()
    if cmd == 'status':
        return do_status()
    return do_start()


if __name__ == '__main__':
    sys.exit(main())