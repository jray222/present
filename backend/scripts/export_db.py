#!/usr/bin/env python3
"""Database export utility for Present.
Backs up the SQLite database to a specified output file or timestamped default.
"""
import sys
import os
import sqlite3
from datetime import datetime, timezone

# Add parent directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.config import settings

def export_db(output_path: str = None) -> str:
    if not settings.DATABASE_URL.startswith("sqlite"):
        print(f"Error: DATABASE_URL is not SQLite ({settings.DATABASE_URL})", file=sys.stderr)
        sys.exit(1)

    db_path = settings.DATABASE_URL.replace("sqlite:///", "")
    resolved_path = os.path.abspath(db_path)
    if not os.path.exists(resolved_path):
        print(f"Error: Database file not found at {resolved_path}", file=sys.stderr)
        sys.exit(1)

    if not output_path:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        output_path = f"present_backup_{timestamp}.db"

    out_abs = os.path.abspath(output_path)
    os.makedirs(os.path.dirname(out_abs) or ".", exist_ok=True)

    print(f"Backing up {resolved_path} -> {out_abs} ...")
    src = sqlite3.connect(resolved_path)
    dest = sqlite3.connect(out_abs)
    try:
        with dest:
            src.backup(dest)
    finally:
        src.close()
        dest.close()

    print(f"✅ Backup completed successfully: {out_abs} ({os.path.getsize(out_abs)} bytes)")
    return out_abs

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else None
    export_db(target)
