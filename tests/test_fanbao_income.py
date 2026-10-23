"""Synthetic accounting tests: currencies, transfers and reconciliation."""
import csv
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import reconcile_fanbao as income


class IncomeTests(unittest.TestCase):
    def row(self,kind='REALIZED_PNL',amount='10',asset='USDT',identifier='900000000001'):
        return {'Time':'2021-01-02 03:04:05','Type':kind,'Amount':amount,'Asset':asset,
                'Symbol':'BTCUSDT','Transaction ID':identifier}

    def test_separate_currencies_and_exclude_transfers(self):
        rows=[self.row(),self.row('COMMISSION','-1'),self.row('FUNDING_FEE','-0.25'),
              self.row('COMMISSION_REBATE','0.5'),self.row('TRANSFER','10000'),
              self.row('COMMISSION','-0.1','BNB')]
        result=income.summarize(rows)
        self.assertEqual(result['USDT']['net_realized_ledger'],'9.25')
        self.assertEqual(result['BNB']['net_realized_ledger'],'-0.1')

    def test_fills_reconcile_without_adding_to_ledger(self):
        trade={'Symbol':'BTCUSDT','_fee_asset':'USDT','_fee_amount':'1','Realized Profit':'10'}
        rows=[self.row(),self.row('COMMISSION','-1')]
        self.assertEqual(income.compare([trade],rows),[])
        self.assertEqual(income.summarize(rows)['USDT']['net_realized_ledger'],'9')
        rows[0]['Amount']='11'
        self.assertTrue(income.compare([trade],rows))

    def test_missing_income_not_zero(self):
        with tempfile.TemporaryDirectory() as folder:
            rows,status=income.read_income(Path(folder),2020)
            self.assertEqual(rows,[])
            self.assertEqual(status['state'],'missing_source')
            self.assertIsNone(status['returned_rows'])

    def test_duplicate_income_and_unknown_adjustment_abort(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'USD-M-Transaction-History-2021-original.csv'
            for rows,message in [([self.row(),self.row()],'Duplicate'),([self.row('UNKNOWN')],'Unreviewed')]:
                with path.open('w',newline='') as h:
                    w=csv.DictWriter(h,fieldnames=income.INCOME_HEADER);w.writeheader();w.writerows(rows)
                with self.assertRaisesRegex(ValueError,message):income.read_income(Path(folder),2021)

if __name__=='__main__':unittest.main()
