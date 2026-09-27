# Canada Law MCP — SPEC v1

## 目标

做一个本地 MCP 服务器，让 Claude 能查询 BC 省法规和联邦法规的**现行条文**，每条结果都附带官方出处和"现行至"日期。用中文提问时，也能准确定位到对应的英文条文。

## 范围

**v1 包含**
- BC 省法规（statutes & regulations）：实时调用 BC Laws CiviX API
- 联邦法规（consolidated Acts & regulations）：实时取 Justice Laws 官网的 XML（M2 实测后改定，见「联邦部分怎么做」）
- 中英术语表

**v1 不包含**
- 判例：另装现成的 `canlii-mcp`（见文末）
- 市政 bylaw、IRCC 政策指引、卫生局指南等非法规内容
- 联邦福利法（EI、CPP 等）的搜索：它们的求助渠道和提问方式都不一样，以后单独做（按条号读原文照样可以）
- 远程部署（第三期另开 spec）
- 法律意见

## 技术栈

- TypeScript，Node 20+
- `@modelcontextprotocol/sdk`，stdio transport
- `zod` 定义工具参数
- XML 解析：`fast-xml-parser`（BC 和联邦共用）
- 不装任何原生组件：发布出去的 skill 小程序、MCP 单文件和 `.mcpb` 都是一个文件（见 `SPEC-开源分发.md`）。原计划的 `better-sqlite3` 联邦索引在 M2 实测后取消

## 数据源

### BC Laws（CiviX API）

- 无需 API key；许可为 King's Printer Licence
- 取整部法规 XML：`https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/{docId}/xml`
- 取片段：在后面接 `/xpath/{xpath}`，例如 `//bcl:section[bcl:num='40']` ✅ 2026-09-24 实测可用
  - 条号不存在：仍返回 200，内容是 `<snippet><message>No Results</message></snippet>` → 要按内容判断「没有」
  - xpath 写错返回 500；docId 不存在返回 404 → 条号先校验格式再拼进 URL
- 文档内搜索：`.../{docId}/xml/search/"phrase"/xpath///bcl:section[descendant::hit]` ✅ 实测可用，命中词包在 `<hit>` 里
  - **零命中时返回 500，不是空结果** → 当 warning 报出来，不能当成「这部法里没有」
- 废止 / 被取代的法规：根元素带 `status="Repealed"` 或 `status="Replaced"`，没有正文（✅ 实测 96191rep_01、96492_00）
  - ⚠️ `act:repealedtext` **不能**当废止信号：现行的 Workers Compensation Act 用它放 CPI 金额附注 → 在现行法规上当「官方附注」原样带出
- 同一条号可能出现两次（正文与 Schedule 各有 s.1，如 Local Government Act、Workers Compensation Act）→ 全部返回并提示
- URL 各段顺序固定：`xml` → `search` → `xpath`
- 目录浏览：`https://www.bclaws.gov.bc.ca/civix/content/complete/statreg/...`
- 全站搜索：`/civix/search/complete/fullsearch?q=...&s=0&e=20&nFrag=5&lFrag=100` ✅ 2026-09-24 实测
  - q、s、e 必带（不带 s/e 返回 500）；nFrag（摘录条数）、lFrag（摘录长度）可选；返回第 s 到第 e−1 条
  - **每次最多 20 条**：官方文档写 100，实测 e−s 超过 20 就 500（超过 100 才是 400）
  - 只返回「哪部法规命中」，不给条号 → `search_law` 分两步：先全站搜出法规，再用文档内搜索落到条
  - 排序不可靠，结果里混着历史版本（Point in Time）、修订表（TLC）、Historical Table → 过滤后自己排序
  - 不做词形还原（`meal break` 搜不到标题里的 `Meal breaks`）；支持通配符 `*`
  - 多个词必须整体加括号，否则服务器把第一个词当成可有可无
  - 字段查询可用：`title:"..."`（find_act 用它）、`marginalnote:"..."`
- 大型法规会拆成多份文件（multi document）。取完整 XML 时，用目录 ID 加 `_multi`（✅ 实测 `02057_00_multi` 全文与 xpath 都可用）。搜索结果里它按 Part 分开出现（带 `CIVIX_MULTI_PARENT`），要合并成一部。
- 示例：Employment Standards Act 的 docId 是 `96113_01`
- 条级链接：网页上条文有锚点，`.../{docId}#section40`；多文件法规的锚点在 Part 页上（如 `02057_01#section1`）
- 「现行至」日期（current_to）**不在法规 XML 里**（✅ 2026-09-24 实测，ESA 全文和修订表 XML 都没有）。官方网页用 XSLT 生成这一行：
  - Act：读全站日期文件 `https://styles.qp.gov.bc.ca/media/qpDate.xml`（XML 里有 `act:currencydate` 时优先）
  - Regulation：另一套规则（按 Reg Bulletin 日期分 5 种情况算），**和 Act 的日期不同**（实测当天 Act 是 9/15，Regulation 是 9/22）
  - 所以一律**以官方网页上显示的那一行为准**（"This Act is current to …" / "This consolidation is current to …"），每部法规每天抓一次；读不到返回 `null` + warning
- 同一 URL 本地缓存 24 小时，请求带明确的 User-Agent

### 联邦（Justice Laws）

✅ 2026-09-26 实测（M2 第一项）。以下是官方文档没写、或者和本 SPEC 原先写法不一样的地方。

- 官方地位：2009-06-01 起，Justice Laws 网站上的合并本是 "official"（可作证据）。司法部对转载的准确性不负责
- 许可：Reproduction of Federal Law Order（SI/97-5）——任何人可以免费、不必申请就复制联邦法规，条件是尽力保证准确、不把复制品说成官方版本。**没有**像 BC 许可 §3.3 那样指定的声明原文
- 单部法规 XML：`https://laws-lois.justice.gc.ca/eng/XML/{id}.xml` ✅。id 就是网址里那一段：`L-2`、`C.R.C.,_c._986`、`SOR-86-304`（PowerShell 不加引号也能原样传逗号）
  - 不存在的 id 返回真的 404；服务器不压缩；Canada Labour Code 1.47 MB；路径不分大小写（`sor-86-304.xml`、`SOR-89-30A.xml` 都返回同一文件，官方 id 本身有 20 个以小写字母结尾）
- 全部法规清单：`https://laws-lois.justice.gc.ca/eng/XML/Legis.xml` ✅（5.3 MB，英法两种语言；英文 971 部法、4875 部条例；每部有 XML 链接、目录页链接，法下面有 `RegsMadeUnderAct`：Canada Labour Code 名下 32 部条例）
  - ⚠️ 其中的 `CurrentToDate` 对全部 11692 条都是同一天（实测 2026-07-21，比网页旧），不能当现行日期；清单里也有已废止的法
- GitHub `justicecanada/laws-lois-xml`（约 300 MB，OGL-Canada 许可）：内容和官网 XML 一样，但更新比官网晚（2026-08-20 那次网站更新，8/24 才提交）
- **「现行至」**：⚠️ XML 根元素的 `lims:current-date` 和 `<ConsolidationDate>` 是 XML 文件生成的日期，**不是**现行日期（15 部实测：网页全是 2026-09-03，XML 从 2019-06-21 到 2026-06-21 不等）。和 BC 一样，一律以官方网页上那一行为准：
  - Act："Act current to 2026-09-03 and last amended on 2025-12-12."；条例："Regulations are current to …"。目录页和条级网页都有这一行；有的没有 "last amended" 半句（如 SOR-2002-54、SI-97-5）
  - 网页的 last amended 和 XML 的 `lims:lastAmendedDate` 14/14 一致 → 可以用它核对 XML 和网页是不是同一版
  - 官方 FAQ：网站一般反映大约 2–3 周以前的法律状态
- XML 结构：根元素 `<Statute>` / `<Regulation>` → `<Identification>` → `<Body>`
  - Part / Division 标题是 `<Heading level="1|2|3">`，和 `<Section>` **平级**，不是包住条文的容器 → 所在位置要按顺序跟踪标题。Canada Labour Code 里 "DIVISION V" 出现两次（Part I 调解、Part III 法定假日）→ 位置必须带上 Part
  - 条：`<Section>` 的直接子元素 `<Label>`、`<MarginalNote>`；下面是 Subsection / Paragraph / Subparagraph / Clause；定义在 `<Definition>` 里，`<DefinedTermEn>` 后面括号里是法文对应词；另有表格（`table/tgroup/row/entry`）、公式（`FormulaGroup`）、脚注、条尾的修订历史 `<HistoricalNote>`
  - 已废止的条：`<Repealed>[Repealed, 2018, c. 27, s. 569]</Repealed>`；条号可以是范围："163 to 165"、"5.10 and 5.11"
  - ⚠️ `</Body>` 后面还有两块：RELATED PROVISIONS（`<Schedule id="RelatedProvs">`）和 AMENDMENTS NOT IN FORCE（`<Schedule id="NifProvs">`）。里面的条号属于修订法（如 2012, c. 19 的 s.438），**尚未生效**的新条文也在这里（如 s.177.2 下班断联、Division VI.1 临时工中介，条级网页都是 404）→ 查条号只查 `<Body>`
  - 未生效的条文（网页上灰底）按 DTD 用 `in-force="no"` 标记。39 部劳动相关法规和刑法典等 3 部里都没有出现，但仍要处理
  - 已废止的整部法：XML 照样返回，根元素仍是 `in-force="yes"`，每一条都是 `[Repealed…]` → 按内容判断
- 条级网页：`/eng/acts/{id}/section-{n}.html`、`/eng/regulations/{id}/section-{n}.html` ✅（小数条号可用；范围条号是 404）
- 官网搜索 `/Search/Search.aspx`：能按条返回结果，但它是网页不是 API，参数名故意写成 `txtS3archA11` 这种，每页 5 条，按字面匹配（"general holiday" 搜不到 "general holidays"）
- 用词：遣散费 s.235 的条文里没有 "severance pay"，只有它所在的 DIVISION XI 标题有
- 规模：Canada Labour Code 加名下 32 部条例共 6.7 MB，全部解析 0.18 秒
- 官网大约每两周更新一次
- 清单 `Legis.xml` 收了全部 76 部已废止的法，标题上**不标**「已废止」
- 清单里的编号不是官网印的引用：按规则推算，40 部抽查 3 部对不上（"R.S.C., 1985, c. 17 (3rd Supp.)"、"R.S.C. 1970, c. W-4"、SOR-2024-1597 在官网引作 "2024, c. 15, s. 97"）→ 引用一律读官网页面，find_act 也读

## 联邦部分怎么做（M2 设计，2026-09-26 定）

原计划是下载 GitHub 全量 XML、在用户电脑上建 SQLite 索引。实测后取消，理由：会破坏「单文件、不装依赖」的发布方式；GitHub 副本比官网晚，用户不更新就一直旧；还要维护更新脚本。改成下面的做法（2026-09-26 汇报的 7 项，全部按默认）：

1. **取原文**：和 BC 一样实时取官网，同一网址缓存 24 小时
2. **act_id**：官网网址里那一段（`L-2`、`C.R.C.,_c._986`、`SOR-86-304`）。也接受 `C.R.C., c. 986`、`SOR/86-304` 这类写法，统一换成网址写法；只允许字母、数字和 `. , _ -`
3. **find_act**：在官方清单 `Legis.xml` 的英文部分按标题找：完全相同 → 包含整个短语 → 包含所有词；法排在条例前面；最多 10 个。每个候选的引用读它的官网页面（清单编号推算不可靠，见上）。清单不标已废止，所以废止状态在打开这部法时判断（get_toc / get_section）
4. **get_toc**：按 Heading 层级列出 Part / Division / 小标题和每一条。「尚未生效的修订」不列进目录，只说有几项
5. **get_section**：
   - 只在 `<Body>` 里找条号；范围条号（"163 to 165"）里的号也能找到
   - 原文排版照官网：条号接第一款、定义一条一行、下级缩进；不含条尾的修订历史和各款的边注（边注不是法律的一部分，BC 也不带）
   - 条级链接用 `section-{n}.html`；范围条号没有条级网页，用目录页
   - warnings：current_to 为空；网页的 last amended 和 XML 不一致；这一条已废止；「尚未生效的修订」提到这一条；有未生效的部分（`in-force="no"`）
   - 整部法已废止：报错并说明，和 BC 一样
   - 查一个只出现在「尚未生效的修订」里的条号（如 s.177.2）：报错，说明它还没生效，不说「没有这一条」
6. **search_law（federal）**：
   - 范围：Canada Labour Code 加清单里它名下的全部条例（实测 32 部），名单跟着官方清单走。清单读不到时只搜法典本身，并提醒
   - 按字面匹配（不做单复数），支持 `"短语" OR "短语"` 和词尾 `*`；各款的边注也参与匹配
   - 排序和 BC 相同：定义这个词 +100（只是长定义词的一部分 +20）、条的边注命中 +50、边注以它开头 +10、命中次数（最多 10）、法比条例 +15。**另加：这一条最近一级的标题（Division 或小标题）命中 +30**——遣散费 s.235 的正文里没有 "severance pay"，只有 DIVISION XI 的标题有
   - 摘要规则和 BC 相同（600 字以内整条给，否则按分句截）
   - `all`：BC 和联邦各搜一次，按同一套分数合并排序
7. **current_to**：以官网目录页那一行为准（"Act current to …" / "Regulations are current to …"），读不到就返回 null 并加 warning；不用 XML 里的日期
8. **许可声明**：输出里的 `notice` 按辖区给。联邦：取自 Justice Laws 网站，依 Reproduction of Federal Law Order（SI/97-5）复制，不是官方版本
9. **给 AI 的规则**（SKILL.md 和 MCP instructions 同步）：先判断适用哪一级；拿不准就两边都查，并引用 Canada Labour Code s.2 里 "federal work, undertaking or business" 的定义原文，不凭记忆列行业；联邦的求助链接用联邦劳工署投诉页 https://www.canada.ca/en/services/jobs/workplace/federal-labour-standards/filing-complaint.html ；出处行按辖区写；联邦只收劳动法典和它的条例，EI、CPP 等福利法没收，要直说
10. **小程序命令**：`search <bc|federal|all> <短语>…`、`find <bc|federal> <法名>`；`section`、`toc` 从 act_id 的样子分辨辖区（BC 是 `96113_01` 这种，只有字母、数字和下划线；联邦的都带 `-` 或者是 `C.R.C.` 开头）
11. **术语表**：联邦词条加在同一个中文 / 英文日常说法下面，每条对原文核对（`verify-glossary` 扩展到联邦）；"where" 可以写 `Division XI`，给只出现在标题里的词用

## 引用契约（最重要）

凡是返回条文的工具，结果里都必须包含以下字段：

```ts
type Citation = {
  jurisdiction: "bc" | "federal";
  act_title: string;         // "Employment Standards Act"
  act_citation: string;      // "RSBC 1996, c. 113"
  act_id: string;            // "96113_01" | "L-2"
  section: string;           // "40"
  heading: string | null;    // marginal note
  source_url: string;        // 可以直接打开的官方网页
  current_to: string | null; // 官方"现行至"日期
  retrieved_at: string;      // ISO 时间
};
```

- 拿不到 `current_to` 时返回 `null`，同时在结果里加一条 warning。绝不编造。
- 条文原样返回，不改写、不摘要。

## 工具（5 个）

| 工具 | 参数 | 返回 |
|---|---|---|
| `find_act` | `name`, `jurisdiction` | 候选法规列表：act_id、标题、citation、source_url |
| `get_toc` | `jurisdiction`, `act_id` | Part/Division 结构，以及每条的编号和标题 |
| `get_section` | `jurisdiction`, `act_id`, `section` | Citation + 原文（保留 subsection 结构） |
| `search_law` | `query`, `jurisdiction`（bc / federal / all）, `limit=10` | Citation 主要字段 + snippet |
| `map_term` | `term`（中文或英文） | 各辖区对应的英文用词和相关条文位置 |

- `search_law` 的 query 用英文。工具描述里要提示 Claude：先调用 `map_term`，把中文转成对应辖区的法定用语，再去搜索。
- `map_term` 在术语表里找不到时返回空数组，不要猜。
- 工具描述用英文写。

## 术语表 `data/glossary.json`

同一个概念在不同辖区用词不同，而关键词搜索是按字面匹配的，所以这张表决定了中文提问能不能搜准。

```json
{
  "法定假日": [
    { "jurisdiction": "bc", "en_terms": ["statutory holiday"],
      "acts": [{ "act_id": "96113_01", "where": "s.1 definition; Part 5" }] },
    { "jurisdiction": "federal", "en_terms": ["general holiday"],
      "acts": [{ "act_id": "L-2", "where": "Part III, Division V" }] }
  ],
  "加班": [
    { "jurisdiction": "bc", "en_terms": ["overtime"],
      "acts": [{ "act_id": "96113_01", "where": "Part 4" }] }
  ]
}
```

初版约 30 条，围绕劳动法场景：工时、加班、餐休、法定假日、年假、工资发放、解雇通知、工资记录等。**每一条都要对照原文人工核对后再加入。**

- 英文词要把单复数都写上（CiviX 搜索不做词形还原，实测 `meal break` 搜不到 `Meal breaks`；联邦搜索同样按字面匹配）
- M1 只收 BC 词条；M2 起加联邦词条，同样逐条对联邦原文核对

## 给 Claude 的使用规则（写进 MCP initialize instructions）

- 回答法规问题前，必须先调用工具取得原文，不能凭记忆回答
- 回答时引用法名、条号、`source_url` 和 `current_to`
- 提醒用户确认适用哪一级法规：大多数企业受 BC 法规管辖，联邦监管行业适用联邦法规（M2 起的具体做法见「联邦部分怎么做」第 9 项）
- 注明回答内容不构成法律意见

## 项目结构

```
canada-law/
├─ src/
│  ├─ index.ts / server.ts      # MCP 入口，注册工具和 instructions
│  ├─ tools/                    # 每个工具一个文件
│  ├─ sources/xml.ts            # 两边共用：XML 解析、摘要截取
│  ├─ sources/bc*.ts            # CiviX 客户端、BC XML、BC 网页
│  ├─ sources/federal*.ts       # Justice Laws 客户端、联邦 XML、联邦网页和官方清单
│  ├─ cli.ts / install/ …       # skill 小程序、安装器（见 SPEC-开源分发.md）
│  └─ glossary.ts
├─ data/glossary.json
├─ tests/golden.jsonl
└─ SPEC.md
```

## 里程碑

### M1：BC 跑通
- [x] 实测 CiviX：取 ESA 全文 XML；用 xpath 取 s.40；确认 fullsearch 参数；找出 current_to 在 XML 里的位置（2026-09-24 完成，结论写进上面「BC Laws」一节）
- [x] 实现 `find_act` / `get_toc` / `get_section` / `search_law`（仅 bc）（2026-09-24，单元测试 70 条全过）
- [x] `glossary.json` 初版（BC 词条）+ `map_term`（40 条；`npm run verify-glossary` 逐条对原文 40/40）
- [x] 注册到 Claude Code：`claude mcp add canada-law -- node /绝对路径/dist/index.js`（在开发用的项目目录下执行 → 只在那个项目里可用；状态 ✓ Connected）
- [x] 跑通 golden 测试的 BC 部分（3/3 在前 5：s.40 第 2、s.32 第 1、s.1 第 2）

### M2：接入联邦
- [x] 实测数据源（2026-09-26，结论写进上面「联邦（Justice Laws）」一节）
- [x] 设计（2026-09-26 定，见「联邦部分怎么做」；原计划的 SQLite 索引和更新脚本取消）。实施计划：`docs/plans/2026-09-26-m2-联邦.md`
- [x] 联邦 XML：排版、目录、条号查找（含范围条号、尚未生效的修订）
- [x] 官网页面（现行至、引用、最后修订日）和官方清单
- [x] 5 个工具都支持 federal；`search_law` 的 `all` 合并排序；小程序命令加辖区
- [x] 术语表补联邦词条（对照联邦原文核对）
- [x] SKILL.md、MCP instructions、README 两份、NOTICE
- [x] golden 12 题经两条路全部命中；smoke；自动启用测试 4 题
- [x] 发布 v0.2.0（2026-09-27，你选「合并并发布」）：`m2-federal` 快进合并进 main 并推送；发布页 https://github.com/bellaaaaxu/canada-law/releases/tag/v0.2.0 （`canada-law-0.2.0.tgz` 279 KB、`canada-law-0.2.0.mcpb` 205 KB，标签指向 a8e851f）。推送前隐私扫描：分支上新增的每一行都查过，没有本机路径、姓名、邮箱或雇主字样；重新打包后仓库里的打包产物没有变化。发布后：两个安装包从发布页下载回来和本地逐字节相同，包里的小程序读得到联邦 s.169.1；`smoke:install -- --from <真实地址>` 15/15；GitHub 自动测试三个系统都通过；手动触发一次联网检查，在 GitHub 的服务器上 golden、术语表核对、smoke 都通过（从那边的网络也读得到联邦网站）

#### M2 验收记录（2026-09-26）

- 测试（复核修完后重跑）：单元 324；golden 24/24（12 题 × 小程序和 MCP）；`verify-glossary` 104/104（联邦 52 条，BC 52 条一字未改）；smoke 10/10，其中金丝雀一项：联邦搜索读了 33 部、没有警告；`smoke:install` 全过（真实配置没动）；`skills-ref validate` 通过（你同意后在临时环境装 click、strictyaml，跑完删掉；改名的对照副本被拒）
- 自动启用测试 4 题（约 0.66 美元）：4/4 启用 skill。回答原文 `docs/acceptance/2026-09-26-M2-联邦-自动启用-回答原文.md`，逐字读过：
  - 联邦法定假日（中文）：s.166 原文、10 个假日都对，具体日期都放在第 4 段并标了没核对。两处不足：没提醒「确认适用哪一级」；s.192、195、196、197 只看了搜索摘要（核过内容没错）
  - 航空公司餐休（英文）：先判断航空业归联邦，完整引 s.169.1，还提醒某些职位可能适用修改过的条例（SOR/2021-200）
  - 银行加班（中文）：判断和引用都对，三条都读了全文。把规则套到提问者身上但列了条件（和 D3 的 BC 题同一水平，你 9/25 判定可接受）；第 3 段有一句没查原文的「某些管理人员可能被排除」（s.167(2) 确有此规定），按规则应放第 4 段
  - 跨省卡车司机（英文）：自己查到 C.R.C., c. 990 s.2、3、6 和 L-2 s.171，答出每周最多 60 小时、有法定假日的那周 50 小时；查不到的《商用车司机驾驶时间条例》放在第 4 段并标没核对
  - 3 次「工具报错」都是 Claude Code 自己调 Skill 工具时参数名写错、自动重试成功（同 D3），和本项目无关
  - 检查器修了两处：认中文第 4 段标题「不来自官方文本」；联邦答案的「适用哪一级」按规则判（说出用的是劳动法典，并提到 BC 法律或请用户确认）。49 份旧记录重判，结论不变
- 代码评审（评审代理，2026-09-26）：没有严重问题；8 项应修的都修了并补了测试——没写大写 OR 的查询、清单或文件格式不对时不再悄悄降级、「尚未生效的修订」补认列表 / 范围 / renumbered 等写法、附表里的条目不再当正文条文、搜索也标出未生效的条文、`all` 的用词、Division 要带 Part。评审说「联邦搜索同时发 35 个请求」不对（并发上限 4）。没做的小项：请求超时（v0.1 就没有）、CI 检查打包产物是否最新（推送后才能验证）
- 复核（第二个评审代理，同日）：7 项确认修好。**第 4 项修出一个回归**：带标点的全名（"Canada Industrial Relations Board Regulations, 2012"、"Administrative Monetary Penalties (Canada Labour Code) Regulations" 等，32 部里 10 部）认不出是本条例 → 已改成「of the 之后以本法名开头就算」，并补上真实全名的测试。同时修了：id 只把前缀大写（20 个官方 id 以小写字母结尾，如 SOR-89-30a；实测官网路径不分大小写）、下载不完整时不拖垮其他文件、小写的 and / or 不再当运算符（"health and safety committee"）、中英文引号、"12, 13, and 14"、"the Code"、"section 12 of chapter 27" 和 "section 3 comes into force" 不算本法条文、只有图片的条文不算占位、空的法典不计入已搜。131 项未生效修订在完整文件上重新逐一核过：31 项本身不改条文（改附表条目、标题、过渡条款）。整部废止的条例是 4 部（C.R.C., c. 1013、SOR/86-305、SOR/87-182、SOR/87-183），README 已改
- 行业例子：规则里「联邦监管行业（银行、航空、电信、跨省运输等）」这句提醒从 v0.1 保留下来；设计第 9 项「不凭记忆列行业」理解为：判断某个具体雇主是不是联邦监管时，引用 s.2 原文，不凭记忆下结论
- 顺带：两边共用的 HTML 实体解码现在也把 BC 网页里的 `&nbsp;` 解成空格，对 BC 的结果没有影响（BC 测试全过）
- 桌面版升级到 v0.2.0（2026-09-27 你双击装的）：日志显示识别为升级、保留设置、旧版正常关闭、新版用自带 Node.js 启动、5 个工具、没有报错；装进去的服务器文件和发布的逐字节相同。⚠️ `.mcpb` 的 `display_name` 就是桌面版里的服务器名：这次从 "Canada Law (BC employment law)" 改成 "Canada Law (BC and federal employment law)"，升级前开着的会话还连着旧名字，调用时报 "Server … unavailable"，新开的会话才连上新版 → **以后发新版不要再改 display_name**

### M3（可选）：场景 skill
- [ ] 写一个调用本 MCP 的 BC 劳动法 SKILL.md
- 2026-09-24：扩展为「开源分发」（skill + MCP 单文件版，不限 Claude），见 `SPEC-开源分发.md`（草案，待确认）

### M4：远程部署
- [ ] 另开 spec

## 测试 `tests/golden.jsonl`

每行格式：`{"q": "中文问题", "expect": {"jurisdiction": "...", "act_id": "...", "section": "..."}}`

初始用例：

| 问题 | 期望命中 |
|---|---|
| BC 一天工作超过几小时要付加班费？ | bc / 96113_01 / s.40 |
| BC 员工连续工作多久必须给餐休？ | bc / 96113_01 / s.32 |
| BC 的法定假日有哪些？ | bc / 96113_01 / s.1（statutory holiday 定义） |
| 在联邦监管行业工作，超过多少小时要付加班费？ | federal / L-2 / s.174 |
| 在联邦监管行业（比如银行）上班，连续工作多久必须给餐休？ | federal / L-2 / s.169.1 |
| 联邦监管行业的法定假日有哪些？ | federal / L-2 / s.166（general holiday 定义，列出了每一天） |

M1 完成标准：前三条全部命中。英文三题（`SPEC-开源分发.md`）和联邦的英文三题同理。M2 完成标准：全部 12 题经小程序和 MCP 两条路都命中。

「命中」的算法（2026-09-24 定）：问题里的中文词 → 术语表查到该辖区的英文词 → `search_law` → 期望的那一条出现在**前 5 条**结果里。不经过 Claude，可以反复自动跑。达不到就如实汇报，不放宽标准。

### 怎么跑

| 命令 | 做什么 | 要联网 |
|---|---|---|
| `npm test` | 单元测试，用 `tests/fixtures/` 里 2026-09-24 抓下的真实返回 | 否 |
| `npm run build` | 编译到 `dist/`（Claude Code 跑的是这个） | 否 |
| `npm run golden` | 编译后经 stdio 连服务器跑 golden | 是 |
| `npm run verify-glossary` | 术语表逐条对原文 | 是 |

改了排序或术语表之后，golden 和 verify-glossary 都要重跑。

## 另装：CanLII（判例）

```bash
claude mcp add canlii -e CANLII_API_KEY=你的key -- npx -y canlii-mcp
```

- 需要先在 CanLII 申请 API key（研究用途免费）
- API 只返回元数据：案名、引用、日期、引用关系。判决全文需要点链接去 CanLII 看。
- 这是第三方包，安装前先看一下源码。
