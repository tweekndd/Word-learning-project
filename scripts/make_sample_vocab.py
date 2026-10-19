#!/usr/bin/env python3
"""Generate a demo vocabulary CSV from the ECDICT dataset.

The ECDICT data is used only as a *local* dictionary source in development.
The generated file keeps ECDICT's own field names so that the importer's
column-mapping feature can be exercised (Word / 单词 style aliases also work).

Usage:
    python3 scripts/make_sample_vocab.py \
        ECDICT-master/ECDICT-master/ecdict.csv samples/business_english.csv
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

WORDS = [
    "negotiate", "invoice", "deadline", "colleague", "revenue", "budget",
    "contract", "schedule", "strategy", "stakeholder", "agenda", "invoice",
    "quotation", "shipment", "warehouse", "inventory", "procurement",
    "auction", "leverage", "diversify", "subsidiary", "merger", "acquisition",
    "liability", "asset", "depreciation", "audit", "compliance",
    "reimbursement", "remittance", "tariff", "customs", "bilateral",
    "multilateral", "consignment", "freight", "surcharge", "discount",
    "rebate", "commission", "portfolio", "dividend", "equity", "collateral",
    "amortize", "arbitrage", "benchmark", "bottleneck", "consortium",
    "entrepreneur", "franchise", "outsource", "downsize", "retention",
    "turnover", "appraisal", "promotion", "incentive", "bonus", "payroll",
]


def norm(word: str) -> str:
    return word.strip().lower()


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    if not src.exists():
        print(f"source not found: {src}", file=sys.stderr)
        return 1

    wanted = {norm(w): w for w in WORDS}
    found: dict[str, list[str]] = {}

    with src.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = norm(row.get("word", ""))
            if key in wanted and key not in found:
                found[key] = row
            if len(found) == len(wanted):
                break

    missing = sorted(set(wanted) - set(found))
    if missing:
        print(f"warning: not found in ECDICT: {missing}", file=sys.stderr)

    dst.parent.mkdir(parents=True, exist_ok=True)
    fields = ["word", "phonetic", "translation", "definition", "pos", "tag"]
    with dst.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for key in WORDS:
            row = found.get(key)
            if not row:
                continue
            writer.writerow({
                "word": row.get("word", ""),
                "phonetic": row.get("phonetic", ""),
                "translation": (row.get("translation", "") or "").replace("\n", " | "),
                "definition": (row.get("definition", "") or "").replace("\n", " | "),
                "pos": row.get("pos", ""),
                "tag": row.get("tag", ""),
            })

    print(f"wrote {len(found)} words to {dst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
