#!/usr/bin/env python3
"""Parse all 88+ xlsx files from soil report/ into unified JSON."""
import os, json, glob
from openpyxl import load_workbook

SOIL_REPORT_DIR = os.path.join(os.path.dirname(__file__), '..', 'soil report')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'datasets')

def parse_xlsx(filepath):
    """Parse a single xlsx file and return list of dicts."""
    try:
        wb = load_workbook(filepath, read_only=True, data_only=True)
        sheets_data = {}
        for name in wb.sheetnames:
            ws = wb[name]
            rows = list(ws.iter_rows(values_only=True))
            if len(rows) < 2:
                continue
            headers = [str(h).strip() if h else f'col_{i}' for i, h in enumerate(rows[0])]
            records = []
            for row in rows[1:]:
                if all(c is None for c in row):
                    continue
                record = {}
                for i, val in enumerate(row):
                    if i < len(headers):
                        record[headers[i]] = val
                records.append(record)
            if records:
                sheets_data[name] = records
        wb.close()
        return sheets_data
    except Exception as e:
        return {'error': str(e)}

def parse_all():
    """Parse all xlsx files organized by category."""
    result = {}
    categories = {}

    for root, dirs, files in os.walk(SOIL_REPORT_DIR):
        for f in files:
            if not f.endswith('.xlsx') or f.startswith('~'):
                continue
            filepath = os.path.join(root, f)
            rel = os.path.relpath(filepath, SOIL_REPORT_DIR)
            parts = rel.split(os.sep)
            category = parts[0] if len(parts) > 1 else 'root'
            subcategory = parts[1] if len(parts) > 2 else ''

            if category not in categories:
                categories[category] = {}
            if subcategory not in categories[category]:
                categories[category][subcategory] = []

            data = parse_xlsx(filepath)
            entry = {'file': f, 'path': rel, 'data': data}
            categories[category][subcategory].append(entry)
            print(f'  Parsed: {rel}')

    # Save full data
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    output_file = os.path.join(OUTPUT_DIR, 'soil_report_all.json')
    with open(output_file, 'w', encoding='utf-8') as fp:
        json.dump(categories, fp, ensure_ascii=False, indent=2, default=str)

    # Create summary
    summary = {}
    for cat, subs in categories.items():
        summary[cat] = {}
        for sub, files in subs.items():
            total_records = 0
            for f in files:
                for sheet_name, records in f['data'].items():
                    if isinstance(records, list):
                        total_records += len(records)
            summary[cat][sub] = {'files': len(files), 'total_records': total_records}

    summary_file = os.path.join(OUTPUT_DIR, 'soil_report_summary.json')
    with open(summary_file, 'w', encoding='utf-8') as fp:
        json.dump(summary, fp, ensure_ascii=False, indent=2)

    print(f'\nTotal categories: {len(categories)}')
    print(f'Output: {output_file}')
    print(f'Summary: {summary_file}')
    return categories

if __name__ == '__main__':
    print('=== Parsing 88+ xlsx files ===')
    parse_all()
    print('Done!')
