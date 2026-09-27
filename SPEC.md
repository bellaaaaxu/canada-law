# Canada Law MCP — SPEC v1

## 目标

做一个本地 MCP 服务器，让 Claude 能查询 BC 省法规和联邦法规的**现行条文**，每条结果都附带官方出处和"现行至"日期。用中文提问时，也能准确定位到对应的英文条文。

## 范围

**v1 包含**
- BC 省法规（statutes & regulations）：实时调用 BC Laws CiviX API
- 联邦法规（consolidated Acts & regulations）：用 Justice Canada 的 GitHub XML 建本地全文索引
- 中英术语表

**v1 不包含**
- 判例：另装现成的 `canlii-mcp`（见文末）
- 市政 bylaw、IRCC 政策指引、卫生局指南等非法规内容
- 远程部署（第三期另开 spec）
- 法律意见

## 技术栈

- TypeScript，Node 20+
- `@modelcontextprotocol/sdk`，stdio transport
- `zod` 定义工具参数
- `better-sqlite3`（FTS5）存联邦索引
- XML 解析：先用 `fast-xml-parser`。如果联邦 XML 太难解析，建索引脚本可以改用 Python（lxml）。产物同样是 SQLite 文件，服务器代码不受影响。

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

- 全量 XML：GitHub `justicecanada/laws-lois-xml`
- 数据字典：https://laws-lois.justice.gc.ca/eng/XML/index.html
- 单部法规 XML：`https://laws-lois.justice.gc.ca/eng/XML/{code}.xml` ⚠️ 需实测，例如 `L-2`（Canada Labour Code）
- 现行日期：从根元素的 `lims:current-date` 属性和 `<ConsolidationDate>` 读取
- 官网大约每两周更新一次
- **没有官方搜索 API，所以必须自建索引**

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

- 英文词要把单复数都写上（CiviX 搜索不做词形还原，实测 `meal break` 搜不到 `Meal breaks`）
- M1 只收 BC 词条；联邦词条等 M2 接入联邦原文后再加（没有原文就没法核对）

## 给 Claude 的使用规则（写进 MCP initialize instructions）

- 回答法规问题前，必须先调用工具取得原文，不能凭记忆回答
- 回答时引用法名、条号、`source_url` 和 `current_to`
- 提醒用户确认适用哪一级法规：大多数企业受 BC 法规管辖，联邦监管行业适用联邦法规
- 注明回答内容不构成法律意见

## 项目结构

```
canada-law-mcp/
├─ src/
│  ├─ index.ts            # MCP 入口，注册工具和 instructions
│  ├─ tools/              # 每个工具一个文件
│  ├─ sources/bc.ts       # CiviX 客户端 + 缓存
│  ├─ sources/federal.ts  # 读取 SQLite 索引
│  └─ glossary.ts
├─ scripts/
│  └─ build-federal-index.ts
├─ data/
│  ├─ glossary.json
│  └─ federal.db          # gitignore
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
- [ ] 弄清 GitHub repo 的目录结构
- [ ] `build-federal-index`：解析 XML → SQLite FTS5（`acts` 表、`sections` 表）
- [ ] 让 5 个工具都支持 federal
- [ ] 术语表补联邦词条（对照联邦原文核对）
- [ ] 更新脚本：`git pull` 后重建索引

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
| 联邦监管行业的法定假日怎么规定？ | federal / L-2 / Division V（M2 时补条号） |

M1 完成标准：前三条全部命中。

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
