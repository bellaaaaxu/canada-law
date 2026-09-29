# Canada Law — 开源分发 SPEC

> 2026-09-24。接在 `SPEC.md` 之后：M1（BC）已完成。本 spec 把原来的 M3「场景 skill」扩展成**开源发布**，M4「远程部署」暂不做。
> **2026-09-24 已确认：末尾 7 项全部按默认；另加「中英双语」要求（见下节）。**
> 核心不变：5 个工具、引用契约、BC Laws 的全部实测结论都以 `SPEC.md` 为准。

## 目标

任何人下载后，就能在**自己的 AI 工具**里用中文或英文问 BC 劳动法问题。回答必须基于 BC Laws 的现行官方原文，并带上条号、原文链接和「现行至」日期。

- 不限 Claude：用两个开放标准——Agent Skills（SKILL.md）和 MCP
- 运行成本为零：AI 费用由用户自己的 AI 承担，查法条由用户电脑直接连 BC Laws
- 别人的问题不经过你：没有服务器，也不收集任何数据

## 谁能用（已核实）

| 方式 | 支持的 AI 工具 | 用户需要 |
|---|---|---|
| Skill | Claude Code、OpenAI Codex、GitHub Copilot / VS Code、Cursor、Gemini CLI 等几十款（agentskills.io 开放标准） | Node.js 20+，能联网 |
| MCP 服务器 | Claude 桌面版、Claude Code、ChatGPT 桌面版 / Codex、Cursor、VS Code、Gemini CLI | Node.js 20+，能联网 |

**用不了的**：纯网页版 AI 聊天（比如 ChatGPT 网页版只接受放在网上的服务）。所以这一版服务的是会用 AI 工具的人，普通打工人要等以后的网页版。

## 中英双语（2026-09-24 定）

服务对象是在加拿大的华人和英语使用者，两边都要能直接用：

- **README 两份**：`README.md`（英文，GitHub 默认显示）和 `README.zh.md`（中文），开头互相链接，内容一一对应。许可声明必须用英文原文，中文版照放英文原文，再附中文说明「以英文原文为准」
- **一个 skill 同时服务两种语言**，不做两份：SKILL.md 用英文写；description 同时写英文和中文关键词，两种语言提问都能触发；用提问者的语言回答，引用原文时用英文
- **术语表加英文日常说法**：现在是「中文 → 法定英文」。再加「日常英文 → 法定英文」，例如 stat holiday → statutory holiday、severance → compensation for length of service、sick leave → illness or injury leave。核对方式不变：法定英文必须出现在所标的条文里
- **工具输出里的 warning 和 notes 保持英文**：这是给 AI 看的，AI 会用用户的语言转述
- **golden 加英文三题**：期望的条号和中文三题相同

## 范围

**包含**
- 开源仓库：现有代码、测试、术语表、SPEC 一起公开
- Skill `canada-employment-law`：说明 + 一个单文件小程序 + 术语表
- MCP 服务器单文件版：下载一个文件就能用，不用装依赖
- **Claude 桌面版扩展安装包（`.mcpb`）**：自带 Node.js，普通人在桌面版设置里点几下就能装（2026-09-24 定）
- 中英文 README：每个 AI 工具的安装方法，标明「已实测」还是「按标准兼容、未实测」

**不包含**
- 网页版、远程服务（原 M4 和之前说的路线 A/B）
- 联邦法规：M2 做完后作为 v0.2 更新发布
- 中文以外的术语表
- 发布到 npm（要多开一个账号；先只用 GitHub 下载）

## 怎么做

### 1. Skill

```
skills/canada-employment-law/
├─ SKILL.md              # 英文写（跨工具最稳），例子含中文
├─ scripts/bclaw.mjs     # 单文件小程序：由现有代码打包而成，不用装依赖
└─ assets/glossary.json  # 40 条术语表（构建时从 data/ 复制）
```

`SKILL.md` 开头（草稿）：

```yaml
name: canada-employment-law
description: Answers questions about British Columbia employment law (hours, overtime,
  breaks, statutory holidays, vacation, pay, termination, leaves) from the current official
  text on BC Laws, with section citations and the official "current to" date. Use when the
  user asks about BC workers' or employers' rights and duties, in English or Chinese
  (e.g. 加班费, 法定假日, 解雇通知). Federal law is not covered yet.
license: MIT
compatibility: Requires Node.js 20+ and internet access to www.bclaws.gov.bc.ca
```

小程序的命令，输出和 MCP 工具同样格式的 JSON（引用契约不变）。M2（v0.2）起 `search`、`find` 要写辖区，`section`、`toc` 从 act_id 分辨：

```bash
node scripts/bclaw.mjs term 法定假日
node scripts/bclaw.mjs search bc "statutory holiday" "statutory holidays"
node scripts/bclaw.mjs search federal "general holiday" "general holidays"
node scripts/bclaw.mjs section 96113_01 40
node scripts/bclaw.mjs section L-2 166
node scripts/bclaw.mjs toc 96113_01
node scripts/bclaw.mjs find bc "Employment Standards Act"
```

- `search` 每个参数是一个短语，程序自己加引号、用 OR 连起来。这样 AI 不用在 Windows 命令行里嵌套引号
- 小程序靠自己文件的位置找术语表，不管 AI 从哪个目录运行它
- 缓存放在系统临时目录，照旧 24 小时；请求带能认出本项目的 User-Agent（写仓库地址，不写个人邮箱）

给 AI 的规则（写进 SKILL.md，和 MCP 的 instructions 一致）：
1. 先取原文再回答，不凭记忆
2. 引法名、条号、source_url、current_to；current_to 为空或有 warning 要告诉用户
3. 提醒用户确认适用哪一级法规（BC 还是联邦监管行业）
4. 说明回答不构成法律意见
5. 引用原文用英文，再用用户的语言解释（**新增**）
6. 用户在描述自己的纠纷时，提示可以联系官方的 Employment Standards Branch（**新增，2026-09-24 确认**）
7. 不对提问者本人的情况下结论：讲清楚法律怎么规定、哪些事实决定结果，但不替用户判定「你能拿到多少」（**新增，2026-09-24 确认**）
8. 查到的原文里没有的内容，只能放在单独一段「不是来自官方原文」里，并说明没有核对；其余部分只写查到的原文（**2026-09-26 定**，取代 D1 改动 4 里的「不说没查到的事」——那条两轮测试都没管住，见 D3）

装了 MCP 就优先用 MCP 工具；没装就运行小程序。

### 2. MCP 服务器单文件版

把现有服务器打包成一个 `canada-law-mcp.mjs`，放在 GitHub Release 里。用户下载后，在自己的 AI 工具里填 `node <文件路径>` 就能用。

### 3. BC Laws 许可（King's Printer Licence）

许可允许商用和非商用的公开再发布，但有条件：
- README 和 SKILL.md 按许可 §3.3 **原文照搬**它指定的那段声明（大意：内容取自 BC Laws，不是官方版本，也未经省政府认可）。原文见 https://www.bclaws.gov.bc.ca/standards/Licence.html
- `get_section` 和 `search` 的输出里加一个字段，放同一段声明（每次返回一次，约 100 token）
- 不用 BC 政府的标志，不写任何暗示「官方」的字样
- 测试样本里有法规原文，样本目录另放一份同样的声明

### 4. 仓库与发布

- **先把项目搬进独立的文件夹再建 git**（原来的工作目录里有与本项目无关的私人文件，不能在那里建 git）。本机 Claude Code 注册的路径一起改好
- 用新的 git 历史，旧文件夹的东西不会带进去
- **公开前做隐私扫描**：仓库里不能出现维护者的姓名、邮箱、本机路径和雇主相关字样。SPEC 和计划里的本机路径改成通用写法
- 代码用 MIT 许可；另放一个 NOTICE 文件，写 BC Laws 许可声明
- GitHub 登录由你来。提交用 GitHub 账号的隐私邮箱（…@users.noreply.github.com，不用工作邮箱）：贡献记录照样算你的，又不公开真实邮箱
- 推送到 GitHub 前，我会再问你一次

## 里程碑

### D1：实测（先做 → 汇报 → 你点头再写代码）
- [x] 单文件打包 ✅ 2026-09-24：skill 小程序 169KB、MCP 单文件 925KB，都只用 Node 自带模块；空目录、从别的目录启动、Git Bash 和 PowerShell 都能跑
  - 发现：Windows 旧编码（437 英文系统 / 936 中文系统）下中文输出乱码（对照组 UTF-8 正常）→ 小程序改为纯 ASCII 输出（`\u` 转义），三种编码实测都正确。MCP 走程序间 UTF-8 通道，不受影响
- [ ] Claude Code 发现 skill ✅（会话启动时已列出）；**用中英文提问时会不会自动启用 ⏳ 还没测**：命令行版 Claude 未登录（桌面版的登录不带过去），这个会话也不会加载中途新加的 skill → 需要你：命令行登录一次，或新开一个会话
  - skill 好不好用 ✅：两个全新的助手（Sonnet）拿到 skill 路径后，中文、英文各一题，都照流程查原文、带出处作答
- [x] 英文日常说法 ✅：stat holiday、lunch break 搜不到；**severance、sick leave 搜到别的法**（看起来像答案，其实是错的）→ 必须加英文日常说法
- [x] 各 AI 工具安装方式 ✅：见 `docs/research/2026-09-24-各AI工具安装方式.md`（全部附官方链接）
- [x] `skills-ref validate` ✅：需 Python 3.11+；中文 Windows 上要开 `PYTHONUTF8=1`，否则它用 GBK 读文件直接崩溃。原型通过；故意写错名字的坏副本被正确拒绝

### D1b：补测（2026-09-24 维护者登录命令行 + 加了两条）
- [x] Claude Code 自动启用（2026-09-24，`claude -p`，只装 skill、不连 MCP、不加载用户插件，默认模型 claude-opus-4-6，三题共约 0.30 美元）：
  - 中文「一天超过几小时付加班费」：**没启用**，凭记忆 4 秒答完，没出处、没免责
  - 英文「被裁 2 年有没有 severance」：✅ 启用，查了 s.63 原文，出处 / 适用范围 / 免责 / 求助渠道都有；但**下了结论**（"you are entitled to 2 weeks' wages"）
  - 中文同一题：✅ 启用，中文答、引英文原文；**下了结论**、**漏了许可声明**、说了原文里没有的话（「普通裁员不属于 just cause」）
  - 结论：语言不是问题（中文也能启用），问题是**简单事实题模型觉得自己知道，就不用 skill**；规则写成一串要点，**模型不一定照做**
- [ ] `.mcpb`：✅ 官方工具 `@anthropic-ai/mcpb` 校验通过、打包成功（187KB，manifest 0.3，Node 由 Claude 桌面版自带）；⏳ 最后一步要在你的 Claude 桌面版里装一次、问一句

**D1b 带来的 D2 改动**
8. description 写明「任何 BC 劳动法问题都要用，包括简单问题；不要凭记忆回答」（仍 ≤200 字符）
9. SKILL.md 规定**固定的回答格式**：① 法律原文（英文引用）② 用用户的语言解释 ③ 哪些事实决定结果（不下结论）④ 去哪求助 ⑤ 出处行（法名、条号、链接、现行日期）+ 许可声明 + 免责。用格式代替零散的规则
10. D3 用同样三题 + golden 六题复测，启用率和格式合规都要达标

### 一行命令安装器（2026-09-24 定，参照 OpenDesign 的 `od mcp install`）

`npx github:<账号>/canada-law install <工具名>`：自动把 skill 和 MCP 装进指定的 AI 工具；不写工具名就自动检测装了哪些工具。
- **分两批**：第一批进 D2，是官方文档已核实的 6 个——Claude Code、Claude 桌面版、Codex、Cursor、VS Code / Copilot、Gemini CLI。第二批先查官方文档（Trae、Kimi CLI、DeepSeek 等中文用户常用的，以及 Cline、OpenCode、Kiro、Antigravity 等），查得到的才加
- **安全要求**：改配置之前先备份；默认先预览要改什么（`--print`），确认了才写；能一键卸载（`--uninstall`）；合并写入，不覆盖用户原有的配置
- 有官方命令的就用官方命令（`claude mcp add`、`codex mcp add`、`gemini mcp add`、`code --add-mcp`），没有的才改官方文档写明的配置文件
- 文件复制到固定位置（`~/.canada-law/`），各工具的配置都指向那里。不指向 npx 的缓存目录，因为缓存会被清掉
- README 里每个工具都标「已实测」或「未实测」

### D1c：安装器补测（先测 → 汇报 → 再写代码）
- [x] 零依赖的包用 npx 运行（2026-09-24）：
  - 从本地压缩包 ✅ 3 秒。**但程序开头必须有 `#!/usr/bin/env node`**：没有这一行时，npm 在 Windows 生成的启动脚本会直接「打开」文件而不是用 Node 运行，结果什么都不做却显示成功
  - 从网址下载压缩包（模拟 GitHub Release 链接），并且拿掉 git ✅ 1.8 秒 → **用 Release 链接发布：用户不需要 git，你也不需要 npm 账号**
  - 从 git 地址 ❌ 卡住超过 5 分钟；而且 `npx github:…` 本来就要求用户装 git → **不用这种写法**
  - 所以命令改为 `npx https://github.com/<账号>/canada-law/releases/download/v0.1.0/canada-law-0.1.0.tgz install`（长，但可以直接复制）；以后想要短命令 `npx canada-law install` 再开 npm 账号
- [x] 假目录隔离 ✅：`claude mcp add --scope user` 只写进假目录，你真实的 `~/.claude.json` 前后指纹一致
- [x] 假目录里 Claude Code 发现用户级 skill ✅、MCP 显示 Connected ✅
- [x] 第二批工具的官方文档 ✅（2026-09-25，见 `docs/research/2026-09-25-第二批AI工具安装方式.md`）。**2026-09-25 你确认按建议定，并进 D2；`.mcpb` 实装测试挪到 D3**：
  - 加 6 个：GitHub Copilot CLI、Antigravity、Kiro、Qwen Code、OpenCode、Kimi Code CLI
  - 只装 skill、不自动写 MCP 配置 2 个：Cline（官方文档里 MCP 位置有三种说法）、DeepSeek Harness（开发预览版，会有不兼容改动）
  - 不加 3 个：Trae（官方不对加拿大开放）、Reasonix（不是 DeepSeek 官方的）、旧版 Kimi CLI（已停止维护）
  - 合计支持 14 个工具；`~/.agents/skills/` 一个文件夹就被其中 8 个读取

**D1 带来的 D2 改动**
1. 小程序只输出 ASCII 字符（中文用 `\u` 转义）
2. description 控制在 200 字符以内（claude.ai 帮助中心的上限；原型 450）；SKILL.md 全用 ASCII 字符，中文提问能否触发放到 D3 实测，触发不了再加中文关键词
3. SKILL.md 里用 Markdown 链接引用脚本（VS Code 要求），不用只有 Claude 认的 `${CLAUDE_SKILL_DIR}`
4. 规则新增：搜索没找到的东西，不能说成「法律里没有」，要说明搜了什么；不说没查到的事（比如「别的省不一样」）
5. 术语表加英文日常说法；出错提示改成命令行也看得懂的说法（比如「运行 toc」）
6. README：装两个文件夹（`~/.claude/skills/` + `~/.agents/skills/`）覆盖 Claude Code、Codex、Copilot / VS Code、Cursor、Gemini CLI；Gemini CLI 注明免费用户已换成 Antigravity CLI
7. 纠纷提示用官方联系页 https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/contact-us ，页面写明可以用你选择的语言求助

### D2：实现 ✅ 2026-09-25（计划：`docs/plans/2026-09-25-d2-开源分发.md`）
- [x] 小程序 `src/cli.ts`（只输出 ASCII 字符）、MCP 单文件入口、安装器 `src/install/`；`npm run bundle` 一次生成 skill、MCP 单文件、安装器和 `.mcpb`
- [x] 输出加 `notice` 字段（许可 §3.3 原文）；SKILL.md 定稿（描述 185 字符、五段式回答格式）；README 中英两份、LICENSE、NOTICE
- [x] 术语表加 12 个英文日常说法，共 52 条，逐条对照原文通过
- [x] 测试：单元测试 151 条；`npm run smoke` 6/6；`npm run smoke:install` 全过；golden 中英六题、经小程序和 MCP 两条路 12/12 在前 5

**D2 中的设计调整（要让你知道的）**
1. MCP 的接法改成：有官方文件位置的，**直接合并编辑配置文件**（可以先预览、可以精确撤销、可以用假目录测试）；Claude Code 用官方命令（它的配置文件里还存着应用状态，不宜手改）；VS Code 由安装器把命令打出来，请用户自己运行（它的用户级配置文件位置文档里没写）。原先写的是「有官方命令的就用官方命令」，但多数工具的删除命令文档里都没有，做不到干净卸载
2. AI 回答里只放一句简短出处加「不是官方版本」；许可声明全文放在工具输出、README 和 NOTICE 里。全文约 80 个英文单词，每次回答都带太长
3. **Node 24 在 Windows 上，`fs.cpSync` 遇到中文路径会直接崩溃**（不报错、无输出）→ 一律用自己写的复制函数。华人用户的 Windows 用户名常是中文，这个坑必然会遇到
4. 术语表返回字段 `term_zh` 改名为 `term`（现在词条中英文都有）
5. package.json 设 `private: true`，防止误发到 npm；依赖全部转为开发依赖，用户 `npx` 时什么都不用下载
6. **测试事故与防护**：一次手敲的端到端测试漏了 `APPDATA`，安装器写进了你真实的 Claude 桌面版配置（随即被卸载删掉）。已用测试前的备份逐字节还原，两个备份文件移进了回收站。以后安装器端到端测试只用 `npm run smoke:install`：四个路径全部隔离，运行前先核对，测试前后比对真实配置文件的指纹
7. 开发工具 `@anthropic-ai/mcpb` 的依赖里有一个已知漏洞（`tmp` 包，暂无修复版本）；只在本机打包时用到，不会进发布包

### D3：验收 ✅ 2026-09-26（隐私扫描在 D4）
- [ ] 用定稿的 SKILL.md 重测「会不会自己启用」：D1b 的三题（中文简单事实题、英文和中文的本人情况题），看启用率和五段式格式（`claude -p`，会用到你的额度）
  - **一条命令 `npm run activation`**（2026-09-25 备好）。条件和 D1b 一样：临时文件夹里只放 skill，不连 MCP，不带你自己的设置和插件。共 8 题：golden 六题 + D1b 的两道本人情况题（D1b 那道中文简单事实题就是 golden 第一题）
  - 每题自动检查 10 项：有没有启用、有没有查原文、条号对不对、回答语言、五段式、链接、现行日期、许可声明、「不是法律意见」、联邦法提醒。本人情况题再加 2 项：求助链接、不下结论。回答原文存进 `answers.md`，贴给你看。自动检查只标出可疑的地方，结论要读原文才能下（9/26 加第 11 项：第 4 段以外有没有以前抓到过的凭记忆补的话，而且工具没返回过）
  - 检查器先用 D1b 的三份旧记录验证过：当时的结论全部复现（中文事实题没启用；两道本人情况题都下了结论；中文那道漏了许可声明）
  - 额度：D1b 每题约 0.10 美元，8 题估计 1 美元左右
  - 达标线由你定。我的建议：8/8 启用；两道本人情况题都不下结论；其余各项 8/8。你不另说就按这个。不达标就改 SKILL.md 再测
  - **第一轮 ✅ 达标（2026-09-25，默认模型 claude-opus-4-6，约 1.09 美元）**：8/8 启用（D1b 凭记忆答的中文加班题这次也查了原文）；条号、链接、现行日期、许可声明、「不是法律意见」、联邦提醒、回答语言都是 8/8；两道本人情况题都给了求助链接，没有「你能拿到 X」。回答原文：`docs/acceptance/2026-09-25-D3-自动启用测试-回答原文.md`，对话记录留在维护者本机（含本机路径，不公开）
    - 自动检查报 5 题「五段式不全」，读原文都是检查器的问题：不认识中文小标题（「这意味着什么」「影响结果的因素」）；一般性问题不写「去哪求助」是对的（规则 6 只针对描述自己纠纷的情况）→ 检查器已改；用 D1b 三份旧记录回归，当时的结论全部复现
    - 读原文才看出来的：① **说了没查到的事**——法定假日的日期、「经理和专业人士不适用加班」，内容对，但不是从查到的原文里来的（BC Laws 其实查得到，比如 Family Day Regulation 写着 third Monday of February）→ SKILL.md 第 3 步加「原文没给的事实就再查，查不到就不说」② 英文本人情况题把提问者的 2 年套进了档位（"which means the employer owes the equivalent of 2 weeks' wages — unless …"），没说 you are owed、带了条件 → 判定可以接受（你 9/25 同意）
    - 每题都有 1 次工具报错：是 Claude Code 自己的（第一次调用 Skill 工具时参数名写错，自动重试成功），和本项目无关
  - **第二轮（SKILL.md 第 3 步加了那句、MCP instructions 同步之后，约 1.05 美元）**：自动检查 8/8 全过。但读原文，**「不说没查到的事」模型还是时守时不守**：法定假日两题照样凭记忆补日期，也没去查；英文被裁题写了 "A layoff is not just cause"，中文被裁题写了「被裁通常属于无正当理由」，还补了一段普通法（common law）合理通知期。这几句都不在查到的原文里（对话记录里核过）。英文加班题这次没再说「经理和专业人士不适用」，中文加班题引用的 ESR s.34 是查到过的
    - 两轮比较：违规的位置在变，数量没降 → 单靠一句规则管不住；每题只跑一次，也看不出这句改动有没有用（改动保留，没看到坏处）
    - 本人情况题：两轮都把提问者的年限套进了档位，同时列了条件、说了「没法判定你具体能拿多少」→ 和第一轮同一水平，按你 9/25 的判定算可以接受
    - 回答原文：`docs/acceptance/2026-09-25-D3-自动启用测试-第二轮-回答原文.md`，对话记录留在维护者本机（含本机路径，不公开）
    - **结论：按达标线（8/8 启用、不下结论、其余各项 8/8），两轮都达标。**「不说没查到的事」是达标线之外的已知局限，已写进两份 README 的「请先看」
- [x] 「没查到的事」：**2026-09-26 你选 A**（另一个选项 B 是记为已知局限）。回答格式加第 4 段「不是来自官方原文」：可选，开头要说明没有核对；第 1–3 段只写查到的原文（规则 8）。SKILL.md 与 MCP instructions 同步改；检查器加第 11 项，先用前两轮记录验证过：该抓的全抓到，没问题的题没误报
  - **第三轮（4 道敏感题各 3 次 + 另外 4 题各 1 次回归，约 2.18 美元）**：16/16 启用。读原文：**敏感题 12 次里 10 次没有把没核对的内容写到第 4 段以外**（同样 4 道题，前两轮 8 次里 6 次有）
    - 法定假日：6 次里 5 次日期都放进了第 4 段；英文第 3 次写进了第 2 段，但在第 4 段自己说明「上面的日期来自常识，没从法律里查到」
    - 被裁：英文 3 次都没再说 "not just cause"；中文第 3 次把普通法那段挪进了第 4 段，但第 3 段还留着一句「普通裁员不属于正当理由」
    - 回归 4/4 正常；英文加班题有一句笼统的「是否属于被法规排除的职业」，这次没查到对应条文，算轻微
    - 自动检查 14/16 全过，被标的 2 次就是上面两处；另有 1 次检查器误报（中文小标题写的是「非来自官方文本」，检查器只认「官方原文」），已修，前两轮的判定重判不变
    - 本人情况题：和前两轮同一水平（把年限套进档位、带条件），按你 9/25 的判定可以接受
    - **新发现：搜索摘要被截断，模型会凭记忆补全。** 法定假日有两份中文答案没读 s.44 全文，只看了搜索摘要，而摘要到 "or (b) worked under an…" 就断了，它们把后半句写成「按合同在假日当天有排班」；原文是 "worked under an averaging agreement…"（按平均工时协议工作过）。这是**写错了**，不是标没标的问题
    - 回答原文：`docs/acceptance/2026-09-26-D3-第三轮-敏感题-回答原文.md`、`docs/acceptance/2026-09-26-D3-第三轮-回归-回答原文.md`；对话记录留在维护者本机（含本机路径，不公开）
- [x] 搜索摘要截断：**2026-09-26 你定：加提示。** `search` 输出的 notes 加一句「摘要是截断的……先取全文」（小程序和 MCP 共用 `bc.ts`，两条路都有）；SKILL.md 与 MCP instructions 第 3 步改成「凡要引用、解释、列出的条文都取全文，不能只看摘要」；检查器加第 12 项「引用的条文有没有读过全文」，用第三轮验证过：6 份法定假日全被标出，其他题没误报
  - **第四轮（法定假日中英各 3 次 + 两道被裁题各 1 次，约 1.28 美元）**：提示**基本没起作用**——6 份法定假日里 5 份仍然只看摘要就引用 s.44（第三轮 6/6）。但第三轮那种编造没再出现：4 份只写了摘要里有的前半句条件（(a) 30 天里有 15 天），1 份凭记忆把 (b) 补对了，1 份把 averaging agreement 写成「排班协议」（不准）。只写 (a) 等于漏掉了 (b) 这条资格路径
  - 被裁：英文题没问题（「下结论」一项被标，是检查器误报「how much you are owed depends on…」，已修；D1b 那两份真下结论的记录照样被抓到）；中文题第 3 段又出现「裁员通常不属于 just cause」（中文被裁题最近 4 次里 2 次）
  - 原因：摘要是本项目代码截的（命中词前约 90 字、后约 150 字，按单词断开）。s.44 全文约 330 字、只有一句，被两头截断：开头少了「雇主必须按第 45 或 46 条处理」，结尾少了 (b)
  - 回答原文：`docs/acceptance/2026-09-26-D3-第四轮-法定假日-回答原文.md`、`docs/acceptance/2026-09-26-D3-第四轮-被裁-回答原文.md`；对话记录留在维护者本机（含本机路径，不公开）
- [x] 摘要从根上改：**2026-09-26 你定。** `bc-xml.ts makeSnippet`：600 字以内的条文整条给出；长条文截到命中词所在的完整分句（从上一个分号或句号之后，到下一个分号或句号）。s.44 现在整条给出，(b) 在里面。search 的提示改成相应说法；第 4 段的例子加「裁员算不算 just cause」。单元测试 174（新增：短条文整条、长条文按分句截）
  - **第五轮（法定假日中英各 3 次 + 中文被裁题 3 次，约 1.37 美元）**：**s.44 没有一份写错**（第三轮 2 份编造）；3/6 把 (b) 完整写出（第四轮 1/6，还是凭记忆补的），另外 3 份写了「等」「例如」，是模型自己简写，不是被截断。4 份新提到 s.3（集体协议可以替代法定假日规定、全国真相与和解日除外），核过原文 (2.1) 款确实如此，只是少了「条款要达到或超过法定标准」这个前提
    - 模型照样直接用摘要、很少取全文（检查器第 12 项 6/6 被标）。摘要现在不再断在半句话中间，这一项被标主要说明它没取全文，不再说明写错了
    - 第 4 段的标签在起保护作用：有一份在第 4 段写「家庭日是二月第二个星期一」——这是 2019 年以前的旧规定，现在是第三个星期一，但贴着「没有核对原文」的标签
    - 英文法定假日：3 次里 2 次把日期写在正文、在第 4 段说明（第三到五轮共 9 次里 4 次这样）；中文 9 次全部放对
    - 中文被裁题：「裁员通常不属于正当理由」3 次里仍有 2 次写在第 3 段，加的例子没管用；普通法 3 次都放进了第 4 段
    - 回答原文：`docs/acceptance/2026-09-26-D3-第五轮-法定假日-回答原文.md`、`docs/acceptance/2026-09-26-D3-第五轮-被裁-回答原文.md`；对话记录留在维护者本机（含本机路径，不公开）
  - **到此为止。** 剩下的（英文日期偶尔写进正文、中文被裁题那一句、模型偶尔简写条件）已写进 README「请先看」，每次改动都要再花额度验证，效果越来越小。D3 自动启用测试累计约 7.0 美元（按 API 价格折算，算在维护者的 Claude 订阅用量里）
- [x] **`.mcpb` 实装 ✅ 2026-09-26 20:46**（你的 Claude 桌面版，Windows 微软商店版）。桌面版日志 `%LOCALAPPDATA%\Claude\Logs\`：安装成功（提示「未签名扩展」，本地打包的正常现象），用桌面版自带的 Node.js 启动，握手成功，5 个工具；你提问时调用了 2 次工具，都返回了结果，没有报错
  - 扩展也自动出现在 Claude Code 会话里，我在 Code 会话里调用了 map_term 和 search_law，都正常。dreamrec/LivePilot#83 说的「商店版上 .mcpb 在 Cowork / Code 会话里启动不了」在这里没有出现
  - 两份 README 在工具表下面注明：`.mcpb` 已实测；安装器改配置文件那条路没在真实的桌面版上测过
- [x] 验收标准逐条过（2026-09-26，用最终代码重跑）：1 ✅ 空目录只放 skill，term / search / section 都返回完整出处和许可声明 ｜ 2 ✅ golden 12/12 ｜ 3 ✅ 五轮自动启用测试，回答原文都在 `docs/acceptance/` ｜ 4 ✅ `skills-ref validate` 通过（改名反向对照被拒）｜ 5 ⏳ 隐私扫描按计划在 D4 搬家后做 ｜ 6 ✅ README 两份：许可声明原文、免责、求助链接、14 个工具都标了实测与否。另：单元测试 174、smoke 6/6、smoke:install 15/15

**D3 中发现并修好的（要让你知道的）**
1. **D2 漏了一条 spec：MCP 的 instructions 没有和 SKILL.md 同步**，还是 M1 时的 4 条，没有五段式、不下结论、求助链接。用 `.mcpb` 的桌面版用户只拿得到 instructions → 已补成和 SKILL.md 相同的步骤、回答格式和规则；`docs.test.ts` 加了 13 条「两边必须一致」的检查（2026-09-27 更正：桌面版其实连 instructions 也不交给模型，回答格式和规则现在随工具结果返回，见 SPEC.md「给 Claude 的使用规则」）
2. **安装器装 Claude 桌面版会静默失败（Windows 微软商店版，即 MSIX）**：这种版本读的是 `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`，不读文档写的 `%APPDATA%\Claude\` 那份（anthropics/claude-code#26073、#25579）。安装器原来写文档位置 → 桌面版读不到，安装器却显示成功。→ 发现这个文件夹就写这里；单元测试加 3 条，`smoke:install` 加商店版场景（临时换回旧逻辑时这两条确实失败），真实商店版配置也加进前后指纹核对；README 手动安装一节注明
   - 顺带弄清：从桌面版 Code 标签里启动的命令，看到的 `%APPDATA%` 已经被转到这个文件夹（#93152）。所以 D2 那次事故写到的正是你在用的那份配置
   - `.mcpb` 走桌面版自己的扩展管理，不经过这个配置文件。但有第三方扩展报告过：在商店版上 `.mcpb` 到「Cowork / Code 会话」里启动不了（dreamrec/LivePilot#83）→ 装完看日志确认
3. 检查器（`scripts/activation.ts`）：认得中文小标题「意味」「影响」；「去哪求助」只要求本人情况题出现

### D4：搬家 + 发布 v0.1.0 ✅ 2026-09-26
- [x] 搬到桌面上单独的 `canada-law` 文件夹。本机旧的 MCP 注册（跑的是 D2 旧版）按你的决定删掉，改用已装的 `.mcpb` 扩展（所有会话里都有同样的 5 个工具）。新位置全部测试重跑通过：单元 175、golden 12/12、术语表 52/52、smoke、smoke:install 15/15、`skills-ref validate`
- [x] **隐私扫描（验收标准 5 ✅）**。搜索词：维护者的中英文姓名、邮箱、雇主相关字样、本机路径（`C:\Users` 等）、工作目录名、会话编号。发布前清理了 4 处：两份 SPEC 和一份计划里的私人字样改成通用写法；8 份回答原文开头的临时文件夹路径换成 `%TEMP%`（`activation.ts` 以后也自动这样写）。54 份原始对话记录按你的决定不公开，放在本机 `.local/`（不上传）。对最终要公开的 99 个文件再扫一遍：15 处命中全是仓库地址 `github.com/bellaaaaxu/canada-law`
- [x] 你抽查术语表的 40 个中文词：没问题
- [x] GitHub：账号 bellaaaaxu（已登录）。仓库级 git 身份 `bellaaaaxu` + GitHub 隐私邮箱（全局的工作邮箱没动）。你确认后推送：公开仓库 https://github.com/bellaaaaxu/canada-law ，发布页 v0.1.0（`canada-law-0.1.0.tgz` 254 KB、`canada-law-0.1.0.mcpb` 193 KB）
- [x] **用发布页的真实地址跑安装器端到端 15/15**：`npm run smoke:install -- --from <地址>`（新加的选项：同一套四路径隔离和真实配置指纹核对，npm 缓存也在假目录里，所以是真的从网上下载）
- [x] GitHub Actions（你定：加）：每次推送在 Windows / macOS / Linux 跑单元测试、类型检查、打包，三个系统都通过；每周一 15:00 UTC 联网检查（golden、术语表对原文、smoke），手动触发过一次，通过。BC Laws 接口变了，你的 GitHub 邮箱会收到失败通知
- 发布后（2026-09-26，你定）：仓库加 12 个主题标签；README 两份加「回答长什么样」（一份真实测试回答，脚本逐行比对过和原文一致）、自动测试 / 版本 / 许可证徽章、「反馈」一节（按现状提供、不保证回复，第「需要你定的事」5）；报错模板两个（回答有错、安装问题）加一个「自己的劳动纠纷」入口，指向 Employment Standards Branch；社交预览图 `docs/assets/social-preview.png`（你在仓库设置里上传）；置顶由你在 GitHub 主页上点
- 发布前补上的：测试样本文件夹另放一份许可声明（`tests/fixtures/NOTICE`，第 3 节要求）；User-Agent 写上仓库地址；`package.json` 和 `.mcpb` 清单加仓库地址；`.gitattributes` 统一用 LF 换行（`#!/usr/bin/env node` 遇到 CRLF 在 macOS / Linux 上会失败），测试样本保持下载时的原样

之后：M2（联邦）✅ 2026-09-27 发布 v0.2.0（设计、验收和发布记录见 SPEC.md「M2」）。

## 验收标准

1. 空目录里只放 skill 文件夹，不装任何依赖，三条命令（term / search / section）都返回完整的引用字段
2. golden（中文三题 + 英文三题）：经小程序 6/6 在前 5，经 MCP 6/6
3. Claude Code 只装 skill、不连 MCP，中英文各问 golden 题：条号正确，带链接和现行日期，提醒适用范围，声明不是法律意见，回答语言和提问语言一致。**回答原文贴给你看**
4. `skills-ref validate` 通过
5. 隐私扫描干净（列出搜索用的关键词和结果）
6. README 的每个 AI 工具都标了「已实测 / 未实测」；许可声明是原文；有免责声明和 Employment Standards Branch 链接

## 风险

| 风险 | 缓解 |
|---|---|
| BC Laws 接口变了，所有人那边一起坏 | 每周自动跑线上 golden（D4 可选项）；README 写「按现状提供」 |
| 用户没装 Node.js | README 第一步就写；`compatibility` 字段也写 |
| AI 答错 | 规则强制每次引原文、链接、现行日期和免责声明；README 写清使用边界 |
| 除 Claude 以外的工具我测不了 | 标「未实测」，欢迎别人实测后反馈 |
| 陌生人来提问题、要支持 | README 写「按现状提供，不保证回复；欢迎 issue / PR」 |

## 需要你定的事（不改就按默认）

| # | 事项 | 默认 |
|---|---|---|
| 1 | 开源许可 | MIT |
| 2 | 项目新位置 | 桌面上单独的 `canada-law` 文件夹 |
| 3 | 名字 | 仓库 `canada-law`，skill `canada-employment-law` |
| 4 | 规则第 6 条（遇到纠纷时指向 Employment Standards Branch） | 加 |
| 5 | 维护承诺 | 按现状提供，不保证回复 |
| 6 | 发布顺序 | 先发 BC 版 v0.1，M2 做完发 v0.2 |
| 7 | GitHub Actions 自动检查 | 做 |
| 8 | 规则：不对提问者本人的情况下结论 | 加（2026-09-24 定） |
| 9 | Claude 桌面版扩展安装包 `.mcpb` | 加（2026-09-24 定） |
