# 朝暮 · 安卓安装包构建脚本（不依赖 Gradle，只用 Android SDK 的 aapt2 / d8 / zipalign / apksigner）
# 用法：python build_apk.py
# 需要：JDK 17+（本机 C:\Program Files\Java\latest\jdk-26）、Android SDK（本机 %LOCALAPPDATA%\android-sdk）
# 注意：aapt2 不认中文路径，所以中间产物一律在 %TEMP%\wl-apk-build 里构建，最后把 apk 拷回本目录。
import io
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SDK = os.path.join(os.environ.get("LOCALAPPDATA", ""), "android-sdk")
BT = os.path.join(SDK, "build-tools", "34.0.0")
ANDROID_JAR = os.path.join(SDK, "platforms", "android-34", "android.jar")
JAVA_HOME = os.path.join(os.environ["LOCALAPPDATA"], "jdk17", "jdk-17.0.21+9")
KEYSTORE = os.path.join(os.environ["USERPROFILE"], ".worklife-apk", "worklife.jks")
KEY_PASS = "worklife2026"

APP_NAME = "朝暮"
PKG = "com.worklife.assistant"
VERSION_CODE = "4"
VERSION_NAME = "1.0.3"

WORK = os.path.join(os.environ["TEMP"], "wl-apk-build")
RES = os.path.join(WORK, "res")
SRC = os.path.join(WORK, "java")
BUILD = os.path.join(WORK, "out")


def run(args, cwd=None):
    print(">", os.path.basename(args[0]), " ".join(args[1:])[:220])
    env = dict(os.environ)
    env["JAVA_HOME"] = JAVA_HOME
    env["PATH"] = os.path.join(JAVA_HOME, "bin") + ";" + env.get("PATH", "")
    p = subprocess.run(args, cwd=cwd, env=env, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    out = (p.stdout or "") + (p.stderr or "")
    if p.returncode != 0:
        print(out[-3000:])
        raise SystemExit("FAILED: " + args[0] + " (code %s)" % p.returncode)
    for line in out.strip().splitlines()[-5:]:
        print("   ", line.strip())
    return out


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    io.open(path, "w", encoding="utf-8", newline="\n").write(text)


def stage():
    if os.path.isdir(WORK):
        shutil.rmtree(WORK)
    os.makedirs(BUILD)
    # 1) 源码
    src_java = os.path.join(HERE, "java")
    if not os.path.isdir(src_java):
        raise SystemExit("缺少源码目录：" + src_java)
    shutil.copytree(src_java, SRC)
    # 2) AndroidManifest
    manifest = """<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="%s"
    android:versionCode="%s"
    android:versionName="%s">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
    <uses-permission android:name="android.permission.USE_EXACT_ALARM" />

    <application
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher"
        android:allowBackup="true"
        android:hardwareAccelerated="true"
        android:usesCleartextTraffic="false"
        android:supportsRtl="true"
        android:theme="@android:style/Theme.Material.Light.NoActionBar">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden|screenLayout|smallestScreenSize|uiMode"
            android:windowSoftInputMode="adjustResize"
            android:launchMode="singleTop">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- 计划提醒到点由系统闹钟叫醒这里，App 没开着也能响 -->
        <receiver
            android:name=".NotifyReceiver"
            android:exported="false" />
    </application>
</manifest>
""" % (PKG, VERSION_CODE, VERSION_NAME)
    write(os.path.join(WORK, "AndroidManifest.xml"), manifest)

    # 3) 资源
    write(os.path.join(RES, "values", "strings.xml"),
          '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">%s</string>\n</resources>\n' % APP_NAME)
    from PIL import Image
    icon_src = os.path.normpath(os.path.join(HERE, "..", "icons", "icon-512.png"))
    if not os.path.exists(icon_src):
        raise SystemExit("找不到源图标：" + icon_src)
    for dens, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
        d = os.path.join(RES, "mipmap-" + dens)
        os.makedirs(d, exist_ok=True)
        Image.open(icon_src).convert("RGBA").resize((px, px), Image.LANCZOS).save(
            os.path.join(d, "ic_launcher.png"))
    print("   图标已生成 5 档")


def build():
    for t in ["aapt2", "zipalign"]:
        p = os.path.join(BT, t + ".exe")
        if not os.path.exists(p):
            raise SystemExit("缺少 build-tools 程序：" + p)
    if not os.path.exists(ANDROID_JAR):
        raise SystemExit("缺少 android.jar：" + ANDROID_JAR)

    res_zip = os.path.join(BUILD, "res.zip")
    run([os.path.join(BT, "aapt2.exe"), "compile", "--dir", RES, "-o", res_zip])

    base_apk = os.path.join(BUILD, "base.apk")
    gen = os.path.join(BUILD, "gen")
    os.makedirs(gen)
    run([os.path.join(BT, "aapt2.exe"), "link",
         "-o", base_apk,
         "-I", ANDROID_JAR,
         "--manifest", os.path.join(WORK, "AndroidManifest.xml"),
         "-R", res_zip,
         "--java", gen,
         "--min-sdk-version", "21",
         "--target-sdk-version", "34",
         "--version-code", VERSION_CODE,
         "--version-name", VERSION_NAME,
         "--auto-add-overlay"])

    classes = os.path.join(BUILD, "classes")
    os.makedirs(classes)
    javas = []
    for root, _d, files in os.walk(SRC):
        javas += [os.path.join(root, f) for f in files if f.endswith(".java")]
    for root, _d, files in os.walk(gen):
        javas += [os.path.join(root, f) for f in files if f.endswith(".java")]
    run([os.path.join(JAVA_HOME, "bin", "javac.exe"), "--release", "8", "-encoding", "UTF-8",
         "-classpath", ANDROID_JAR, "-d", classes] + javas)

    dex_dir = os.path.join(BUILD, "dex")
    os.makedirs(dex_dir)
    cf = []
    for root, _d, files in os.walk(classes):
        cf += [os.path.join(root, f) for f in files if f.endswith(".class")]
    run([os.path.join(BT, "d8.bat"), "--lib", ANDROID_JAR, "--min-api", "21",
         "--output", dex_dir] + cf)

    import zipfile
    dex = os.path.join(dex_dir, "classes.dex")
    if not os.path.exists(dex):
        raise SystemExit("d8 没有产出 classes.dex")
    with zipfile.ZipFile(base_apk, "a", zipfile.ZIP_DEFLATED) as z:
        z.write(dex, "classes.dex")
    print("   classes.dex %d bytes" % os.path.getsize(dex))

    aligned = os.path.join(BUILD, "aligned.apk")
    run([os.path.join(BT, "zipalign.exe"), "-f", "4", base_apk, aligned])

    if not os.path.exists(KEYSTORE):
        os.makedirs(os.path.dirname(KEYSTORE), exist_ok=True)
        run([os.path.join(JAVA_HOME, "bin", "keytool.exe"), "-genkeypair",
             "-keystore", KEYSTORE, "-alias", "worklife", "-keyalg", "RSA",
             "-keysize", "2048", "-validity", "10000",
             "-storepass", KEY_PASS, "-keypass", KEY_PASS,
             "-dname", "CN=WorkLife Assistant, OU=Personal, O=WorkLife, L=Changsha, ST=Hunan, C=CN"])
        print("   已生成签名证书（以后重打包复用，升级安装才不会被拒）")

    signed = os.path.join(BUILD, "chaomu-%s.apk" % VERSION_NAME)
    run([os.path.join(BT, "apksigner.bat"), "sign",
         "--ks", KEYSTORE, "--ks-pass", "pass:" + KEY_PASS,
         "--key-pass", "pass:" + KEY_PASS,
         "--out", signed, aligned])
    run([os.path.join(BT, "apksigner.bat"), "verify", signed])

    final = os.path.join(HERE, "chaomu-%s.apk" % VERSION_NAME)
    shutil.copyfile(signed, final)
    print("APK:", final, os.path.getsize(final), "bytes")
    return final


if __name__ == "__main__":
    stage()
    build()
