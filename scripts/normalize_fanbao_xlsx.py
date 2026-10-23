"""Extract only a reviewed table from a local Binance Excel report.

Requires openpyxl. Metadata and account headings never enter normalized CSV.
The normalized trade table still contains private source IDs and stays local.
"""
import argparse
import csv
from pathlib import Path
from prepare_fanbao import REPO, SOURCE_HEADER
from reconcile_fanbao import INCOME_HEADER


def normalize(source, destination, kind):
    import openpyxl
    source,destination=Path(source).resolve(),Path(destination).resolve()
    if source.is_relative_to(REPO) or destination.is_relative_to(REPO) or source==destination:
        raise ValueError('Raw and normalized files must remain outside this repository')
    if destination.exists():raise ValueError('Refuse to overwrite normalized source')
    expected=SOURCE_HEADER if kind=='Trade' else INCOME_HEADER
    workbook=openpyxl.load_workbook(source,read_only=True,data_only=True)
    matches=[]
    for sheet in workbook:
        sheet.reset_dimensions()  # Some supplied workbooks incorrectly declare A1:A1.
        indices=None;records=[]
        for row in sheet.values:
            if indices is None:
                populated=[i for i,v in enumerate(row) if v not in (None,'')]
                if [row[i] for i in populated]==expected:indices=populated
                continue
            if not any(v not in (None,'') for v in row):continue
            if any(v not in (None,'') for i,v in enumerate(row) if i not in indices):
                raise ValueError('Unexpected data outside table columns')
            cells=[row[i] if i<len(row) and row[i] is not None else '' for i in indices]
            if not all(isinstance(v,str) for v in cells):
                raise ValueError('Non-text spreadsheet values need an explicit precision review')
            records.append(cells)
        if indices is not None:matches.append(records)
    workbook.close()
    if len(matches)!=1 or not matches[0]:raise ValueError('Missing, empty or ambiguous table')
    destination.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    with destination.open('w',encoding='utf-8',newline='') as h:
        writer=csv.writer(h,lineterminator='\n');writer.writerow(expected);writer.writerows(matches[0])
    destination.chmod(0o600)
    return len(matches[0])


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',required=True);p.add_argument('--destination',required=True)
    p.add_argument('--kind',choices=['Trade','Transaction'],required=True);args=p.parse_args()
    try:count=normalize(args.source,args.destination,args.kind)
    except (ValueError,OSError) as e:raise SystemExit('Normalization stopped: '+type(e).__name__+'; inspect locally.') from None
    print('normalized_rows='+str(count))
