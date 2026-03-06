#!/usr/bin/env python3
"""REQ-177: 指数基本信息采集"""
import os, sys, logging
from datetime import datetime
import pandas as pd
import tushare as ts
from supabase import create_client

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

TUSHARE_TOKEN = os.environ.get('TUSHARE_TOKEN')
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY')

def main():
    logger.info("=== 指数基本信息采集开始 ===")
    pro = ts.pro_api(TUSHARE_TOKEN)
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    df = pro.index_basic(fields='ts_code,name,market,publisher,category,base_date,base_point,list_date')
    records = []
    for _, row in df.iterrows():
        records.append({
            'ts_code': row.get('ts_code'),
            'name': row.get('name'),
            'market': row.get('market'),
            'publisher': row.get('publisher'),
            'category': row.get('category'),
            'base_date': row.get('base_date'),
            'base_point': float(row['base_point']) if pd.notna(row.get('base_point')) else None,
            'list_date': row.get('list_date'),
            'collected_at': datetime.now().isoformat()
        })
    
    sb.table('index_basic').upsert(records).execute()
    logger.info(f"成功保存 {len(records)} 条记录")
    return 0

if __name__ == '__main__':
    sys.exit(main())
