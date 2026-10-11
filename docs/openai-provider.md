# 可选 OpenAI Responses 服务端适配器

此模块可以发出真实 HTTPS 请求，但本发布只使用模拟网络验收。**账号权限、模型可用性、真实端到端调用与账单均未验证。** 公开网页和 MCP 仍只运行离线合成数据，不含密钥输入框或付费调用入口。

## 运行

Node.js 22+ 的内置 `fetch` 直接调用官方 `https://api.openai.com/v1/responses`，不需要安装 SDK。先检查不含密钥的 `examples/openai.json`：模型、知识截止、reasoning effort、超时和预算均由使用者确认。示例模型是 `gpt-6-astra`，不表示当前账号已获权限。

```sh
# 不读取密钥，不联网；查看将采用的配置。
node src/openai-cli.mjs --dry-run examples/openai.json 42

# 仅在自行配置本机 OPENAI_API_KEY 且接受 API 费用后执行：
node src/openai-cli.mjs --allow-paid-api examples/openai.json 42
```

使用者自行在运行此命令的服务器/本机进程环境中设置 `OPENAI_API_KEY`。不要写入 JSON、网页、仓库或聊天。模块不加载 `.env`、系统钥匙串、Codex 凭证或其他配置；只有显式启用的请求路径延迟读取这一个环境变量。导入模块、dry-run、默认 demo、MCP 和网页不读密钥、不调用 API。

输出为 `runtime/latest-openai-report.json`；完整尝试与结果在 `runtime/openai-experiments.jsonl`。同一目录的并发 CLI 调用由独占运行锁拒绝。错误不会降级为 mock 后冒充成功；未知异常不回显原始内容。日志只写受限候选、请求 hash、已清理状态/usage 和本地报告，不保存请求头、密钥、原始响应或拒绝文本。

## 固定的数据边界

请求只包含固定的合成研究提示、JSON Schema 和模型参数。不读取或传送行情柱、保留段、持仓、财务账户、身份材料、文件或聊天。输出只能是 1–8 个不重复候选：动量/均值回归、回看 5/10/20/40、阈值 0。`text.format.strict=true`，同时在本地再次验证所有字段；模型不能提供可执行代码或修改评价器。

收到候选后，`runOpenAIResearch` 将其交给已有固定评价器。费用、回撤、选取规则和时间切分完全由本地代码计算。请求 hash、模型与知识截止进入协议 hash。没有结果反馈给模型重试选优的循环。所有数据仍是合成数据，前瞻观测 0；模型调用成功也不证明金融收益。

## 预算及错误处理

| 控制 | 示例默认值 | 行为 |
|---|---:|---|
| 每次请求输出上限 | 2,048 tokens | `max_output_tokens`，含推理与可见输出 |
| 请求超时 | 30 秒 | 覆盖连接及完整响应读取；中止本地请求 |
| 自动重试 | 最多 1 次 | 仅 429 限速及 500/502/503/504；总请求数限制仍适用 |
| 总请求数 | 最多 2 次 | 同一 provider 实例/一次 CLI 运行累计 |
| 预留输出总量 | 4,096 tokens | 每次尝试先按全额预留，不因失败退回 |
| 估算费用准入上限 | US$0.50 | 每次预留估算费用后再决定是否发出请求 |
| 响应大小 | 64 KiB | 同时检查声明长度及实际流式字节数 |

费用准入按每次 **8,192 个预留输入 tokens + 配置的最大输出 tokens**，乘以配置的单价计算。示例单价输入 $10/百万、输出 $50/百万，单次预留 $0.18432；这是使用者可修改的估算参数，不是实时价格查询。程序每次均向上取整到微美元，不退回不确定请求的预算；usage 超出预留或缺失时停止继续调用。

**估算准入不等于服务商账单硬上限。** 输入 token 预留是针对固定小请求的保守假设，仍需核对真实模型分词和当前价格；中止本地超时不保证远端停止，也可能已经计费。重试创建请求也可能重复计费。预算在新进程/新实例重置，不能限制其他应用或跨运行总账单；应另行配置服务商项目/组织费用限制。项目不替用户改变账户设置。

遵循 `Retry-After`，单次等待上限 5 秒；服务器要求更久则停止，不提前重试。429 配额/费用限制、401/403、错误请求、重定向、网络异常、超时、拒绝、未完成、损坏 JSON、无效策略均直接失败。超时和网络异常的远端执行状态记为未知，绝不自动重试。没有自动加大 token 上限或搜索范围的逻辑。适配器不跟随重定向、不接受自定义服务地址。

库调用示例：

```js
import {readFile} from 'node:fs/promises';
import {createOpenAIProvider, runOpenAIResearch} from './src/openai.mjs';
import {appendJournal} from './src/log.mjs';
const config = JSON.parse(await readFile('examples/openai.json', 'utf8'));
const provider = createOpenAIProvider(config, {
  allowPaidApi: true,
  onEvent: event => appendJournal('runtime/openai-experiments.jsonl', event),
});
const report = await runOpenAIResearch(provider, {seed: 42});
```

测试通过依赖注入替换 `fetch` 和密钥读取器，传入显然无效的测试占位值；不会读取现有环境密钥。注入的 HTTP transport 在 provenance 中标为 `mock-http`，`modelCalled:false`、`accountAccess:unverified`。真实 HTTP 成功只记录 `request-succeeded-only`，不做持续账号权限或财务表现认证。

## 官方依据（2026-10-11 核对）

- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)：Responses 的 JSON Schema 以及拒绝/未完成处理。
- [Reasoning models](https://developers.openai.com/api/docs/guides/reasoning)：reasoning effort；输出预算包含推理 token；未完成也可能产生费用。
- [Error codes](https://developers.openai.com/api/docs/guides/error-codes)：限速、费用/配额、服务端错误及 Retry-After。

这些文档指导实现，不能代替真实账号与端到端验收。
