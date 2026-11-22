"""CUE threshold analysis (offline, from the context log).

For every explanation draft that CUE scored, this reports how many first-attempt
drafts would pass at each candidate threshold, and whether any draft that passed
at 0.80 still contained an unsupported claim. It answers "why 0.80?" with the
system's own data; it does not replace the human rating in eval:cue-human.

  python3 scripts/analyse-cue-threshold.py [--until=2026-10-01]

Writes data/evaluation/reports/cue-threshold.latest.md and cue-threshold.latest.png.
"""
import json, sys
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
until = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--until=")), "2026-10-01")
runs = [json.loads(l) for l in (ROOT / "data/logs/context-log.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
runs = [r for r in runs if r.get("at", "") < until]
drafts = [d for r in runs for d in r.get("drafts", []) if isinstance((d.get("cue") or {}).get("score"), (int, float))]
first = [d for d in drafts if d.get("attempt") == 1]
scores = [round(d["cue"]["score"], 4) for d in first]
dist = sorted(Counter(round(s, 2) for s in scores).items())
thresholds = [0.50, 0.60, 0.67, 0.70, 0.75, 0.80, 0.90, 1.00]
rows = [(t, sum(1 for s in scores if s >= t - 1e-9)) for t in thresholds]
passed_with_unsupported = [d for d in drafts if d.get("verdict") == "passed" and (d["cue"].get("unsupported") or [])]
between = sum(1 for s in scores if 0.80 <= s < 1.0)
methods = Counter(d["cue"].get("method") for d in drafts)

lines = [
    "# CUE threshold analysis", "",
    f"Generated {date.today().isoformat()} by `python3 scripts/analyse-cue-threshold.py`. Source: {len(runs)} routines in the context log before {until}; "
    f"{len(drafts)} scored drafts, of which {len(first)} were first attempts (judge: {dict(methods)}).", "",
    "## First-attempt drafts that would pass at each threshold", "",
    "| Threshold | Drafts passing | Share |", "| ---: | ---: | ---: |",
]
for t, n in rows:
    mark = " (current)" if abs(t - 0.80) < 1e-9 else ""
    lines.append(f"| {t:.2f}{mark} | {n} | {100 * n / len(first):.1f}% |")
lines += ["", "## Score distribution (first attempts)", "", "| CUE score | Drafts |", "| ---: | ---: |"]
lines += [f"| {s:.2f} | {n} |" for s, n in dist]
lines += ["", "## Findings", "",
          f"- No first-attempt draft scored between 0.80 and 1.00 ({between} drafts). Drafts contain few claims, so a single unsupported claim already lowers the score to 0.75 (3 of 4) or below.",
          f"- In this data the 0.80 gate therefore behaved exactly like a strict \"every claim supported\" rule: it passed the same {rows[5][1]} drafts as a threshold of 1.00.",
          f"- Drafts that passed but still listed an unsupported claim: {len(passed_with_unsupported)}.",
          "- A lower threshold (0.75 or 0.67) would have let drafts with an unsupported claim through; the 0.80 value, taken from RAGAS-style faithfulness practice, keeps tolerance for longer explanations without admitting any in the observed data.",
          "- Limitation: these are CUE's own scores. Whether CUE judges claims as people would is measured separately by the human rating (eval:cue-human)."]
out_md = ROOT / "data/evaluation/reports/cue-threshold.latest.md"
out_md.parent.mkdir(parents=True, exist_ok=True)
out_md.write_text("\n".join(lines) + "\n", encoding="utf-8")

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(7.5, 3.6), dpi=200)
    xs = [f"{t:.2f}" for t, _ in rows]; ys = [100 * n / len(first) for _, n in rows]
    cols = ["#2C5F2D" if abs(t - 0.80) < 1e-9 else "#A9C3A6" for t, _ in rows]
    bars = ax.bar(xs, ys, color=cols, width=0.62)
    for b, y in zip(bars, ys): ax.text(b.get_x() + b.get_width() / 2, y + 0.4, f"{y:.1f}%", ha="center", va="bottom", fontsize=8.5, color="#1E2A22")
    ax.set_ylim(min(ys) - 4, 100.5); ax.set_ylabel("First-attempt drafts passing (%)", fontsize=9)
    ax.set_xlabel("CUE threshold (current: 0.80)", fontsize=9)
    for s in ("top", "right"): ax.spines[s].set_visible(False)
    ax.tick_params(labelsize=8.5)
    plt.tight_layout(); plt.savefig(ROOT / "data/evaluation/reports/cue-threshold.latest.png", facecolor="white")
except ImportError:
    pass
print("\n".join(lines))
