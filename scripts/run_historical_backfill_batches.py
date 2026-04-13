#!/usr/bin/env python3
"""Run historical mail backfill in deterministic batches."""

from __future__ import annotations

import os
import subprocess
import sys
import time


PYTHON_BIN = os.environ.get("BACKFILL_PYTHON_BIN", sys.executable)
BACKFILL_SCRIPT = os.environ.get(
    "BACKFILL_SCRIPT",
    os.path.join(os.path.dirname(__file__), "backfill_mail_to_work_assistant.py"),
)

START_OFFSET = int(os.environ.get("BACKFILL_START_OFFSET", "0"))
BATCH_SIZE = int(os.environ.get("BACKFILL_BATCH_SIZE", "50"))
MAX_BATCHES = int(os.environ.get("BACKFILL_MAX_BATCHES", "0"))
PAUSE_SECONDS = int(os.environ.get("BACKFILL_PAUSE_SECONDS", "3"))
STOP_ON_FAILURE = os.environ.get("BACKFILL_STOP_ON_FAILURE", "true").lower() not in {"0", "false", "no"}


def main() -> int:
    offset = START_OFFSET
    batch_number = 0

    while True:
        if MAX_BATCHES and batch_number >= MAX_BATCHES:
            print(f"Stopped after MAX_BATCHES={MAX_BATCHES}")
            return 0

        env = os.environ.copy()
        env["BACKFILL_OFFSET"] = str(offset)
        env["BACKFILL_LIMIT"] = str(BATCH_SIZE)

        batch_number += 1
        print(
            f"=== Batch {batch_number} | offset={offset} | limit={BATCH_SIZE} | "
            f"script={BACKFILL_SCRIPT} ===",
            flush=True,
        )

        result = subprocess.run(
            [PYTHON_BIN, "-u", BACKFILL_SCRIPT],
            env=env,
            check=False,
        )
        print(
            f"=== Batch {batch_number} finished with exit_code={result.returncode} ===",
            flush=True,
        )

        if result.returncode != 0 and STOP_ON_FAILURE:
            print("Stopping because BACKFILL_STOP_ON_FAILURE=true", flush=True)
            return result.returncode

        offset += BATCH_SIZE
        if PAUSE_SECONDS > 0:
            time.sleep(PAUSE_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())
