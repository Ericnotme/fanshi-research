# 饭宝 U 本位合约研究资料

研究问题：**同样大小的扰动，为什么在某些系统状态下被消化，在另一些状态下被放大？**

本人已授权整理、公开其去标识交易研究版。当前阶段公开准备文档和处理代码；逐笔 CSV 为本地候选，具体数据许可待选择，尚未随本目录发布。根目录 MIT 用于代码和自写说明，不自动扩展到交易数据或第三方市场数据，见 [许可状态](LICENSE-DATA.md)。

数据来自同一账户 Binance USDⓈ-M Futures 的完整年度请求。它与见潮合成演示分开，未输入现有策略引擎，也不是工具收益验证。用户称这些资料为“饭宝交易数据”；缺策略版本、决策日志及人工干预记录，不能逐笔确认机器人归属。

| 年份 | 来源状态 | 全 U 本位成交行 | BTCUSDT 成交行 | 全 U 本位不同订单 |
| --- | --- | ---: | ---: | ---: |
| 2020 | 报告明确无匹配 | 0 | 0 | 0 |
| 2021 | 全年报告已取得 | 7606 | 5354 | 528 |
| 2022 | 全年报告已取得 | 10232 | 7465 | 285 |
| 2023 | 全年报告已取得 | 2 | 2 | 2 |
| 2024 | 报告明确无匹配 | 0 | 0 | 0 |
| 2025 | 全年报告已取得 | 68 | 68 | 5 |

共 17,908 个成交行、820 个来源订单、198 个执行日期；其中 BTCUSDT 为 12,889 行、488 个订单。交易对为 BTCUSDT、ETHUSDT、ETHUSDT_210625、LUNAUSDT。ETHUSDT_210625 是到期合约，不能统一称作永续。2025 的 68 行来自同日 5 个订单，集中于 10 月 6 日 15:53:27—19:29:36（UTC+8）。这些行不是独立试验；完整仓位回合数未知。

2020 和 2024 的 0 仅指本次合约报告返回数量。旧通用导出的其他账户/现货线索已单列，不合并进本数据集或合约盈亏。

候选另含 31,904 条盈亏/费用流水，排除 107 条转账。按年、交易对与币种对账：成交已实现盈亏等于流水 REALIZED_PNL；成交费用取负后等于流水 COMMISSION。2021 年 20 条零手续费成交没有相应收费流水，金额仍一致。只从收入流水汇总净额，不能再加一遍成交盈亏。

- [数据卡与来源](DATA_CARD.md)
- [字段字典与核算口径](FIELDS.md)
- [完整性及验证](VALIDATION.md)
- [研究预注册草案](../../docs/research/fanbao-perturbation-preregistration.md)

## 本地复现

Python 3.10+；CSV 处理只用标准库。2022 Excel 规范化另需 `openpyxl`。所有原始输入、规范化中间表及真实编号映射必须在 Git 仓库之外。脚本没有网络、上传、API 或交易行为。

```sh
# 仅 2022 原件为 Excel；kind 分别取 Trade 与 Transaction。
python3 scripts/normalize_fanbao_xlsx.py --kind Trade \
  --source /path/to/local-raw/USD-M-Trade-History-2022-original.xlsx \
  --destination /path/to/local-raw/USD-M-Trade-History-2022-normalized.csv
python3 scripts/prepare_fanbao.py \
  --raw-dir /path/to/local-raw --out-dir /path/to/local-candidate \
  --private-map /path/to/local-private/id-map-v1.json
python3 scripts/reconcile_fanbao.py \
  --raw-dir /path/to/local-raw --out-dir /path/to/local-candidate \
  --private-map /path/to/local-private/income-map-v1.json
python3 -m unittest discover -s tests -p 'test_fanbao*.py'
```

输入命名为 `USD-M-Trade-History-YYYY-original.csv` 和 `USD-M-Transaction-History-YYYY-original.csv`，年份 2020—2025；2022 使用 `-normalized.csv`。两种版本同时存在会拒绝选择。缺文件保持未知；只有明确 no-match 提示才记录返回 0。原件只读，重复键拒绝而不静默删除。

输出 `executions.csv`、`integrity.json`、`income.csv`、`pnl-summary.json`。真实编号换为本版本内顺序代码，映射仅留本地。重复运行须产生相同映射，输入改变则新建版本。所有输出默认标记本地候选，不自动选择许可或公开。

**去标识不等于匿名。** 精确交易轨迹与分笔组合仍可能被关联。公开 Git 历史、fork 和下载副本无法保证撤回。不要用本资料识别人、拼接账户或推断未提供的个人资产。
