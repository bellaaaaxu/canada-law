# Canada Law — 让你的 AI 助手查 BC 和联邦劳动法

[![CI](https://github.com/bellaaaaxu/canada-law/actions/workflows/ci.yml/badge.svg)](https://github.com/bellaaaaxu/canada-law/actions/workflows/ci.yml) [![Release](https://img.shields.io/github/v/release/bellaaaaxu/canada-law)](https://github.com/bellaaaaxu/canada-law/releases) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English](README.md)

一套给 AI 助手用的劳动法查询工具。你用中文或英文问 BC（不列颠哥伦比亚省）和联邦监管行业的劳动法问题（加班、餐休、法定假日、工资、各种假期、解雇等等），AI 可以用它到 BC Laws 和联邦司法部 Justice Laws 网站取**现行的官方原文**，带出法律名称、条号、原文链接和官方「现行至」日期。

它通过两个开放标准接入大多数 AI 助手：[Agent Skills](https://agentskills.io) 和 [MCP](https://modelcontextprotocol.io)。支持 Claude、OpenAI Codex / ChatGPT 桌面版、GitHub Copilot、Cursor、Gemini CLI、谷歌 Antigravity、Kiro、通义 Qwen Code、Kimi Code 等。

> **请先看这五条**
> - 这是一般性的法律信息，**不是法律意见**。
> - **AI 用不用、怎么用这个工具，由你用的软件和模型决定。** 它有时会不查原文、直接凭记忆回答（在 Claude 桌面版里见过）。想确保它查原文，就在问题里加一句「用 Canada Law 查官方原文」。
> - **收了 BC 省的法律和联邦劳动法。** 大多数 BC 的工作场所适用 BC 法律；联邦监管的行业（银行、航空、电信、跨省运输等）适用《加拿大劳动法典》（*Canada Labour Code*），法典和它的配套条例都收了。其他联邦法律，比如失业保险（EI）、加拿大退休金（CPP），不在搜索范围内。
> - 法规原文**不是官方版本**（见[许可](#许可)）。
> - AI 可能补充官方原文里没有的内容（比如各个假日的具体日期）。规则要求它把这些单独放在一段、标明「没有核对原文」，但它不一定每次都做到。**请以回答里引用的条文和链接为准。**

## 回答长什么样

下面是测试里的一份真实回答（Claude Code 加上这个 skill，2026 年 9 月 26 日），一字未改，只把小标题换成了加粗。更多回答见 [docs/acceptance](docs/acceptance)。

> **问：BC 员工连续工作多久必须给餐休？**
>
> **法律原文**
>
> > **32 (1)** An employer must ensure
> > (a) that no employee works more than **5 consecutive hours** without a meal break, and
> > (b) that each meal break lasts at least a **1/2 hour**.
> >
> > **(2)** An employer who requires an employee to work or be available for work during a meal break must count the meal break as time worked by the employee.
>
> **含义**
>
> BC 的《就业标准法》规定，雇主必须确保员工**连续工作不超过 5 小时**就要给一次餐休，且每次餐休**至少 30 分钟**。如果雇主要求员工在餐休期间工作或待命，则该餐休时间必须算作工作时间并支付工资。
>
> **决定适用情况的因素**
>
> - 员工是否连续工作了超过 5 小时而未获得餐休。
> - 餐休期间员工是否被要求工作或待命（如果是，则餐休算作带薪工作时间）。
> - 该工作场所是否属于 BC 省管辖（联邦监管行业如银行、航空、电信、跨省运输等适用联邦法律，本技能暂不涵盖）。
>
> **来源**
>
> - **Employment Standards Act**, RSBC 1996, c. 113, s. 32
>   - 链接：https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/96113_01#section32
>   - 更新至：2026-09-22
>
> Text from BC Laws (www.bclaws.gov.bc.ca) under the King's Printer Licence; not an official version. This is general legal information, not legal advice.

（这份回答来自 0.1 版，那时还没有加入联邦法律。回答格式没有变。）

## 安装

需要 [Node.js](https://nodejs.org) 20 或更新版本。然后运行：

```bash
npx https://github.com/bellaaaaxu/canada-law/releases/download/v0.2.1/canada-law-0.2.1.tgz install
```

安装器会找出你电脑上装了哪些 AI 工具，**先列出要改哪些地方，问过你才动手**。它改任何配置文件之前都会先备份，也不会覆盖你自己原有的设置。

| 命令 | 作用 |
|---|---|
| `… install` | 装进这台电脑上找到的所有支持的工具 |
| `… install cursor codex` | 只装进你点名的工具（名字见 `list`） |
| `… install --print` | 只显示会改什么，不动手 |
| `… install --yes` | 不再询问，直接安装 |
| `… status` | 查看装在了哪里 |
| `… list` | 列出支持的工具 |
| `… uninstall` | 删掉安装器装的所有东西 |

（`…` 代表 `npx https://github.com/bellaaaaxu/canada-law/releases/download/v0.2.1/canada-law-0.2.1.tgz`。）

### Claude 桌面版：不用装 Node.js

在[发布页](https://github.com/bellaaaaxu/canada-law/releases)下载 `canada-law-0.2.1.mcpb`，双击就能安装。也可以把它拖进 Claude 桌面版的窗口，或者在「设置 → Extensions → Advanced settings → Install Extension…」里选这个文件。Claude 桌面版自带 Node.js。

## 支持的 AI 工具

| 工具 | skill 放在 | MCP 服务器 | 已实测 |
|---|---|---|---|
| Claude Code | `~/.claude/skills/` | `claude mcp add` | ✅ |
| Claude 桌面版 | （Code 标签页读取 Claude Code 的 skills） | 配置文件，或上面的 `.mcpb` | — |
| OpenAI Codex（命令行、IDE 扩展、ChatGPT 桌面版） | `~/.agents/skills/` | `~/.codex/config.toml` | — |
| VS Code / GitHub Copilot | `~/.agents/skills/` | 自己运行 `code --add-mcp`（安装器会把命令打出来） | — |
| Cursor | `~/.agents/skills/` | `~/.cursor/mcp.json` | — |
| Gemini CLI | `~/.agents/skills/` | `~/.gemini/settings.json` | — |
| GitHub Copilot CLI | `~/.agents/skills/` | `~/.copilot/mcp-config.json` | — |
| 谷歌 Antigravity | `~/.gemini/config/skills/`、`~/.gemini/antigravity-cli/skills/` | `~/.gemini/config/mcp_config.json` | — |
| Kiro | `~/.kiro/skills/` | `~/.kiro/settings/mcp.json` | — |
| 通义 Qwen Code | `~/.qwen/skills/` | `~/.qwen/settings.json` | — |
| OpenCode | `~/.agents/skills/` | `~/.config/opencode/opencode.json` | — |
| Kimi Code CLI | `~/.agents/skills/` | `~/.kimi-code/mcp.json` | — |
| Cline | `~/.cline/skills/` | 用 `cline mcp` 自己添加 | — |
| DeepSeek Harness | `~/.agents/skills/` | 只装 skill（开发预览版） | — |

✅ 表示在真实安装上测过。其余的都照各工具的官方文档写成；如果你试过，欢迎告诉我们结果。

Claude 桌面版扩展（`.mcpb`）也在真实安装上测过（Windows 微软商店版，2026 年 9 月）：能装上、用桌面版自带的 Node.js 启动，工具在普通对话和 Claude Code 会话里都能用。安装器改配置文件的那条路，还没有在真实的桌面版上测过。

**不支持：** 只在浏览器里用的聊天应用（比如网页版 ChatGPT），因为它们不能在你的电脑上运行程序。Trae 官方没有对加拿大开放。Gemini CLI 的免费用户已在 2026 年 6 月被换到谷歌 Antigravity。

## 手动安装

- **skill：** 把 `skills/canada-employment-law` 这个文件夹复制到你所用工具的 skill 文件夹（见上表）。
- **MCP 服务器：** 把 `mcp/canada-law-mcp.mjs` 放在一个固定的位置，再添加一个名叫 `canada-law` 的本地（stdio）服务器，运行 `node 这个文件的完整路径`。大多数工具的写法是：

```json
{ "mcpServers": { "canada-law": { "command": "node", "args": ["/完整路径/canada-law-mcp.mjs"] } } }
```

- **微软商店版 Claude 桌面版（Windows）：** 如果存在 `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc` 这个文件夹，Claude 桌面版读的是 `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`，不读 `%APPDATA%\Claude` 下的那份。请改这一份（安装器会自动处理），然后完全退出、重新打开 Claude 桌面版。

## 工作原理

- **五个工具：** `find_act`、`get_toc`、`get_section`、`search_law`、`map_term`。skill 里的小程序做同样的事，命令分别是 `find`、`toc`、`section`、`search`、`term`。
- **术语表：** 58 个日常说法（中文和英文口语，比如「加班费」「stat holiday」「severance」），分别对应到 BC 法律和联邦法律原文里实际用的词：同一个「法定假日」，BC 叫 "statutory holiday"，联邦叫 "general holiday"。全部 104 条都对照官方原文核对过。
- **搜索范围：** BC 的全部法规；联邦是《加拿大劳动法典》和它名下的配套条例（2026 年 9 月官方清单上共 32 部，其中 4 部已整部废止）。其他联邦法规也能按条号读原文。
- **出处：** 每条结果都带法律名称、条号、原文链接和官方「现行至」日期，日期读自官方网页。
- **隐私：** 全部在你的电脑上运行。你的问题只发给你本来就在用的 AI 助手；这个工具只向 BC Laws（www.bclaws.gov.bc.ca）和 Justice Laws 网站（laws-lois.justice.gc.ca）请求法规原文，不收集任何数据。

## 工作上真遇到问题？

- **BC 的工作场所：** BC 省劳工标准处（Employment Standards Branch）可以用你选择的语言提供帮助：<https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/contact-us>
- **联邦监管的工作场所：** 联邦劳工署（Labour Program）受理投诉（页面只有英文和法文）：<https://www.canada.ca/en/services/jobs/workplace/federal-labour-standards/filing-complaint.html>

## 反馈

发现回答有错或不完整？请[提交 issue](https://github.com/bellaaaaxu/canada-law/issues/new/choose)，写上你问的问题、用的 AI 工具和回答原文（先删掉个人信息）。本项目按现状提供：欢迎提 issue 和 PR，但不保证回复。

## 许可

代码采用 MIT 许可（见 [LICENSE](LICENSE)）。法规原文来自 BC Laws，按 King's Printer Licence – British Columbia 使用。该许可要求展示下面这段声明（以英文原文为准）：

> These materials contain information that has been derived from information originally made available by the Province of British Columbia at: http://www.bclaws.gov.bc.ca and this information is being used in accordance with the King's Printer Licence – British Columbia available at: https://www.bclaws.gov.bc.ca/standards/Licence.html. They have not, however, been produced in affiliation with, or with the endorsement of, the Province of British Columbia and THESE MATERIALS ARE NOT AN OFFICIAL VERSION.

大意：本材料的内容源自 BC 省政府在 www.bclaws.gov.bc.ca 公开的信息，按上述许可使用；本材料并非与 BC 省政府合作制作，也未经其认可，**不是官方版本**。

联邦法规原文来自 Justice Laws 网站。《联邦法律复制令》（Reproduction of Federal Law Order，SI/97-5）允许任何人免费、不必申请就复制联邦法律，条件是复制准确、不把复制品说成官方版本。本项目附上这段声明（以英文原文为准）：

> These materials reproduce the consolidated Acts and regulations of Canada from the Justice Laws Website (https://laws-lois.justice.gc.ca), as permitted by the Reproduction of Federal Law Order (SI/97-5). They have not been produced in affiliation with, or with the endorsement of, the Government of Canada, and THESE MATERIALS ARE NOT AN OFFICIAL VERSION.

大意：本材料转载自 Justice Laws 网站上的加拿大合并版法律和条例，依《联邦法律复制令》复制；本材料并非与加拿大政府合作制作，也未经其认可，**不是官方版本**。

本项目与 BC 省政府、加拿大政府都没有任何关联，也未经其认可。

## 开发

```bash
npm install
npm test                 # 单元测试（不用联网）
npm run bundle           # 生成 skill、MCP 服务器、安装器和 .mcpb
npm run smoke            # 在空文件夹里运行生成的文件
npm run smoke:install    # 在隔离的假用户目录里把安装器从头到尾跑一遍
npm run golden           # golden 测试题，分别经 skill 和 MCP 各跑一遍（要联网）
npm run verify-glossary  # 逐条对照官方原文核对术语表（要联网）
```

设计文档：[SPEC.md](SPEC.md)（工具、出处规范、BC Laws 和 Justice Laws 网站的实测行为）和 [SPEC-开源分发.md](SPEC-开源分发.md)（打包和安装器）。

**还没收录：** 联邦福利类法律，比如失业保险（EI）和加拿大退休金（CPP）。
