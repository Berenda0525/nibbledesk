---
type: note
status: 持续更新
created: 2026-10-22
updated: 2026-10-22
tags: [项目, 编程]
---
# 本地语音输入

瓜瓜主窗口和 Island 共用本地转写适配器。录音先转换为 16 kHz 单声道 PCM16 WAV，再交给本机进程识别，文字填入输入框，由使用者编辑并发送。

## 中文识别组件

可选链路为 **sherpa-onnx v1.13.8 + SenseVoiceSmall int8**，面向 Windows x64 CPU，不依赖 Python、GPU 或付费云服务。完整组件存在时优先使用 SenseVoice；未准备该组件时使用原有 Whisper。识别失败会直接显示错误，不会自动上传录音或切换到外部服务。

先阅读 [模型许可](../resources/speech/LICENSE-sensevoice-model.txt)，同意其条款后在项目根目录运行：

```powershell
node scripts/prepare-speech.mjs --accept-model-license
```

此命令下载约 180 MiB 压缩资源，解包后的运行文件约 250 MiB，均存放于项目目录。引擎、模型和每个部署文件分别校验 SHA-256，来源及校验信息见 [资源清单](../resources/speech/sensevoice-provenance.json)。不会更改系统环境或读取聊天、密钥。

设置 → 桌面与语音 → 开启语音输入；普通话建议选择“中文”。设置页显示当前实际可用引擎。应用启动后不自动下载模型。

## 许可与分发

- sherpa-onnx：Apache-2.0，见 `resources/speech/LICENSE-sherpa-onnx.txt`。
- ONNX Runtime 1.28.2：MIT，并保留第三方声明。
- SenseVoiceSmall 模型：**FunASR Model Open Source License Agreement 1.1**，与应用 AGPL 源码许可分别适用，不能按引擎的 Apache/MIT 许可替代模型条款。
- 本仓库提供适配代码、固定来源和许可；模型权重及运行二进制不纳入 Git。准备安装包时若包含这些资源，应一并保留对应许可、声明和来源。

## 验收范围

2026-10-22 在维护机器完成本地原生引擎调用：两段 3.66 秒和 7.91 秒合成中文句子均返回完整文字，单次总耗时约 2.6–3.1 秒，包含进程启动及模型载入。人名和“瓜瓜”等专有名词仍可能出现同音字。这不是实际麦克风识别率测试，也不是跨设备性能承诺。

自动测试覆盖 WAV 参数、资源选择、中文输出、取消、并发、异常输出和临时录音清理。实际麦克风、口音、背景声、长录音的准确性仍需由使用者验证。录音文件在任务结束后清理，不作为常规日志保留。

上游资料：[SenseVoice 模型说明](https://k2-fsa.github.io/sherpa/onnx/sense-voice/pretrained.html)、[模型来源](https://huggingface.co/FunAudioLLM/SenseVoiceSmall)。
