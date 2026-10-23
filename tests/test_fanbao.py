"""Synthetic fixtures only; never use personal identifiers in tests."""
import csv
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('prepare_fanbao', Path(__file__).resolve().parents[1] / 'scripts/prepare_fanbao.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CandidateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.raw = self.root / 'raw'
        self.raw.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, year, body):
        with (self.raw / f'USD-M-Trade-History-{year}-original.csv').open('w', encoding='utf-8-sig', newline='') as handle:
            writer = csv.writer(handle)
            writer.writerow(MODULE.SOURCE_HEADER)
            writer.writerows(body)

    def row(self, trade='900000000001', order='800000000001', time='2025-01-02 03:04:05'):
        return ['700000000001', time, 'BTCUSDT', 'BUY', '123.4500', '0.0100', '1.23450000',
                '0.00012345 USDT', '0.0000', 'true', 'false', trade, order]

    def run_candidate(self):
        return MODULE.prepare(self.raw, self.root / 'candidate', self.root / 'private' / 'mapping.json')

    def test_partial_fills_share_order_and_preserve_precision(self):
        self.write(2025, [self.row(), self.row(trade='900000000002')])
        result = self.run_candidate()
        self.assertEqual((result['fills'], result['distinct_orders']), (2, 1))
        with (self.root / 'candidate/executions.csv').open() as handle:
            data = list(csv.DictReader(handle))
        self.assertEqual(data[0]['order_code'], data[1]['order_code'])
        self.assertNotEqual(data[0]['trade_code'], data[1]['trade_code'])
        self.assertEqual(data[0]['execution_time'], '2025-01-02T03:04:05+08:00')
        self.assertEqual(data[0]['price_usdt'], '123.4500')
        self.assertEqual(data[0]['fee_amount'], '0.00012345')
        self.assertEqual(result['data_sha256'], self.run_candidate()['data_sha256'])

    def test_missing_and_no_match_are_different(self):
        self.write(2024, [MODULE.NO_DATA])
        result = self.run_candidate()
        self.assertIsNone(result['coverage'][0]['returned_fills'])
        self.assertIsNone(result['coverage'][1]['returned_fills'])
        self.assertEqual(result['coverage'][4]['returned_fills'], 0)
        self.assertEqual(result['coverage'][4]['state'], 'source_reports_no_match')

    def test_duplicate_fill_aborts(self):
        self.write(2025, [self.row(), self.row()])
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            self.run_candidate()

    def test_wrong_year_aborts(self):
        self.write(2023, [self.row()])
        with self.assertRaisesRegex(ValueError, 'out-of-range'):
            self.run_candidate()

    def test_private_mapping_cannot_be_in_release(self):
        with self.assertRaisesRegex(ValueError, 'Private mapping'):
            MODULE.prepare(self.raw, self.root / 'out', self.root / 'out/map.json')

    def test_header_only_source_is_not_zero(self):
        self.write(2024, [])
        with self.assertRaisesRegex(ValueError, 'header-only'):
            self.run_candidate()

    def test_unexpected_column_aborts(self):
        self.write(2025, [self.row() + ['unapproved']])
        with self.assertRaisesRegex(ValueError, 'row width'):
            self.run_candidate()

    def test_nonfinite_price_aborts(self):
        row = self.row()
        row[4] = 'NaN'
        self.write(2025, [row])
        with self.assertRaises(ValueError):
            self.run_candidate()

    def test_multiple_accounts_abort(self):
        first,second=self.row(),self.row(trade='900000000002')
        second[0]='700000000002'
        self.write(2025,[first,second])
        with self.assertRaisesRegex(ValueError,'Multiple account'):
            self.run_candidate()

    def test_same_order_number_on_different_symbols_stays_separate(self):
        first,second=self.row(),self.row(trade='900000000002')
        second[2]='ETHUSDT'
        self.write(2025,[first,second])
        result=self.run_candidate()
        self.assertEqual(result['distinct_orders'],2)
        self.assertEqual(result['btc_usdt_fills'],1)


if __name__ == '__main__':
    unittest.main()
