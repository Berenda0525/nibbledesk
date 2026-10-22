---
type: note
status: 已核对来源
created: 2026-10-22
updated: 2026-10-22
tags: [项目, 编程]
---
# 第三方引用与许可

本文件区分实际代码依赖、资源集成和产品交互参考。依赖的精确版本以 `package-lock.json` 为准，许可证以对应版本的原文件为准。

## 服务与产品参考

- **APImart**：https://docs.apimart.ai/ 。作为可配置模型服务商，通过公开 API 接入。APImart 的平台服务及模型费用不属于本项目开源许可；使用者自行注册、配置密钥并承担调用费用。
- **ClawChat**：https://clawling.com/chat/ 。参考其 AI 伙伴、单聊与多模型群聊的产品思路；本仓库不包含 ClawChat 客户端、服务端、用户数据或连接凭据。
- **eIsland**：https://github.com/JNTMTMTM/eIsland 。参考 Windows 顶部浮层形态和交互。上游声明 GPLv3 及附加条款，具体见其 LICENSE；本项目没有把它列为 npm 依赖，也不以自己的许可覆盖上游条款。
- **Open Island**：https://github.com/Octane0411/open-vibe-island 。参考桌面 Agent 入口及展开/收起体验。上游仓库标示 GPL-3.0；本项目的 Windows 浮层由 `desktop/companion.mjs` 与 `desktop/companion/` 实现。

以上项目与服务均保留自己的名称、商标和权利，引用不表示官方合作、兼容性保证或背书。

## 代码与运行组件

| 组件 | 用途 | 来源与许可 |
| --- | --- | --- |
| DeepSeek Harness | 插件式 Agent 执行、会话与任务 | [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，所用 npm 包标示 MIT |
| Folia | 音乐网页应用 | [chthollyphile/folia-major](https://github.com/chthollyphile/folia-major)，AGPL-3.0；固定提交见下节 |
| NetEaseCloudMusicApiEnhanced | 本地音乐 API 宿主 | [api-enhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced)，所用包标示 MIT |
| whisper.cpp | 本地语音引擎 | [ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp)，MIT；来源与编译参数见 `resources/speech/provenance.json` |
| Whisper 模型 | 多语言语音转写 | [openai/whisper](https://github.com/openai/whisper)，随模型许可见 `resources/speech/LICENSE-model.txt` |
| ZetaOffice / LibreOffice | 可选 Office 页面转换与阅读 | [ZetaOffice](https://zetaoffice.net/)、[LibreOffice 许可](https://www.libreoffice.org/about-us/licenses/)；二进制另行准备并核对完整许可与对应源码 |
| Node.js | Windows 任务子进程运行时 | [nodejs.org](https://nodejs.org/)，随发行保留完整 LICENSE；固定下载信息见 `resources/runtime/node-provenance.json` |
| Electron、React、Vite、Lucide | 桌面、界面、构建与图标 | 各自上游与 npm 包保留原许可证，完整依赖见锁文件 |

## Folia 的对应源码和修改

- 上游：https://github.com/chthollyphile/folia-major
- 固定提交：`f3a90708afbec884934d8bca16bbd0a35feeb6a7`，上游版本 0.7.21。
- 固定源码包 SHA-256：`7559b6cf3e16aff1114b23dbd1bf1df2c904c75095146aa220620404f1405599`。
- `npm run resources:folia` 下载并校验对应源码；`npm run music:build` 从该源码构建集成网页。
- `scripts/build-folia.mjs`、`scripts/music-integration.mjs`：构建期的显示文案、导航和教程入口调整。
- `desktop/modules/music/folia-bridge.js`：歌词、播放状态和音频能量与宿主桥接。
- `desktop/modules/music/`：本机服务、网易云 API 宿主和网页会话隔离。
- 上游 LICENSE 保留于 `resources/folia-source/LICENSE`。本仓库不将第三方音乐内容、账号权限或平台服务授权再许可给使用者。

## 视觉资源

- 应用仓鼠头像：为瓜瓜生成的透明背景图像，位于 `desktop/assets/guagua-icon.png`，仓库发布使用该版本。
- Claude、Kimi 的社区矢量图来自 [Lobe Icons](https://github.com/lobehub/lobe-icons)，MIT 许可保留于 `public/assets/LOBE-ICONS-LICENSE.txt`。
- GPT 图形来源于 [OpenAI 品牌资源](https://openai.com/brand/)；Gemini 图形来源于 [Google Gemini](https://gemini.google.com/)；DeepSeek 图形来源于 [DeepSeek 聊天官网](https://chat.deepseek.com/)。
- 豆包头像为项目选用的豆包人物图形，以圆形容器展示。该第三方品牌图形不因本项目采用 AGPL 而取得新的开放素材许可。
- 抖音、小红书、B 站等平台图标用于识别对应网页入口；相应商标与图形归各自权利人所有。

AGPL 适用于瓜瓜的应用源码，不覆盖第三方商标、品牌素材和媒体内容的独立权利。再分发前应检查这些素材的适用条款；替换素材时保留来源和许可记录。
