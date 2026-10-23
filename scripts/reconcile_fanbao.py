"""Local income reconciliation. Never sum income and fill PnL together."""
import argparse
import csv
import hashlib
import io
import json
import os
import re
from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from pathlib import Path

from prepare_fanbao import YEARS, SYMBOLS, NO_DATA, TZ, REPO, decimal_value, read_year, source_path

INCOME_HEADER = ['Time', 'Type', 'Amount', 'Asset', 'Symbol', 'Transaction ID']
PUBLIC_HEADER = ['income_code', 'event_time', 'income_type', 'amount', 'asset', 'symbol']
PNL_TYPES = {'REALIZED_PNL', 'COMMISSION', 'FUNDING_FEE', 'COMMISSION_REBATE', 'INSURANCE_CLEAR'}


def read_income(raw_dir, year):
    path = source_path(raw_dir, year, 'Transaction')
    if not path.is_file():
        return [], {'year': year, 'state': 'missing_source', 'returned_rows': None}
    with path.open(encoding='utf-8-sig', newline='') as handle:
        rows = list(csv.reader(handle, strict=True))
    if not rows or rows[0] != INCOME_HEADER:
        raise ValueError('Unexpected income schema')
    body = [r for r in rows[1:] if any(r)]
    if body == [NO_DATA]:
        return [], {'year': year, 'state': 'source_reports_no_match', 'returned_rows': 0}
    if not body or any(len(r) != len(INCOME_HEADER) for r in body):
        raise ValueError('Income empty without explicit evidence, or malformed row')
    records = []
    for cells in body:
        r = dict(zip(INCOME_HEADER, cells))
        dt = datetime.strptime(r['Time'], '%Y-%m-%d %H:%M:%S')
        if dt.year != year:
            raise ValueError('Income timestamp outside report year')
        if r['Type'] not in PNL_TYPES | {'TRANSFER'}:
            raise ValueError('Unreviewed income type: do not assume PnL')
        if r['Type'] != 'TRANSFER' and r['Symbol'] not in SYMBOLS:
            raise ValueError('Unreviewed income product')
        if r['Asset'] not in {'USDT', 'BNB'}:
            raise ValueError('Unreviewed currency')
        if not re.fullmatch(r'\d+', r['Transaction ID']):
            raise ValueError('Invalid transaction identifier')
        decimal_value(r['Amount'])
        r['_time'] = dt.replace(tzinfo=TZ).isoformat(timespec='seconds')
        records.append(r)
    keys = [(r['Type'], r['Transaction ID']) for r in records]
    if len(keys) != len(set(keys)):
        raise ValueError('Duplicate income type and transaction identifier')
    return records, {'year': year, 'state': 'received', 'returned_rows': len(records)}


def compare(trades, income):
    """Compare signed totals by symbol/type/asset; income is the one PnL ledger."""
    left, right = defaultdict(Decimal), defaultdict(Decimal)
    for r in trades:
        left[(r['Symbol'], 'COMMISSION', r['_fee_asset'])] -= decimal_value(r['_fee_amount'])
        left[(r['Symbol'], 'REALIZED_PNL', 'USDT')] += decimal_value(r['Realized Profit'])
    for r in income:
        if r['Type'] in {'COMMISSION', 'REALIZED_PNL'}:
            right[(r['Symbol'], r['Type'], r['Asset'])] += decimal_value(r['Amount'])
    return [{'symbol': k[0], 'type': k[1], 'asset': k[2],
             'trade_minus_income': str(left[k]-right[k])}
            for k in sorted(left.keys() | right.keys()) if left[k] != right[k]]


def summarize(income, symbol=None):
    totals = defaultdict(Decimal)
    for r in income:
        if r['Type'] != 'TRANSFER' and (symbol is None or r['Symbol'] == symbol):
            totals[(r['Asset'], r['Type'])] += decimal_value(r['Amount'])
    by_asset = {}
    for asset in sorted({k[0] for k in totals}):
        values = {kind: str(totals[(asset, kind)]) for kind in sorted(PNL_TYPES)}
        values['net_realized_ledger'] = str(sum((totals[(asset, kind)] for kind in PNL_TYPES), Decimal(0)))
        by_asset[asset] = values
    return by_asset


def reconcile(raw_dir, out_dir, private_map):
    raw_dir, out_dir, private_map = [Path(p).resolve() for p in (raw_dir, out_dir, private_map)]
    if raw_dir.is_relative_to(REPO) or out_dir.is_relative_to(REPO) or out_dir.is_relative_to(raw_dir):
        raise ValueError('Separate raw files from repository and output')
    if private_map.is_relative_to(REPO) or private_map.is_relative_to(out_dir):
        raise ValueError('Keep private income mapping outside repository and output')
    annual, all_income, private_hashes = [], [], {}
    for year in YEARS:
        income, status = read_income(raw_dir, year)
        trades, ts = read_year(raw_dir, year)
        known = status['state'] != 'missing_source'
        comparable = known and ts['state'] != 'missing_source'
        diffs = compare(trades, income) if comparable else None
        if diffs:
            raise ValueError('Trade versus income reconciliation failed')
        annual.append({**status, 'trade_source_state': ts['state'],
                       'trade_income_differences': diffs,
                       'transfer_rows_excluded': sum(r['Type']=='TRANSFER' for r in income) if known else None,
                       'income_rows_published_candidate': sum(r['Type']!='TRANSFER' for r in income) if known else None,
                       'all_usdm': summarize(income) if known else None,
                       'btc_usdt': summarize(income, 'BTCUSDT') if known else None})
        all_income.extend(r for r in income if r['Type'] != 'TRANSFER')
        path = source_path(raw_dir, year, 'Transaction')
        if path.is_file():
            private_hashes[str(year)] = hashlib.sha256(path.read_bytes()).hexdigest()
    all_income.sort(key=lambda r:r['_time'])
    keys = [(r['Type'], r['Transaction ID']) for r in all_income]
    if len(keys) != len(set(keys)):
        raise ValueError('Duplicate income across years')
    public, mapping = [], {}
    for i,r in enumerate(all_income,1):
        code = f'I{i:06d}'
        mapping[r['Type']+':'+r['Transaction ID']] = code
        public.append([code, r['_time'], r['Type'], r['Amount'], r['Asset'], r['Symbol']])
    buf=io.StringIO(newline=''); writer=csv.writer(buf, lineterminator='\n')
    writer.writerow(PUBLIC_HEADER);writer.writerows(public)
    content=buf.getvalue()
    if {r['Transaction ID'] for r in all_income} & set(re.findall(r'\d+',content)):
        raise ValueError('Source transaction identifier collision')
    report={'release_state':'local_candidate_license_pending', 'data_license':None,
            'scope':'same account USD-M futures, 2020-2025 annual requests, UTC+8',
            'annual':annual,'income_rows':len(public),'duplicate_income_keys':0,
            'totals_all_usdm':summarize(all_income),'totals_btc_usdt':summarize(all_income,'BTCUSDT'),
            'income_sha256':hashlib.sha256(content.encode()).hexdigest(),
            'account_total_return':None,'unrealized_pnl':None,'fx_conversion':'not_performed',
            'method':'Income ledger only; fills reconcile, not added. Transfers excluded. Signed currencies separate.',
            'source_account_check':'Trade Uids matched locally; income CSV has no account identifier; linked by authenticated export session and paired 2022 account metadata.'}
    private={'income_map':mapping,'source_sha256':private_hashes,'income_sha256':report['income_sha256']}
    if private_map.exists() and json.loads(private_map.read_text()) != private:
        raise ValueError('Mapping changed; choose a new release version')
    for p in [out_dir,private_map.parent]:p.mkdir(mode=0o700,parents=True,exist_ok=True)
    (out_dir/'income.csv').write_text(content)
    (out_dir/'pnl-summary.json').write_text(json.dumps(report,indent=2)+'\n')
    private_map.write_text(json.dumps(private,indent=2)+'\n')
    for p in [out_dir/'income.csv',out_dir/'pnl-summary.json',private_map]:p.chmod(0o600)
    return report


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ['raw-dir','out-dir','private-map']:parser.add_argument('--'+name,required=True)
    args=parser.parse_args()
    try: report=reconcile(args.raw_dir,args.out_dir,args.private_map)
    except (ValueError,OSError) as error:raise SystemExit('Reconciliation stopped: '+type(error).__name__+'; inspect inputs locally.') from None
    print(json.dumps({'income_rows':report['income_rows'],'totals_all_usdm':report['totals_all_usdm']}))
