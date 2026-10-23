"""Prepare a local de-identified research candidate. No network or publishing.

Code: repository MIT license. Dataset licensing is separate.
"""
import argparse
import csv
import hashlib
import io
import json
import os
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

SOURCE_HEADER = ['Uid', 'Time', 'Symbol', 'Side', 'Price', 'Quantity', 'Amount',
                 'Fee', 'Realized Profit', 'Buyer', 'Maker', 'Trade ID', 'Order ID']
PUBLIC_HEADER = ['trade_code', 'order_code', 'execution_time', 'symbol', 'side',
                 'price_usdt', 'quantity_base', 'amount_usdt', 'fee_amount',
                 'fee_asset', 'realized_profit_usdt', 'is_maker']
YEARS = range(2020, 2026)
SYMBOLS = {'BTCUSDT', 'ETHUSDT', 'ETHUSDT_210625', 'LUNAUSDT'}
NO_DATA = ['No data matches the criteria.']
TZ = timezone(timedelta(hours=8))
REPO = Path(__file__).resolve().parents[1]


def decimal_value(value):
    if not re.fullmatch(r'-?\d+(?:\.\d+)?', value):
        raise ValueError('Invalid decimal syntax')
    try:
        number = Decimal(value)
    except InvalidOperation as error:
        raise ValueError('Invalid decimal') from error
    if not number.is_finite():
        raise ValueError('Nonfinite decimal')
    return number


def source_path(raw_dir, year, kind='Trade'):
    original = raw_dir / f'USD-M-{kind}-History-{year}-original.csv'
    normalized = raw_dir / f'USD-M-{kind}-History-{year}-normalized.csv'
    if original.exists() and normalized.exists():
        raise ValueError('Ambiguous source versions')
    return original if original.exists() else normalized


def read_year(raw_dir, year):
    source = source_path(raw_dir, year)
    if not source.is_file():
        return [], {'year': year, 'state': 'missing_source', 'returned_fills': None,
                    'btc_usdt_fills': None, 'distinct_orders': None}
    with source.open(encoding='utf-8-sig', newline='') as handle:
        parsed = list(csv.reader(handle, strict=True))
    if not parsed or parsed[0] != SOURCE_HEADER:
        raise ValueError(f'{year}: unexpected source schema')
    body = [row for row in parsed[1:] if any(row)]
    if body == [NO_DATA]:
        return [], {'year': year, 'state': 'source_reports_no_match',
                    'returned_fills': 0, 'btc_usdt_fills': 0, 'distinct_orders': 0}
    if not body:
        raise ValueError(f'{year}: header-only source has no explicit no-match evidence')
    if any(len(row) != len(SOURCE_HEADER) for row in body):
        raise ValueError(f'{year}: malformed row width')
    records = []
    for row in body:
        record = dict(zip(SOURCE_HEADER, row))
        timestamp = datetime.strptime(record['Time'], '%Y-%m-%d %H:%M:%S')
        if timestamp.year != year:
            raise ValueError(f'{year}: out-of-range timestamp')
        if record['Symbol'] not in SYMBOLS:
            raise ValueError('Unreviewed product: review scope before release')
        if record['Side'] not in ('BUY', 'SELL') or record['Maker'] not in ('true', 'false'):
            raise ValueError(f'{year}: invalid direction or maker flag')
        for name in ('Uid', 'Trade ID', 'Order ID'):
            if not re.fullmatch(r'\d+', record[name]):
                raise ValueError(f'{year}: invalid source identifier')
        for name in ('Price', 'Quantity', 'Amount'):
            if decimal_value(record[name]) <= 0:
                raise ValueError(f'{year}: nonpositive execution value')
        decimal_value(record['Realized Profit'])
        fee = re.fullmatch(r'(-?\d+(?:\.\d+)?)\s*([A-Z][A-Z0-9]*)', record['Fee'])
        if not fee:
            raise ValueError(f'{year}: invalid fee and currency')
        record['_fee_amount'], record['_fee_asset'] = fee.groups()
        decimal_value(record['_fee_amount'])
        record['_time'] = timestamp.replace(tzinfo=TZ).isoformat(timespec='seconds')
        records.append(record)
    return records, {'year': year, 'state': 'received', 'returned_fills': len(body),
                     'btc_usdt_fills': sum(r['Symbol'] == 'BTCUSDT' for r in records),
                     'distinct_orders': len({(r['Symbol'], r['Order ID']) for r in records})}


def prepare(raw_dir, out_dir, private_map):
    raw_dir, out_dir, private_map = map(lambda p: Path(p).resolve(), (raw_dir, out_dir, private_map))
    if private_map.is_relative_to(REPO) or private_map.is_relative_to(out_dir):
        raise ValueError('Private mapping must be outside the repository and release directory')
    if raw_dir.is_relative_to(REPO) or out_dir.is_relative_to(REPO) or out_dir == raw_dir or out_dir.is_relative_to(raw_dir):
        raise ValueError('Keep raw inputs outside the repository and separate from outputs')
    rows, coverage, source_hashes = [], [], {}
    for year in YEARS:
        part, status = read_year(raw_dir, year)
        rows.extend(part)
        coverage.append(status)
        source = source_path(raw_dir, year)
        if source.is_file():
            source_hashes[str(year)] = hashlib.sha256(source.read_bytes()).hexdigest()
    if len({r['Uid'] for r in rows}) > 1:
        raise ValueError('Multiple account identifiers: review scope before release')
    trade_keys = [(r['Symbol'], r['Trade ID']) for r in rows]
    if len(trade_keys) != len(set(trade_keys)):
        raise ValueError('Duplicate trade identifiers: no automatic deletion or reconciliation')
    rows.sort(key=lambda r: r['_time'])  # stable: preserve source order within a timestamp
    trades, orders, public = {}, {}, []
    for row in rows:
        trade_key = row['Symbol'] + ':' + row['Trade ID']
        order_key = row['Symbol'] + ':' + row['Order ID']
        trades.setdefault(trade_key, f'F{len(trades)+1:06d}')
        orders.setdefault(order_key, f'O{len(orders)+1:06d}')
        public.append([trades[trade_key], orders[order_key], row['_time'], row['Symbol'],
                       row['Side'], row['Price'], row['Quantity'], row['Amount'],
                       row['_fee_amount'], row['_fee_asset'], row['Realized Profit'], row['Maker']])
    buffer = io.StringIO(newline='')
    writer = csv.writer(buffer, lineterminator='\n')
    writer.writerow(PUBLIC_HEADER)
    writer.writerows(public)
    csv_bytes = buffer.getvalue().encode('utf-8')
    raw_ids = {r[k] for r in rows for k in ('Uid', 'Trade ID', 'Order ID')}
    if raw_ids & set(re.findall(r'\d+', buffer.getvalue())):
        raise ValueError('Source identifier collision in candidate output: manual review required')
    check = {
        'schema_version': '1.0.0', 'dataset_id': 'fanbao-usdm-executions-v1',
        'release_state': 'local_candidate_license_pending', 'data_license': None,
        'scope': 'USD-M Futures Trade History; one authorized owner; four reviewed symbols',
        'timezone_offset': '+08:00', 'coverage': coverage,
        'fills': len(public), 'distinct_orders': len(orders), 'position_episodes': None,
        'btc_usdt_fills': sum(r['Symbol'] == 'BTCUSDT' for r in rows),
        'btc_usdt_orders': len({r['Order ID'] for r in rows if r['Symbol'] == 'BTCUSDT'}),
        'symbols': sorted({r['Symbol'] for r in rows}),
        'position_episode_state': 'unknown_missing_initial_position_and_position_side',
        'distinct_execution_dates': sorted({r['_time'][:10] for r in rows}),
        'duplicate_trade_keys': 0, 'deduplication': 'none; duplicate keys abort',
        'order_code_note': 'shared code links fills of one source order; not a position episode',
        'source_identifier_scan': 'passed', 'public_header': PUBLIC_HEADER,
        'data_sha256': hashlib.sha256(csv_bytes).hexdigest(),
        'fee_assets': sorted({r['_fee_asset'] for r in rows}),
        'market_data_join': 'not_run', 'mechanism_test': 'not_run',
        'anonymity': 'not_anonymous; exact execution trajectories can be linked',
    }
    private = {'schema_version': '1.0.0', 'trade_map': trades, 'order_map': orders,
               'source_csv_sha256': source_hashes, 'data_sha256': check['data_sha256']}
    # A repeat must reproduce the same mapping. Never silently overwrite a different mapping.
    if private_map.exists() and json.loads(private_map.read_text()) != private:
        raise ValueError('Existing mapping differs: use a new release version')
    private_map.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with os.fdopen(os.open(private_map, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as handle:
        json.dump(private, handle, indent=2)
        handle.write('\n')
    out_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    (out_dir / 'executions.csv').write_bytes(csv_bytes)
    (out_dir / 'integrity.json').write_text(json.dumps(check, indent=2) + '\n')
    for target in (private_map, out_dir / 'executions.csv', out_dir / 'integrity.json'):
        target.chmod(0o600)
    return check


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw-dir', required=True)
    parser.add_argument('--out-dir', required=True)
    parser.add_argument('--private-map', required=True)
    args = parser.parse_args()
    try:
        result = prepare(args.raw_dir, args.out_dir, args.private_map)
    except (ValueError, OSError) as error:
        # Do not print source values or private filenames in pipeline errors.
        raise SystemExit(f'Preparation stopped: {error.__class__.__name__}; inspect inputs locally.') from None
    print(json.dumps({key: result[key] for key in ('fills', 'distinct_orders', 'coverage', 'data_sha256')}))


if __name__ == '__main__':
    main()
