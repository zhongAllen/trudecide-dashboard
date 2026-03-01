'''
REQ-072: 宏观宽表月度快照计算引擎

- 功能: 从时序数据表和服务配置表生成月度快照
- 作者: Manus AI
- 版本: v0.1
'''

import os
from supabase import create_client
from datetime import datetime

def init_dummy_config(sb):
    """初始化一条虚拟的打分配置用于开发和测试"""
    config_data = {
        "version": 1,
        "indicator_id": "PMI_MAN_CN", # 假设这是中国制造业PMI的ID
        "dimension": "宏观经济",
        "weight": 0.4,
        "logic_short": {
            "type": "threshold",
            "rules": [
                {"op": ">", "value": 52, "status": "扩张", "score": 80},
                {"op": ">=", "value": 50, "status": "复苏", "score": 60},
                {"op": "<", "value": 48, "status": "收缩", "score": 20},
                {"op": "<=", "value": 50, "status": "放缓", "score": 40},
            ]
        },
        "logic_mid": None, # 暂时不实现
        "logic_long": None, # 暂时不实现
        "is_active": True,
        "changelog": "v1: Initial version with PMI."
    }
    try:
        # 清理旧数据以保证幂等性
        sb.table("macro_scoring_config").delete().eq("version", 1).eq("indicator_id", "PMI_MAN_CN").execute()
        res = sb.table("macro_scoring_config").insert(config_data).execute()
        print("成功插入虚拟打分配置:", res.data)
    except Exception as e:
        print(f"插入虚拟打分配置失败: {e}")

def calculate_and_save_snapshot():
    """主函数：计算并存储宏观快照"""
    try:
        sb_url = os.environ.get("SUPABASE_URL")
        sb_key = os.environ.get("SUPABASE_KEY")
        if not sb_url or not sb_key:
            raise ValueError("Supabase URL或Key未在环境变量中设置")
        sb = create_client(sb_url, sb_key)

        # 1. 初始化虚拟配置 (仅用于开发)
        print("--- 步骤1: 初始化虚拟打分配置 ---")
        init_dummy_config(sb)

        # 2. 获取当前生效的打分配置
        print("\n--- 步骤2: 获取生效的打分配置 ---")
        config_res = sb.table("macro_scoring_config").select("*").eq("is_active", True).execute()
        if not config_res.data:
            print("错误：找不到生效的打分配置。")
            return
        active_configs = config_res.data
        active_version = active_configs[0]['version'] if active_configs else None
        if not active_version:
            print("错误：无法确定当前生效的配置版本。")
            return
        print(f"获取到 {len(active_configs)} 条生效的配置，版本号为: {active_version}。")

        # 3. 获取需要的时序数据
        print("\n--- 步骤3: 从数据库获取时序数据 ---")
        timeseries_data = {}
        for config in active_configs:
            indicator_id = config["indicator_id"]
            # 获取该指标最新的一条记录
            ts_res = sb.table("macro_timeseries").select("period, value").eq("ts_code", indicator_id).order("period", desc=True).limit(1).execute()
            if ts_res.data:
                latest_record = ts_res.data[0]
                timeseries_data[indicator_id] = {latest_record['period']: latest_record['value']}
                print(f"成功获取指标 {indicator_id} 的最新数据: {timeseries_data[indicator_id]}")
            else:
                print(f"警告: 未在 macro_timeseries 表中找到指标 {indicator_id} 的数据。")

        # 4. 计算信号和分数
        print("\n--- 步骤4: 计算信号和分数 ---")
        snapshot_month = datetime.now().strftime("%Y%m")
        dimension_calculations = {}

        for config in active_configs:
            indicator_id = config["indicator_id"]
            if indicator_id in timeseries_data:
                latest_period = list(timeseries_data[indicator_id].keys())[0]
                latest_value = timeseries_data[indicator_id][latest_period]
                print(f"处理指标: {indicator_id}, 最新值: {latest_value}")

                logic = config.get("logic_short")
                if logic and logic.get("type") == "threshold":
                    indicator_status, indicator_score = "中性", 50
                    for rule in sorted(logic["rules"], key=lambda x: x['value'], reverse=True):
                        if (rule['op'] == '>' and latest_value > rule['value']) or \
                           (rule['op'] == '>=' and latest_value >= rule['value']) or \
                           (rule['op'] == '<' and latest_value < rule['value']) or \
                           (rule['op'] == '<=' and latest_value <= rule['value']):
                            indicator_status = rule['status']
                            indicator_score = rule['score']
                            break
                    
                    print(f" -> 指标计算结果: 状态={indicator_status}, 分数={indicator_score}")

                    dimension = config["dimension"]
                    if dimension not in dimension_calculations:
                        dimension_calculations[dimension] = []
                    dimension_calculations[dimension].append({
                        "score": indicator_score,
                        "weight": config.get("weight", 0)
                    })

        print("\n--- 步骤4.5: 聚合维度分数 ---")
        results_to_save = []
        for dimension, indicators in dimension_calculations.items():
            total_score = sum(ind["score"] * ind["weight"] for ind in indicators)
            total_weight = sum(ind["weight"] for ind in indicators)
            if total_weight > 0:
                final_score = total_score / total_weight
            else:
                final_score = 50 # 如果权重为0，则为中性分

            # 根据最终分数确定维度状态
            if final_score > 75:
                final_status = "扩张"
            elif final_score > 55:
                final_status = "复苏"
            elif final_score > 45:
                final_status = "中性"
            elif final_score > 25:
                final_status = "放缓"
            else:
                final_status = "收缩"

            print(f"维度 '{dimension}' 的最终结果: 状态={final_status}, 分数={final_score:.2f}")

            snapshot_entry = {
                "snapshot_month": snapshot_month,
                "region": "CN",
                "dimension": dimension,
                "timescale": "short",
                "status": final_status,
                "score": int(final_score),
                "config_version": active_version
            }
            results_to_save.append(snapshot_entry)

        # 5. 存储结果到快照表
        print("\n--- 步骤5: 存储结果到快照表 ---")
        if results_to_save:
            try:
                # 先清理当月的旧数据
                sb.table("macro_wide_snapshot").delete().eq("snapshot_month", snapshot_month).execute()
                res = sb.table("macro_wide_snapshot").insert(results_to_save).execute()
                print("成功写入月度快照:", res.data)
            except Exception as e:
                print(f"写入月度快照失败: {e}")
        else:
            print("没有需要存储的结果。")

    except Exception as e:
        print(f"发生未知错误: {e}")

if __name__ == "__main__":
    calculate_and_save_snapshot()
