---
type: note
status: 持续更新
created: 2026-10-22
updated: 2026-10-22
tags: [项目, 编程]
---
# 构建与运行

目标平台为 Windows 10/11 x64。准备 Node.js 24、npm 和 Git；原生桌面辅助程序还需要系统 .NET Framework 编译工具。运行时资源不提交到 Git。

## 界面和聊天

```powershell
npm ci
npm run resources:node
npm run build
npm run desktop
```

`resources:node` 从 Node.js 官方固定版本下载 `node.exe`，核对 SHA-256 后放入 `resources/runtime/`，供隔离任务子进程使用，不更改系统 Node.js。聊天服务由使用者在应用设置中配置，不在源码中填写个人 API Key。

`npm run dev` 仅运行浏览器前端开发服务器；完整 IPC、文件访问、密钥存储和桌面功能需要 Electron。

## 桌面 Island 和通知

```powershell
powershell -NoProfile -File scripts/build-desktop-bridge.ps1
```

原生程序由 `desktop/native/*.cs` 构建。系统不支持相应 Windows 接口时，桌面检测或通知可能不可用；权限提示由使用者自行处理。

## 音乐

```powershell
npm run resources:folia
npm --prefix .build-cache/folia-major-source ci --ignore-scripts
npm run music:build
```

源码包固定提交和校验值见 [第三方引用](THIRD_PARTY.md)。构建输出为 `resources/folia-web-1.5/`，与桌面宿主配置对应。网页端与本地 API 宿主共同提供功能；平台登录需用户自行完成。

## 办公引擎

```powershell
node scripts/fetch-office-runtime.mjs
```

脚本下载 ZetaOffice 的 `soffice.js`、WASM、数据包和元数据，总体积较大。当前 CDN 入口包含 `latest`，可能发生变化；下载后检查生成的 `manifest.json`，发行前固定并核对资源版本、完整许可证与对应源码。不把本机 WPS、付费模板或私人文档复制进资源目录。

## Whisper 本地语音

精确来源、固定提交、工具链和编译参数记录于 `resources/speech/provenance.json`；许可证和兼容性补丁随仓库提供。

1. 从记录的 whisper.cpp v1.9.2 源码构建，应用 `source-compatibility.patch`。
2. 使用记录的 LLVM-MinGW/CMake 配置构建 Windows x64 CPU 版本，保留通用 x64 后端。将 `whisper-cli.exe`、`libwhisper.dll` 和相应 GGML DLL 放入 `resources/speech/runtime/Release/`。
3. 从记录的官方模型来源取得多语言 `ggml-base.bin`，放入 `resources/speech/models/`，核对 SHA-256 为 `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe`。
4. 如果更换构建工具链或引擎版本，更新来源记录并重新验证中文、英语、取消、静音和长音频，不声称与旧二进制逐字节相同。

未准备这些文件时，语音功能不会凭空下载模型或向云端发送录音。

## 验证和打包

```powershell
npm test
npm run check:public
npm run build
npm run pack -- --plan
npm run pack:dir
npm run qa:prepare -- --plan
npm run qa:prepare
```

自动测试使用本地模拟接口；`scripts/live-check.mjs` 是收费平台的真实接口探针，只有提供自己的配置并明确接受费用后才单独运行。

运行 `pack` 前准备所有 `package.json` 中声明的资源和许可证，包含音乐网页/源码资料、办公、语音、任务 Node 运行时及原生程序。缺失资源应先补齐，不能把开发机的整个安装目录或数据目录作为发行输入。

发行产物固定在项目 `release/<版本>/`，新验收证据在 `输出/测试/`。源码快照使用 `.build-cache/release-source-current/`。外部运行验收使用源码所在盘符根的 `GuaguaBuild/qa/<版本>/`，避免借用上级 `node_modules` 掩盖漏打包依赖。

验收完成后运行 `npm run pack:installer`。已有同版输出时命令会停止，先核对再处理。保留当前正式版及确有回退需要的上一版；清理必须先列明范围并确认，不能自动删除用户数据。`npm run artifacts:audit` 只盘点，不删除。

重新分发二进制前，应核对第三方许可、对应源码、资源哈希和实际安装过程。当前仓库的 CI/本地回归不替代干净 Windows 机器上的完整验收。

## 中文语音组件

可选 SenseVoice 本机链路的准备方式、固定资源和模型独立许可见 [本地语音输入](SPEECH.md)。
