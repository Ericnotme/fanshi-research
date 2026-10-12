# 见潮

**开源量化研究与模拟助手**

把投资观点变成 **可核验假设 → 成本与风险检验 → 冻结策略 → 模拟追踪计划** 的开源研究工具。愿景是降低财富管理中研究、验证和风险检查的成本；目前交付的是可复现的离线合成演示，不是已验证的投资方法或持牌投顾服务。

“见潮”是项目名称，不代表保本、保收益或已经验证的投资表现。

**所有收益数字都来自合成数据。真实收益、真实用户节时效果、真实模型 API 和真机适配均未验证。** 前瞻状态始终为 `prospective-pending`，观测数为 0。

## 来源删减检查

**删掉这条消息，你的投资结论还成立吗？** 默认入口现在用纯合成公司与资料演示：人工确认命题、指标、期限与否证条件，再切换公开/全部合成来源，或删除某来源及同源转载。输出成立、不成立或未知，解释变化，并保留每条资料的阶段、首次可得时间、版本、排除原因与 hash。

采用、签约、验收、收入、回款不会互相代替；缺失不填零，矛盾显示冲突，未来资料不能回填过去。来源父链绑定内容哈希并核对内置合成根源登记；AI／转载只供追溯，人工确认不能使其成为独立支持。断链、循环或未登记根源的记录排除并注明原因；没有其他可用证据时结论未知。此登记只用于合成演示，不能识别所有伪造来源，手动重写文件、登记表或伪造对已登记根源的引用超出可信边界。这是固定规则下的证据敏感性检查，不是严格因果归因、收益预测或已验证 alpha。本分支包含新增源码；默认分支以 PR 合并状态为准。文末线上演示链接仍对应此前发布版本，本次未更新网站。

新增独立页签“公开研究示例”：从公开报道提出问题，回到小米、美光官方披露，展示售价、毛利率、合同和证券收益之间不能省略的检验。它使用自写摘要与页面定位，未接入合成评价器；首次公开精确时间未核实则为空，不回填过去。参见[公开研究说明](docs/public-research.md)。

```sh
node src/evidence-cli.mjs examples/evidence.json
node src/evidence-cli.mjs examples/evidence.json public issuer-report
node src/evidence-cli.mjs examples/evidence.json all
```

详细契约、复核方式及尚未实现项见 [来源删减检查](docs/evidence-check.md)。六个**鲜唯佳与 AI 协作**方法候选在 [.agents/skills](.agents/skills)，具备触发条件、输入输出、步骤、边界和合成案例；不是私人聊天归档，也不代表已验证个人投资或临床资质。

显示名在 `branding.json` 配置，修改后运行 `npm run build`。显示名称与仓库名、站点 slug、历史项目身份分开管理；修改此文件不会创建仓库、发布站点或改写既有项目历史。

## 直接运行

下载源码后，用浏览器打开 `dist/index.html`。页面自带引擎、样式与生成器，断网可用，无账户、无外部资源、无数据上传。默认打开来源删减检查；切换“合成策略实验”后运行原有 8 个候选，检查曲线、全部候选与淘汰原因，再导出完整实验 JSON。固定奖池在独立页签。

Node.js 22+，零第三方运行时依赖：

```sh
npm test
npm run build
python3 scripts/package.py
node src/cli.mjs demo 42
node src/cli.mjs verify-log
node src/cli.mjs prize 1000
node src/cli.mjs provider-request examples/provider.json
```

实验和失败记录在 `runtime/experiments.jsonl`，完整最新实验在 `runtime/latest-report.json`，均默认忽略，不应上传私人材料。命令从项目根目录运行。浏览器只保留本机最多 20 次演示日志；CLI 每次固定最多 8 个候选，跨运行仍是累积的开发探索。

## Agent / MCP 接入

支持 stdio MCP 的客户端可将命令配置为 `node /absolute/path/to/fanshi-research/src/mcp.mjs`。提供 `strategy_candidates`、`research_synthetic`、`prize_simulate` 和 `phone_market_plan`。MCP 每进程最多 20 次研究尝试，每次完整留档；没有任意代码、shell、网络或订单工具。日志位于项目 `runtime/mcp-experiments.jsonl`。已测本地协议握手，尚未进行全部 MCP 客户端兼容认证。

## 研究方法

- 720 根合成价格柱，固定种子与人工行情阶段，不冒充历史数据。
- 8 个候选：动量/均值回归 × 5/10/20/40 根回看柱。阈值固定为 0，仅长仓或现金，无杠杆。
- 收益区间 `close[t-1] → close[t]`，信号最多读取 `close[t-2]`，在 `close[t-1]` 执行，留一根完整柱给执行。交易成本按仓位变化逐边计费；段末退出也计费。
- 训练段取前 3；验证段要求净值增长为正且最大回撤 ≤20%；按“净值变化 − 0.5 × 回撤”确定一个候选。无合格者保持现金。保留段不参与选择。
- 买入持有和现金基线；成本敏感性；3 个仅用于开发诊断的 rolling-origin 折。记录全部训练、验证结果和失败原因，不只展示胜者。
- 保存数据/协议/策略 SHA-256、冻结时间、模型 provenance 与污染警示。时间戳由本机时钟产生，日志链只检查完整性，不证明第三方见证或不可篡改。

具体公式、切分边界和限制见 [方法说明](docs/methodology.md)。不计算装饰性的 PBO/DSR 或未经支持的统计显著性。

## Provider：默认 mock，可选服务端 OpenAI

默认 `mock` 只返回固定候选。`src/openai.mjs` 已实现可运行的服务端 Responses HTTP 适配器：strict 策略 Schema、本地二次验证、固定评价器、超时、有限重试、请求/token/估算费用预算及失败日志。公开网页、默认 CLI 和 MCP 保持离线；付费路径需要单独显式启动。账号权限和真实端到端调用仍未验证。

```sh
node src/openai-cli.mjs --dry-run examples/openai.json 42
# 使用者自行在本机环境配置 OPENAI_API_KEY 并接受 API 费用后：
node src/openai-cli.mjs --allow-paid-api examples/openai.json 42
```

每次 CLI 默认最多 2 个请求、每次 2,048 个输出 tokens，估算费用准入上限 $0.50。费用预留含失败尝试且不会退回；这是本地估算限制，不是服务商账单硬上限，也不跨进程累积。详情、配置与错误边界见 [OpenAI provider](docs/openai-provider.md)。`openai-contract-only` 保留为兼容的纯契约测试入口，不会调用网络。

可选模型示例为 `gpt-6-astra`，官方知识截止 2026-04-30。[官方模型文档](https://developers.openai.com/api/docs/models/gpt-6-astra) 与 [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) 于 2026-10-11 核对。文档当日标准文本价格为输入 $10/百万 tokens、输出 $50/百万 tokens；计费规则和长上下文价格以官方为准。本项目没有运行付费 API；ChatGPT 订阅不应被视为 API 额度。

时间序列切分不能清除 LLM 预训练知识污染。2022 下半年及 Q4 已反复研究且重叠，不能称未见样本。本项目不附带这些数据。真正前瞻评价需要先锁定策略、评价器、数据来源和截止时间，然后收集之后到达的观测；此版本尚未开始。

## 手机能力

仅实现 public-market 导航**计划接口**，白名单别名为 Apple Stocks、TradingView、Yahoo Finance 的行情总览/图表页。三个 App 均未真机验证。接口无设备连接、不启动 WDA、不修改签名或权限。个人信息、认证、持仓或未知页面标记会立即拒绝。此标记来自调用方，不是经验证的自动屏幕隐私检测器。

没有金融账号登录、个人资产/交易/身份数据读取或上传、交易、转账、开户、截图上传、自动下单接口。

## 固定奖池

独立的整数积分分配器，按权重和最大余数法分配，平局按参与者序号。总量固定守恒，`investmentReturn: null`。没有充值/提现/投注，不将奖池分配当作投资收益。

## 验证与许可

`npm test` 覆盖手算费用、回撤、未来信息扰动、保留段独立选择、失败留档、provider 拒绝、手机边界、奖池守恒和日志损坏。`npm run scan` 扫描明确公开清单中的文件。可选 UI 验收见 `tests/browser.cjs`，需要独立安装 Playwright，单个 headless 浏览器顺序运行。

[验证记录](docs/validation.md) · [安全与隐私](SECURITY.md) · [MIT](LICENSE)

本项目全新编写，只借鉴已有本地研究台与手机工具的契约、证据链和可见失败思路；没有复制私有问据（原 Signal Desk）、群聊或设备数据。

## 名称与历史

见潮是当前新研究与模拟项目，曾用名守盈、饭式（FanShi）；机器人昵称保留“饭宝”。2022 年历史项目的名字与叙述保持原样，任何历史结果都不属于本项目的验证证据。问据（原 Signal Desk）和几分（原投资尺子）是不同工具。

[公开演示](https://strategy-lab.weijiaxian.chatgpt.site/) · [GitHub 源码](https://github.com/Ericnotme/fanshi-research) · [源码 ZIP](https://strategy-lab.weijiaxian.chatgpt.site/fanshi-research-source.zip)。演示保留原 URL。
