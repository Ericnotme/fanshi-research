# 字段字典与核算口径

候选 CSV 为 UTF-8。数值以十进制字符串保存；不得先转二进制浮点再写回。时间 ISO 8601、秒级、UTC+8。

## executions.csv

| 字段 | 单位/含义 |
| --- | --- |
| trade_code | F + 6 位顺序代号，替换真实成交号 |
| order_code | O + 6 位代号，同交易对同来源订单共享；不代表仓位回合 |
| execution_time | 来源 Time 标注 +08:00，不是决策或委托时间 |
| symbol | BTCUSDT、ETHUSDT、ETHUSDT_210625、LUNAUSDT；保留到期合约后缀 |
| side | BUY/SELL，不能推断开平和持仓方向 |
| price_usdt | USDT/基础资产，来源 Price |
| quantity_base | 基础资产数量：BTCUSDT 为 BTC，ETH 两种合约为 ETH，LUNAUSDT 为来源合约的 LUNA 单位；不跨币种相加 |
| amount_usdt | 来源 Amount，保留原值，不由价格数量替代重算 |
| fee_amount | 来源 Fee 数值，正数为费用；负数保留，不取绝对值 |
| fee_asset | USDT 或 BNB，不能隐式换算 |
| realized_profit_usdt | 来源 Realized Profit，成交级已实现盈亏 |
| is_maker | 来源 Maker，true/false，实际流动性角色 |

Buyer 与 Side 重复，未保留；Uid、真实 Trade ID/Order ID 排除。没有订单状态、position side、开平、期初持仓或决策日志，不伪造相关字段。

## income.csv

| 字段 | 单位/含义 |
| --- | --- |
| income_code | I + 6 位顺序代号，真实 Transaction ID 映射仅本地 |
| event_time | 来源 Time 标注 +08:00 |
| income_type | REALIZED_PNL、COMMISSION、FUNDING_FEE、COMMISSION_REBATE、INSURANCE_CLEAR |
| amount | 有符号数值，与 asset 同读；COMMISSION 通常为负 |
| asset | USDT 或 BNB，不合并币种 |
| symbol | 来源交易对，不能改写为订单归属 |

收入流水正数为贷记、负数为扣减。TRANSFER 完全不进入公开候选流水。income 与 execution 并非一一对应，不能通过同秒时间强行匹配订单。

## 元数据与汇总

`integrity.json` 记录成交数、订单数、日期、产品、时区、重复检查和输出 SHA-256。`coverage[].state` 区分 received、source_reports_no_match、missing_source。缺失时计数 null；明确无匹配才为 0。仓位回合仍为 null。

`pnl-summary.json` 包含各年与累计 all_usdm、btc_usdt 的按资产分类金额；净额仅从 income 求和。`trade_income_differences=[]` 表示按交易对/费用币种核对一致，null 表示缺来源无法核对。空资产汇总配合 no-match 状态表示本次报告未返回流水，不是缺失文件。未实现盈亏、全账户回报均为 null，汇率换算为 not_performed。
