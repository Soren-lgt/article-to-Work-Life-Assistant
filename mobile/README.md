# 工作生活助手 · 移动版（PWA）

面向手机浏览器的可安装版本，功能对齐电脑版 7 个模块；**数据保存在手机本机浏览器 IndexedDB**，可通过 JSON 备份与电脑版互相迁移。本目录为新增代码，**不修改 `app/` 网页版与 `desktop/` Electron 电脑版**。

## 功能模块

| 模块 | 能力 |
| --- | --- |
| 首页总览 | 今日待办、记账、题库、协作四摘要卡，待办可直接勾选 |
| 今日计划 | 按日期增删改、勾选完成、优先级、备注、前后日切换、月度概览 |
| 每日记账 | 记账卡片、点卡记一笔（同卡同日替换）、日期选择、月度汇总 |
| 题库 | 三分类题库管理、顺序练习即时判分、跨全部题库随机考试（倒计时交卷）、成绩历史查看与删除 |
| 开发工作 | 开发任务（按项目分组）、Bug 记录、代码片段（展开/复制） |
| 同组计划 | 小组切换、项目看板、成员管理与入组码审核、附件上传下载删除、操作日志、通知已读 |
| 设置 | 数据概览、备份导出/导入（覆盖/合并）、分模块清空与整体重置、五套主题、默认页、通知开关、预置记账卡片管理 |

## 运行方式

### 方式一：本地预览（推荐，支持 PWA 离线缓存）
在 `mobile/` 目录执行：

```
python serve-mobile.py
```

浏览器打开终端打印的地址（默认 `http://127.0.0.1:8088/mobile/index.html`）。
该脚本以项目根为静态根，因此页面能正常复用 `app/js/lib` 业务层；**不会改动原 `app/server.py`**。

### 方式二：直接打开文件（受限）
双击 `mobile/index.html` 也能进入主流程，但 `file://` 下浏览器不注册 Service Worker（无离线缓存），且部分浏览器对模块脚本有限制；正式使用请走方式一或部署到 https。

### 安装到手机主屏（PWA）
- Android Chrome：打开页面 → 菜单 →「添加到主屏幕 / 安装应用」。
- iOS Safari：打开页面 → 分享 →「添加到主屏幕」；iOS 安装与离线能力通常要求页面经 https 访问。
- 安装前提：页面需经 `http://localhost` 或 `https://` 访问；`file://` 无法注册 Service Worker。

## 数据存储与迁移

- 移动版使用独立 IndexedDB 库名 `worklife-mobile`，与电脑版默认库 `worklife` **物理隔离**，互不污染。
- 备份 JSON 顶层格式 `{version, exportedAt, app:'worklife-app', stores}` 与电脑版一致：
  - 电脑版导出的备份可在移动版「设置 → 从备份文件恢复」导入（覆盖或合并）；
  - 移动版导出的备份也可导回电脑版。
- 偏好（主题、默认页、通知开关）存于 `localStorage` 键 `worklife-mobile.prefs`，同样独立于电脑版。

## 目录结构

```
mobile/
├─ index.html              # 单壳：顶栏 + 7 视图容器 + 底部导航
├─ manifest.webmanifest    # PWA 清单（名称/图标/standalone 主题色）
├─ sw.js                   # Service Worker（首屏预缓存 + 缓存优先）
├─ serve-mobile.py         # 本地预览静态服务（独立，不改原 server.py）
├─ css/mobile.css          # 五套主题变量 + 移动布局 + 复用弹窗样式
├─ js/main.js              # 启动器：独立库名、路由、账号弹窗、通知、主题、SW 注册
├─ js/views/               # 7 个移动视图（home/today/ledger/quiz/devwork/group/settings）
└─ icons/                  # favicon.svg 与 192/512 应用图标
```

## 复用与边界

- 只读复用 `app/js/lib/*` 纯业务层（数据、账号、各模块逻辑、判分、备份、主题）与 `app/js/ui/modal.js` 弹窗；移动 UI 在 `mobile/` 内重写。
- `app/`、`desktop/` 源码零改动；回归测试仍在 `app/` 目录用 `node --test` 运行。
