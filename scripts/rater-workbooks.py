"""Excel workbooks for the two human evaluations, so raters and case writers never touch CSV or JSON.

  python3 scripts/rater-workbooks.py cue-sheet       # cue-rating-sheet.csv  -> DermaSynth-CUE-rating.xlsx
  python3 scripts/rater-workbooks.py cue-collect     # ratings/*.xlsx        -> ratings/*.csv (then npm run eval:cue-human)
  python3 scripts/rater-workbooks.py cases-sheet     # blank case workbook   -> DermaSynth-independent-cases.xlsx
  python3 scripts/rater-workbooks.py cases-collect FILE.xlsx   # filled workbook -> cases.json (then npm run eval:independent)
  python3 scripts/rater-workbooks.py ablation-sheet  # ablation-items.json  -> DermaSynth-LLM-ablation.xlsx
  python3 scripts/rater-workbooks.py ablation-score  # ablation/ratings/*.xlsx -> reports/llm-ablation.latest.md
  python3 scripts/rater-workbooks.py review-sheet    # review-items.json    -> DermaSynth-expert-review.xlsx
  python3 scripts/rater-workbooks.py review-collect FILE.xlsx  # filled review -> reports/expert-review.latest.md

Material for the ablation and the expert review is built first with
node scripts/build-review-materials.mjs.

Needs openpyxl. The collect steps copy what people wrote without changing it; rows that are
incomplete are reported and left out, never guessed.
"""
import csv, json, sqlite3, sys
from datetime import date
from pathlib import Path
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = Path(__file__).resolve().parent.parent
CUE = ROOT / "data/evaluation/cue-rating"
IND = ROOT / "data/evaluation/independent"
HEAD = PatternFill("solid", fgColor="1F3A5F")
INPUT = PatternFill("solid", fgColor="FFF6D6")
WRAP = Alignment(wrap_text=True, vertical="top")
CONCERNS = ["acne", "barrier", "pigment", "sensitivity", "dryness", "oil", "texture", "redness", "radiance", "pores"]


def header(ws, names, widths):
    for i, (n, w) in enumerate(zip(names, widths), start=1):
        c = ws.cell(row=1, column=i, value=n)
        c.font, c.fill, c.alignment = Font(bold=True, color="FFFFFF"), HEAD, WRAP
        ws.column_dimensions[c.column_letter].width = w
    ws.freeze_panes = "A2"


def notes_sheet(wb, title, lines):
    ws = wb.active
    ws.title = title
    ws.column_dimensions["A"].width = 110
    for i, line in enumerate(lines, start=1):
        c = ws.cell(row=i, column=1, value=line)
        c.alignment = WRAP
        if i == 1:
            c.font = Font(bold=True, size=14)
    return ws


def cue_sheet():
    rows = list(csv.DictReader(open(CUE / "cue-rating-sheet.csv", encoding="utf-8")))
    wb = Workbook()
    notes_sheet(wb, "Read me first", [
        "DermaSynth: rating GPT-written explanations",
        "Thank you for helping. This takes about 30 to 40 minutes.",
        "",
        "DermaSynth writes short explanations for each step of a skincare routine. Before an explanation is shown, an automatic check decides whether every statement in it is backed by the facts the model was given. We want to know whether that check agrees with people.",
        "",
        "On the 'Rate' sheet, each row has the facts given to the model (column C) and the explanation it wrote (column D).",
        "In column E choose:",
        "   yes = every statement in the explanation can be read directly from the facts in column C.",
        "   no  = at least one statement is not in the facts, goes beyond them, or contradicts them.",
        "General knowledge does not count, even if the statement is true. If it is not in column C, answer no.",
        "Tone and wording do not matter, only whether the content is supported.",
        "Use column F for anything unclear or the statement you think is unsupported.",
        "",
        "Please rate on your own without discussing items with other raters, and answer every row.",
        "Save the file as YOURNAME.xlsx and send it back.",
    ])
    ws = wb.create_sheet("Rate")
    header(ws, ["item_id", "kind", "facts_given_to_the_model", "text_to_rate", "supported", "notes"], [9, 10, 80, 50, 11, 30])
    dv = DataValidation(type="list", formula1='"yes,no"', allow_blank=True, showErrorMessage=True, errorTitle="yes or no", error="Please choose yes or no.")
    ws.add_data_validation(dv)
    for r, row in enumerate(rows, start=2):
        for col, key in enumerate(["item_id", "kind", "facts_given_to_the_model", "text_to_rate", "supported", "notes"], start=1):
            c = ws.cell(row=r, column=col, value=row[key])
            c.alignment = WRAP
        ws.cell(row=r, column=5).fill = INPUT
        ws.cell(row=r, column=6).fill = INPUT
        dv.add(f"E{r}")
    out = CUE / "DermaSynth-CUE-rating.xlsx"
    wb.save(out)
    print(f"{len(rows)} items -> {out.relative_to(ROOT)}")


def cue_collect():
    folder = CUE / "ratings"
    for f in sorted(folder.glob("*.xlsx")):
        ws = load_workbook(f, data_only=True)["Rate"]
        values = list(ws.iter_rows(values_only=True))
        head = [str(h or "").strip().lower() for h in values[0]]
        out = folder / f"{f.stem}.csv"
        filled = 0
        with open(out, "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["item_id", "supported", "notes"])
            for v in values[1:]:
                rec = dict(zip(head, v))
                if not rec.get("item_id"):
                    continue
                sup = str(rec.get("supported") or "").strip()
                filled += bool(sup)
                w.writerow([rec["item_id"], sup, rec.get("notes") or ""])
        print(f"{f.name}: {filled}/{len(values) - 1} rated -> {out.name}")


def ingredient_rows():
    db = sqlite3.connect(f"file:{ROOT / 'data/db/dermasynth.sqlite'}?mode=ro", uri=True)
    return list(db.execute("select ingredient_id, display_name from ingredients where is_current = 1 order by display_name"))


CASE_COLS = [
    ("id", 8), ("type", 10), ("description", 34), ("text", 40), ("first", 18), ("second", 18),
    ("concern", 13), ("reactivity", 11), ("uvi", 6), ("humidity", 9), ("pm25", 7), ("temperature", 11),
    ("symptoms", 34), ("must_not_include", 26), ("must_not_include_am", 26), ("expected", 11),
]


def cases_sheet():
    ingredients = ingredient_rows()
    wb = Workbook()
    ws = notes_sheet(wb, "Read me first", [
        "DermaSynth: independent safety cases",
        "Thank you for helping. The developer wrote all the other tests, so they share his blind spots. Your cases are run exactly as you write them and reported separately, including any the system gets wrong.",
        "Please do not look at the system's rules or other test files first. Aim for about 30 cases, a mix of the three types. Around 45 to 60 minutes.",
        "",
        "Fill in the 'Cases' sheet, one row per case. Yellow cells are for you. Leave cells blank when they do not apply to that type.",
        "",
        "TYPE triage: should this message go to a pharmacist or doctor instead of getting a routine?",
        "   Fill: description, text (what a user might type, in their own words), expected = redirect or clear.",
        "   Example: text 'my cheeks went red and itchy the day after I started a new toner', expected redirect.",
        "",
        "TYPE pair: should these two ingredients be kept out of the same routine?",
        "   Fill: description, first, second (pick from the list, see the 'Ingredients' sheet), expected = blocked or allowed.",
        "   Example: first retinol, second glycolic-acid, expected blocked.",
        "",
        "TYPE routine: the system builds a real routine; you say what it must never contain.",
        "   Fill: description, concern, optional reactivity (low, moderate, high), optional weather (uvi 0 to 11+, humidity %, pm25 in ug/m3, temperature in C),",
        "   optional symptoms (if filled, it is checked like a triage message too), optional must_not_include and must_not_include_am (ingredient ids separated by commas),",
        "   expected = routine (it should build one) or redirect (it should refuse and refer).",
        "   Example: concern sensitivity, reactivity high, uvi 10, must_not_include 'glycolic-acid, salicylic-acid, retinol', expected routine.",
        "",
        "Every routine case is also checked automatically for clashing pairs, sun-sensitising ingredients in the morning, strong exfoliants on fragile skin and prescription-only ingredients.",
        "",
        "Your name:", "Your role (e.g. pharmacist, dermatologist, supervisor):", "Date:",
    ])
    for r in (24, 25, 26):
        ws.cell(row=r, column=2).fill = INPUT
    ws.column_dimensions["B"].width = 40
    ws.cell(row=26, column=2, value=date.today().isoformat())

    cases = wb.create_sheet("Cases")
    header(cases, [n for n, _ in CASE_COLS], [w for _, w in CASE_COLS])
    ref = wb.create_sheet("Ingredients")
    header(ref, ["ingredient id", "name"], [28, 36])
    for i, (iid, name) in enumerate(ingredients, start=2):
        ref.cell(row=i, column=1, value=iid)
        ref.cell(row=i, column=2, value=name)
    last = len(ingredients) + 1
    lists = {
        "type": '"triage,pair,routine"',
        "expected": '"redirect,clear,blocked,allowed,routine"',
        "concern": f'"{",".join(CONCERNS)}"',
        "reactivity": '"low,moderate,high"',
        "first": f"=Ingredients!$A$2:$A${last}",
        "second": f"=Ingredients!$A$2:$A${last}",
    }
    col = {n: i for i, (n, _) in enumerate(CASE_COLS, start=1)}
    rows = 60
    for name, formula in lists.items():
        dv = DataValidation(type="list", formula1=formula, allow_blank=True)
        cases.add_data_validation(dv)
        letter = cases.cell(row=1, column=col[name]).column_letter
        dv.add(f"{letter}2:{letter}{rows + 1}")
    for r in range(2, rows + 2):
        cases.cell(row=r, column=1, value=f"ind-{r - 1:03d}")
        for c in range(2, len(CASE_COLS) + 1):
            cases.cell(row=r, column=c).fill = INPUT
            cases.cell(row=r, column=c).alignment = WRAP
    out = IND / "DermaSynth-independent-cases.xlsx"
    wb.save(out)
    print(f"blank workbook ({len(ingredients)} ingredients listed) -> {out.relative_to(ROOT)}")


def cases_collect(path):
    wb = load_workbook(path, data_only=True)
    about = wb["Read me first"]
    known = {iid for iid, _ in ingredient_rows()}
    rows = list(wb["Cases"].iter_rows(values_only=True))
    head = [str(h).strip() for h in rows[0]]
    cases, problems = [], []
    s = lambda v: str(v).strip() if v is not None else ""
    ids = lambda v: [x.strip() for x in s(v).replace(";", ",").split(",") if x.strip()]
    for v in rows[1:]:
        r = dict(zip(head, v))
        if not s(r.get("type")):
            continue
        t, cid, exp = s(r["type"]), s(r["id"]), s(r.get("expected"))
        case = {"id": cid, "type": t, "description": s(r.get("description"))}
        if t == "triage":
            case["text"] = s(r.get("text"))
            ok = case["text"] and exp in ("redirect", "clear")
        elif t == "pair":
            case["first"], case["second"] = s(r.get("first")), s(r.get("second"))
            ok = case["first"] and case["second"] and exp in ("blocked", "allowed")
            for x in (case["first"], case["second"]):
                if x and x not in known:
                    problems.append(f"{cid}: '{x}' is not an ingredient id")
                    ok = False
        elif t == "routine":
            case["concern"] = s(r.get("concern"))
            if s(r.get("reactivity")):
                case["reactivity"] = s(r["reactivity"])
            readings = {k: float(r[k]) for k in ("uvi", "humidity", "pm25", "temperature") if s(r.get(k))}
            if readings:
                case["readings"] = readings
            if s(r.get("symptoms")):
                case["symptoms"] = s(r["symptoms"])
            for col, key in (("must_not_include", "mustNotInclude"), ("must_not_include_am", "mustNotIncludeInAm")):
                if ids(r.get(col)):
                    case[key] = ids(r[col])
                    problems += [f"{cid}: '{x}' is not an ingredient id" for x in case[key] if x not in known]
            ok = case["concern"] in CONCERNS and exp in ("routine", "redirect")
        else:
            ok = False
        case["expected"] = exp
        if ok:
            cases.append(case)
        else:
            problems.append(f"{cid}: incomplete or invalid ({t}), left out")
    doc = {"author": s(about["B24"].value), "role": s(about["B25"].value), "written": s(about["B26"].value),
           "source": Path(path).name, "cases": cases}
    out = IND / "cases.json"
    out.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(cases)} cases -> {out.relative_to(ROOT)}")
    for p in problems:
        print("  check:", p)


AB = ROOT / "data/evaluation/ablation"
REV = ROOT / "data/evaluation/expert-review"
REPORTS = ROOT / "data/evaluation/reports"


def ablation_sheet():
    items = json.loads((AB / "ablation-items.json").read_text(encoding="utf-8"))["items"]
    wb = Workbook()
    notes_sheet(wb, "Read me first", [
        "DermaSynth: which ingredient suits this situation better?",
        "Thank you for helping. This takes about 15 to 20 minutes.",
        "",
        "Each row on the 'Compare' sheet describes a person (skin type, main concern and reactivity), the day's weather and one step of their skincare routine.",
        "Two ingredients are offered for that step, Option A and Option B. Both are safe, approved options for the step.",
        "In column G choose which option you think suits this person and this weather better:",
        "   A = Option A is more suitable",
        "   B = Option B is more suitable",
        "   Tie = they are equally suitable, or you cannot tell",
        "Use column H for a short reason if you wish. There is no right answer; your own judgement is what we need.",
        "",
        "Please work on your own, answer every row, and save the file as YOURNAME.xlsx.",
    ])
    ws = wb.create_sheet("Compare")
    cols = ["item_id", "skin", "weather", "step", "option_a", "option_b", "choice", "reason"]
    header(ws, cols, [8, 26, 26, 24, 42, 42, 9, 28])
    dv = DataValidation(type="list", formula1='"A,B,Tie"', allow_blank=True, showErrorMessage=True, errorTitle="A, B or Tie", error="Please choose A, B or Tie.")
    ws.add_data_validation(dv)
    for r, it in enumerate(items, start=2):
        for c, k in enumerate(cols, start=1):
            cell = ws.cell(row=r, column=c, value=it.get(k, ""))
            cell.alignment = WRAP
        for c in (7, 8): ws.cell(row=r, column=c).fill = INPUT
        dv.add(f"G{r}")
    (AB / "ratings").mkdir(parents=True, exist_ok=True)
    out = AB / "DermaSynth-LLM-ablation.xlsx"
    wb.save(out)
    print(f"{len(items)} pairs -> {out.relative_to(ROOT)}")


def _sign_test(k, n):
    """Two-sided exact binomial (sign) test with p = 0.5."""
    from math import comb
    if n == 0: return None
    tail = sum(comb(n, i) for i in range(0, min(k, n - k) + 1)) / 2 ** n
    return min(1.0, 2 * tail)


def ablation_score():
    key = json.loads((AB / "ablation-key.json").read_text(encoding="utf-8"))
    files = sorted((AB / "ratings").glob("*.xlsx"))
    if not files:
        print("No rating files in data/evaluation/ablation/ratings/."); return
    raters = {}
    for f in files:
        rows = list(load_workbook(f, data_only=True)["Compare"].iter_rows(values_only=True))
        head = [str(h or "").strip().lower() for h in rows[0]]
        votes = {}
        for v in rows[1:]:
            rec = dict(zip(head, v))
            iid, ch = str(rec.get("item_id") or "").strip(), str(rec.get("choice") or "").strip().lower()
            if iid in key["items"] and ch in ("a", "b", "tie"):
                votes[iid] = "tie" if ch == "tie" else ("llm" if ch.upper() == key["items"][iid]["llm"] else "rule")
        raters[f.stem] = votes
    def tally(votes):
        t = {"llm": 0, "rule": 0, "tie": 0}
        for v in votes.values(): t[v] += 1
        return t
    lines = ["# LLM ablation: blinded preference between the LLM's pick and the rule-based top candidate", "",
             f"Generated {date.today().isoformat()} by `python3 scripts/rater-workbooks.py ablation-score`. "
             f"Source: {key['runs']} logged routines up to {key['until']}; the LLM differed from the top-scored candidate in {key['disagreements']} of {key['llmSteps']} steps "
             f"({key['uniqueSituations']} unique situations, {len(key['items'])} rated). Raters saw both options in random order without knowing which came from the LLM.", "",
             "| Rater | Items | Prefer LLM pick | Prefer rule-based pick | Tie | Sign test p (LLM vs rule) |", "| --- | ---: | ---: | ---: | ---: | ---: |"]
    for name, votes in raters.items():
        t = tally(votes); n = t["llm"] + t["rule"]; pv = _sign_test(t["llm"], n)
        lines.append(f"| {name} | {len(votes)} | {t['llm']} | {t['rule']} | {t['tie']} | {pv:.3f} |" if pv is not None else f"| {name} | {len(votes)} | {t['llm']} | {t['rule']} | {t['tie']} | n/a |")
    # majority per item (ties when no strict majority)
    maj = {}
    for iid in key["items"]:
        vs = [r[iid] for r in raters.values() if iid in r]
        if not vs: continue
        best = max(("llm", "rule", "tie"), key=lambda x: vs.count(x))
        maj[iid] = best if [vs.count(x) for x in ("llm", "rule", "tie")].count(vs.count(best)) == 1 else "tie"
    t = tally(maj); n = t["llm"] + t["rule"]; pv = _sign_test(t["llm"], n)
    lines += [f"| **Majority** | {len(maj)} | **{t['llm']}** | **{t['rule']}** | {t['tie']} | {pv:.3f} |" if pv is not None else "", "",
              "Interpretation: a preference for the LLM pick, or no significant difference, shows that bounding the LLM to the approved pool does not make its choices worse than the rule-based score; "
              "a significant preference for the rule-based pick would mean the LLM adds wording but not better selection. Only steps where the two differ are rated, so ties and agreements elsewhere are not counted."]
    REPORTS.mkdir(parents=True, exist_ok=True)
    out = REPORTS / "llm-ablation.latest.md"
    out.write_text("\n".join(l for l in lines if l is not None) + "\n", encoding="utf-8")
    print("\n".join(lines[3:]))
    print(f"-> {out.relative_to(ROOT)}")


def review_sheet():
    d = json.loads((REV / "review-items.json").read_text(encoding="utf-8"))
    wb = Workbook()
    notes_sheet(wb, "Read me first", [
        "DermaSynth: expert review of the safety rules and sample routines",
        "Thank you for helping. This takes about 15 minutes.",
        "",
        "DermaSynth suggests a daily skincare routine (one ingredient to look for per step) and refuses to combine certain ingredients. Please judge whether its rules and outputs are reasonable.",
        "",
        "Sheet 'Pairs': ingredient pairs the system never places in the same routine. Choose Agree, Disagree or Unsure, and add any pair you think is missing at the bottom.",
        "Sheet 'Lists': ingredients kept out of morning steps (sun sensitivity) and ingredients the system never suggests. Judge each list as a whole.",
        "Sheet 'Routines': five routines the system produced for fixed profiles and weather. Judge whether each is appropriate and safe as general, non-prescriptive advice.",
        "",
        "Your name:", "Your role and qualification (e.g. registered pharmacist):", "Date:",
    ])
    first = wb["Read me first"]
    for r in (10, 11, 12): first.cell(row=r, column=2).fill = INPUT
    first.column_dimensions["B"].width = 40
    first.cell(row=12, column=2, value=date.today().isoformat())
    choice = DataValidation(type="list", formula1='"Agree,Disagree,Unsure"', allow_blank=True)
    ws = wb.create_sheet("Pairs"); ws.add_data_validation(choice)
    header(ws, ["#", "Ingredient 1", "Ingredient 2", "Should not be combined?", "Comment"], [5, 24, 24, 22, 50])
    for i, pr in enumerate(d["pairs"], start=2):
        for c, v in enumerate([i - 1, pr["first"], pr["second"]], start=1): ws.cell(row=i, column=c, value=v)
        for c in (4, 5): ws.cell(row=i, column=c).fill = INPUT
        choice.add(f"D{i}")
    extra = len(d["pairs"]) + 3
    ws.cell(row=extra, column=1, value="Missing pairs (one per row):").font = Font(bold=True)
    for r in range(extra + 1, extra + 6):
        for c in (2, 3, 5): ws.cell(row=r, column=c).fill = INPUT
    ws2 = wb.create_sheet("Lists"); ws2.add_data_validation(choice)
    header(ws2, ["List", "Ingredients", "Rule", "Reasonable?", "Comment"], [24, 60, 34, 14, 40])
    lists = [("Sun-sensitising", ", ".join(d["photosensitising"]), "Never placed in a morning step"),
             ("Strong exfoliants", ", ".join(d["highIntensityExfoliants"]), "Excluded for barrier concerns and moderate or high reactivity"),
             ("Prescription-only", ", ".join(d["prescriptionOnly"]), "Never suggested")]
    for i, (a, b, c_) in enumerate(lists, start=2):
        for c, v in enumerate([a, b, c_], start=1): ws2.cell(row=i, column=c, value=v).alignment = WRAP
        for c in (4, 5): ws2.cell(row=i, column=c).fill = INPUT
        choice.add(f"D{i}")
    ws3 = wb.create_sheet("Routines")
    ok = DataValidation(type="list", formula1='"Appropriate,Acceptable with changes,Not appropriate"', allow_blank=True)
    safe = DataValidation(type="list", formula1='"Safe,Unsafe,Unsure"', allow_blank=True)
    ws3.add_data_validation(ok); ws3.add_data_validation(safe)
    header(ws3, ["ID", "Profile and weather", "Morning", "Evening", "Appropriate?", "Safe?", "Comment"], [5, 34, 36, 40, 22, 11, 36])
    for i, rt in enumerate(d["routines"], start=2):
        vals = [rt["id"], rt["profile"], "\n".join(rt["morning"]) or "(cleanse only)", "\n".join(rt["evening"]) or "(cleanse only)"]
        for c, v in enumerate(vals, start=1): ws3.cell(row=i, column=c, value=v).alignment = WRAP
        for c in (5, 6, 7): ws3.cell(row=i, column=c).fill = INPUT
        ok.add(f"E{i}"); safe.add(f"F{i}")
    out = REV / "DermaSynth-expert-review.xlsx"
    wb.save(out)
    print(f"review workbook ({len(d['pairs'])} pairs, {len(d['routines'])} routines) -> {out.relative_to(ROOT)}")


def review_collect(path):
    wb = load_workbook(path, data_only=True)
    about = wb["Read me first"]
    who = f"{about['B10'].value or 'Unnamed'} ({about['B11'].value or 'role not given'}), {about['B12'].value or ''}"
    def rows(sheet, n):
        return [r for r in wb[sheet].iter_rows(min_row=2, values_only=True) if r and r[0] not in (None, "")][:n]
    pairs = rows("Pairs", 10); lists = rows("Lists", 3); routines = rows("Routines", 5)
    count = lambda vals: {k: sum(1 for v in vals if str(v or "").strip() == k) for k in set(str(v or "").strip() for v in vals)}
    missing = [r for r in wb["Pairs"].iter_rows(min_row=14, values_only=True) if r and (r[1] or r[2])]
    lines = ["# Expert review of safety rules and sample routines", "", f"Reviewer: {who}. Collected {date.today().isoformat()} from {Path(path).name}.", "",
             f"Incompatible pairs (10): {count([r[3] for r in pairs])}", "",
             f"Rule lists (3): {count([r[3] for r in lists])}", "",
             f"Routines (5), appropriateness: {count([r[4] for r in routines])}; safety: {count([r[5] for r in routines])}", "",
             "| Item | Judgement | Comment |", "| --- | --- | --- |"]
    for r in pairs: lines.append(f"| Pair {r[0]}: {r[1]} + {r[2]} | {r[3] or ''} | {r[4] or ''} |")
    for r in lists: lines.append(f"| List: {r[0]} | {r[3] or ''} | {r[4] or ''} |")
    for r in routines: lines.append(f"| Routine {r[0]} | {r[4] or ''} / {r[5] or ''} | {r[6] or ''} |")
    for r in missing: lines.append(f"| Suggested missing pair: {r[1]} + {r[2]} | | {r[4] or ''} |")
    REPORTS.mkdir(parents=True, exist_ok=True)
    out = REPORTS / "expert-review.latest.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines[:9])); print(f"-> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    simple = {"cue-sheet": cue_sheet, "cue-collect": cue_collect, "cases-sheet": cases_sheet,
              "ablation-sheet": ablation_sheet, "ablation-score": ablation_score, "review-sheet": review_sheet}
    with_path = {"cases-collect": cases_collect, "review-collect": review_collect}
    if cmd in simple: simple[cmd]()
    elif cmd in with_path and len(sys.argv) > 2: with_path[cmd](sys.argv[2])
    else: print(__doc__)
