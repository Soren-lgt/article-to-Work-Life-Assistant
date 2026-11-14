# 安卓安装包（APK）—— 自己打，不依赖第三方打包站

这里放的是「朝暮」手机版的安卓壳源码与一键构建脚本。
打出来的 APK 打开后加载**线上同一份**手机版页面（`https://soren-lgt.github.io/article-to-Work-Life-Assistant/mobile/index.html`），
所以以后改网页不用重新打 APK，手机上有网打开就是最新版。

## 产物

- `chaomu-1.0.1.apk` —— 可直接安装的安装包（包名 `com.worklife.assistant`，应用名「朝暮」）
- 只有 `INTERNET` 一项权限；没有第三方统计脚本、没有广告 SDK

## 重新打包

```powershell
cd mobile\android
python build_apk.py
```

依赖（本机已装好）：

- JDK 17：`%LOCALAPPDATA%\jdk17\jdk-17.0.21+9`（JDK 26 跑 d8 会崩，别换）
- Android SDK：`%LOCALAPPDATA%\android-sdk`（platforms;android-34、build-tools;34.0.0、platform-tools）
- Python：装 `Pillow`（用 512 图标缩放出 5 档启动图标）

脚本内部做的事（不用 Gradle）：`aapt2 compile` → `aapt2 link` → `javac --release 8 -encoding UTF-8`
→ `d8` 生成 `classes.dex` → 塞回 apk → `zipalign` → `apksigner sign`。

> 坑：`aapt2` 不认中文路径，所以中间产物全在 `%TEMP%\wl-apk-build` 里构建，最后把 APK 拷回本目录。
> 坑：`javac` 在中文 Windows 上默认按 GBK 读源码，必须显式 `-encoding UTF-8`。

## 签名

签名证书在 `%USERPROFILE%\.worklife-apk\worklife.jks`（口令 `worklife2026`，别名 `worklife`）。
**别删**——同一包名升级安装必须用同一签名，删了就只能先卸载再装。
证书 SHA-256：`03A3EEFFF9745463BCB789744F109D144B9AAC4249B2318ECC070CB332CF2A7F`

## 装到手机

1. 把 `chaomu-1.0.1.apk` 传到手机（微信文件助手 / 数据线 / GitHub 下载都行）
2. 手机上点开安装，允许「安装未知来源应用」
3. 首次打开是空的（壳里的 WebView 和手机浏览器数据不互通）：先在「账号管理」注册/登录，
   再用「加载数据」导入在浏览器里导出的 JSON 备份

## 已知限制（WebView 壳的固有约束，不是 bug）

- **没有系统通知栏提醒**：WebView 里跑不了 Service Worker，网页里的「开启手机通知」会提示不可用。
  想要系统通知，用手机浏览器打开线上地址并「添加到主屏幕」安装 PWA。
- **首次打开必须联网**：页面走线上加载，离线缓存（SW）在壳里不生效。
- 顶部没有浏览器地址栏，返回键会先退页面、再退应用；站外链接（比如下载备份）交给系统浏览器打开。
