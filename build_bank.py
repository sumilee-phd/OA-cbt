"""사무자동화산업기사 필기 CBT 문제은행 생성 스크립트.

책 원고(20_원고)의 md에서 문항·보기·정답·해설·절 번호를 뽑아
data/bank.json(정본)과 data/bank.js(file:// 실행용 래퍼)를 만든다.
원고 파일은 읽기만 한다.

검사 항목(하나라도 어긋나면 파일을 쓰지 않고 종료 코드 1):
  - 회차 60문항(과목당 20), 장별 20문항, 문항 번호 연속, 보기 4개
  - 문제지 정답표(모의 정답표·빠른 정답 띠)와 해설의 「정답 ①~④」 일치
  - 해설 문항 수와 번호가 문제와 일치
  - 모의 문항의 근거 절(예: 2.1절)이 속한 장의 과목과 문항 과목 일치

사용법:
  python build_bank.py            # 생성 + 검사
  python build_bank.py --check    # 검사만(파일 쓰지 않음), 기존 bank.json과 비교
  python build_bank.py --src <20_원고 경로>   # 원고 폴더 위치가 다를 때
종료 코드: 0 정상(--check는 기존 파일과 동일), 1 검사 오류, 2 기존 파일과 다름(--check)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE.parents[1] / "20_원고"
OUT_DIR = HERE / "data"

CIRCLED = "①②③④"
SUBJECTS = [
    {"id": 1, "name": "사무자동화시스템"},
    {"id": 2, "name": "프로그래밍 일반"},
    {"id": 3, "name": "네트워크 일반"},
]
# 장 → 과목 (1장 시험 안내 기준. 모의 문항 근거 절로 교차 검사한다)
CHAPTER_SUBJECT = {2: 1, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 3}
MOCK_FILES = {1: "p05_모의1회.md", 2: "p05_모의2회.md", 3: "p05_모의3회.md"}
CHAPTERS = [2, 3, 4, 5, 6, 7, 8]

RE_QHEAD = re.compile(r"^\*\*(\d{2})\*\*\s+(.*)$")
RE_CHOICE = re.compile(r"^([①②③④])\s*(.*)$")
RE_EXPHEAD = re.compile(r"^\*\*(\d{2})\*\*\s+정답\s+([①②③④])\s*(?:\[([^\]]+)\])?\s*$")
RE_MARK = re.compile(r"^\[\[[^\]]*\]\]\s*$")
RE_ANS_CELL = re.compile(r"(\d{2})\s*([①②③④])")
RE_SECTION = re.compile(r"(\d+)\.(\d+)절")

errors: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def read_lines(name: str) -> list[str]:
    text = (SRC / name).read_text(encoding="utf-8")
    return text.replace("\r\n", "\n").replace("\r", "\n").split("\n")


# ---------------------------------------------------------------- 블록 변환
def to_blocks(lines: list[str], where: str) -> list[dict]:
    """문단·코드·표를 블록 목록으로 바꾼다. 화면에서 그대로 그린다."""
    blocks: list[dict] = []
    para: list[str] = []
    i = 0

    def flush() -> None:
        if para:
            blocks.append({"t": "p", "text": " ".join(s.strip() for s in para)})
            para.clear()

    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            flush()
            j = i + 1
            code: list[str] = []
            while j < len(lines) and not lines[j].startswith("```"):
                code.append(lines[j])
                j += 1
            if j >= len(lines):
                err(f"{where}: 코드 블록이 닫히지 않음")
            blocks.append({"t": "code", "text": "\n".join(code)})
            i = j + 1
            continue
        if line.startswith("|"):
            flush()
            rows: list[list[str]] = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            blocks.append({"t": "table", "head": rows[0], "rows": rows[1:]})
            continue
        if not line.strip() or RE_MARK.match(line):
            flush()
            i += 1
            continue
        para.append(line)
        i += 1
    flush()
    return blocks


# ---------------------------------------------------------------- 문항 파싱
def parse_questions(lines: list[str], where: str, subject_by_heading: bool) -> list[dict]:
    """`**01** 발문` ~ `④ 보기` 단위로 문항을 나눈다."""
    qs: list[dict] = []
    subject = None
    cur: dict | None = None
    in_code = False

    def close(q: dict | None) -> None:
        if q is None:
            return
        tag = f"{where} {q['number']:02d}번"
        if len(q["choices"]) != 4:
            err(f"{tag}: 보기 {len(q['choices'])}개")
        extra = [s for s in q["_after"] if s.strip() and not RE_MARK.match(s)]
        if extra:
            err(f"{tag}: 보기 뒤 처리하지 못한 줄 {extra[:2]}")
        q["stem"] = to_blocks(q.pop("_stem"), tag)
        q.pop("_after")
        if not q["stem"]:
            err(f"{tag}: 발문 없음")
        qs.append(q)

    for line in lines:
        if line.startswith("```"):
            in_code = not in_code
        if not in_code:
            if subject_by_heading:
                m = re.match(r"^##\s+(\d)과목\s", line)
                if m:
                    close(cur)
                    cur = None
                    subject = int(m.group(1))
                    continue
            m = RE_QHEAD.match(line)
            if m:
                close(cur)
                cur = {
                    "number": int(m.group(1)),
                    "subject": subject,
                    "_stem": [m.group(2)],
                    "choices": [],
                    "_after": [],
                }
                continue
            if line.startswith("| ") and ("빠른 정답" in line or re.match(r"^\|\s*\d과목", line)):
                close(cur)
                cur = None
                break
        if cur is None:
            continue
        m = RE_CHOICE.match(line) if not in_code else None
        if m:
            idx = CIRCLED.index(m.group(1))
            if idx != len(cur["choices"]):
                err(f"{where} {cur['number']:02d}번: 보기 순서 어긋남({m.group(1)})")
            cur["choices"].append(m.group(2).strip())
        elif cur["choices"]:
            cur["_after"].append(line)
        else:
            cur["_stem"].append(line)
    close(cur)
    return qs


def parse_answer_table(lines: list[str]) -> dict[int, int]:
    """정답표(| 1과목 | 01 ④ | …, | 빠른 정답 | 01 ④ | …)를 {번호: 정답} 으로."""
    ans: dict[int, int] = {}
    started = False
    for line in lines:
        if line.startswith("| ") and ("빠른 정답" in line or re.match(r"^\|\s*\d과목", line)):
            started = True
        if started and line.startswith("|"):
            for num, mark in RE_ANS_CELL.findall(line):
                n = int(num)
                if n in ans:
                    err(f"정답표 {n:02d}번 중복")
                ans[n] = CIRCLED.index(mark) + 1
    return ans


def parse_explanations(lines: list[str], where: str) -> list[dict]:
    """`**01** 정답 ④ [2.1절 표 2-1]` + 해설 문단."""
    out: list[dict] = []
    cur: dict | None = None
    for line in lines:
        m = RE_EXPHEAD.match(line)
        if m:
            if cur:
                out.append(cur)
            cur = {
                "number": int(m.group(1)),
                "answer": CIRCLED.index(m.group(2)) + 1,
                "ref": (m.group(3) or "").strip(),
                "_body": [],
            }
            continue
        if RE_QHEAD.match(line):
            err(f"{where}: 해설 머리 형식이 다른 줄 {line[:40]!r}")
        if cur is not None:
            cur["_body"].append(line)
    if cur:
        out.append(cur)
    for e in out:
        e["explanation"] = to_blocks(e.pop("_body"), f"{where} {e['number']:02d}번 해설")
        if not e["explanation"]:
            err(f"{where} {e['number']:02d}번: 해설 본문 없음")
        if not e["ref"]:
            err(f"{where} {e['number']:02d}번: 근거 절 표기 없음")
    return out


def split_by_h2(lines: list[str]) -> list[tuple[str, list[str]]]:
    parts: list[tuple[str, list[str]]] = []
    for line in lines:
        if line.startswith("## "):
            parts.append((line[3:].strip(), []))
        elif parts:
            parts[-1][1].append(line)
    return parts


def section_of(ref: str) -> str | None:
    m = RE_SECTION.search(ref)
    return f"{m.group(1)}.{m.group(2)}" if m else None


def check_numbers(qs: list[dict], expected: int, where: str) -> None:
    nums = [q["number"] for q in qs]
    if nums != list(range(1, expected + 1)):
        err(f"{where}: 문항 번호 {len(nums)}개, 1~{expected} 연속 아님")


# ---------------------------------------------------------------- 조립
def build() -> dict:
    questions: list[dict] = []
    exams: list[dict] = []
    chapters: list[dict] = []
    stats = {"compared": 0, "mismatch": 0}

    def merge(q: dict, exp: dict | None, table: dict[int, int], where: str) -> dict:
        tag = f"{where} {q['number']:02d}번"
        t_ans = table.get(q["number"])
        if t_ans is None:
            err(f"{tag}: 정답표에 없음")
        if exp is None:
            err(f"{tag}: 해설 없음")
            return q
        stats["compared"] += 1
        if t_ans != exp["answer"]:
            stats["mismatch"] += 1
            err(f"{tag}: 정답표 {CIRCLED[t_ans - 1] if t_ans else '?'} ≠ 해설 {CIRCLED[exp['answer'] - 1]}")
        q["answer"] = exp["answer"]
        q["ref"] = exp["ref"]
        q["section"] = section_of(exp["ref"])
        q["explanation"] = exp["explanation"]
        return q

    # 해설 파일
    mock_exp = {}
    for title, body in split_by_h2(read_lines("p06_모의해설.md")):
        m = re.match(r"필기 모의고사 (\d)회", title)
        if m:
            mock_exp[int(m.group(1))] = parse_explanations(body, f"모의해설 {m.group(1)}회")
    ch_exp = {}
    ch_titles = {}
    for title, body in split_by_h2(read_lines("p06_장별해설.md")):
        m = re.match(r"(\d)장\s+(.+)$", title)
        if m:
            ch_exp[int(m.group(1))] = parse_explanations(body, f"장별해설 {m.group(1)}장")
            ch_titles[int(m.group(1))] = m.group(2).strip()

    # 모의고사
    for no, fname in MOCK_FILES.items():
        lines = read_lines(fname)
        where = f"모의 {no}회"
        title = next((l[2:].strip() for l in lines if l.startswith("# ")), f"필기 모의고사 {no}회")
        qs = parse_questions(lines, where, subject_by_heading=True)
        check_numbers(qs, 60, where)
        table = parse_answer_table(lines)
        if sorted(table) != list(range(1, 61)):
            err(f"{where}: 정답표 {len(table)}개")
        exps = {e["number"]: e for e in mock_exp.get(no, [])}
        if sorted(exps) != list(range(1, 61)):
            err(f"{where}: 해설 {len(exps)}개")
        ids = []
        for q in qs:
            exp_subject = (q["number"] - 1) // 20 + 1
            if q["subject"] != exp_subject:
                err(f"{where} {q['number']:02d}번: 과목 {q['subject']} (번호상 {exp_subject})")
            q = merge(q, exps.get(q["number"]), table, where)
            qid = f"m{no}-{q['number']:02d}"
            sec = q.get("section")
            if sec and CHAPTER_SUBJECT.get(int(sec.split(".")[0])) != q["subject"]:
                err(f"{where} {q['number']:02d}번: 근거 {sec}절의 과목이 문항 과목 {q['subject']}과 다름")
            questions.append({"id": qid, "set": f"m{no}", "chapter": int(sec.split(".")[0]) if sec else None, **q})
            ids.append(qid)
        exams.append({"id": f"m{no}", "no": no, "title": title, "minutes": 90, "questionIds": ids})

    # 장별 대표 문제
    for ch in CHAPTERS:
        lines = read_lines(f"ch{ch:02d}.md")
        where = f"{ch}장 대표 문제"
        try:
            start = next(i for i, l in enumerate(lines) if l.strip() == "## 대표 문제")
        except StopIteration:
            err(f"{where}: 「## 대표 문제」 절 없음")
            continue
        end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
        sec_lines = lines[start + 1:end]
        qs = parse_questions(sec_lines, where, subject_by_heading=False)
        check_numbers(qs, 20, where)
        table = parse_answer_table(sec_lines)
        if sorted(table) != list(range(1, 21)):
            err(f"{where}: 빠른 정답 {len(table)}개")
        exps = {e["number"]: e for e in ch_exp.get(ch, [])}
        if sorted(exps) != list(range(1, 21)):
            err(f"{where}: 해설 {len(exps)}개")
        h1 = next((l[2:].strip() for l in lines if l.startswith("# ")), "")
        title = re.sub(r"^\d+장\s+", "", h1) or ch_titles.get(ch, "")
        if ch_titles.get(ch) and ch_titles[ch] != title:
            err(f"{where}: 장 제목 불일치 원고 {title!r} / 해설 {ch_titles[ch]!r}")
        ids = []
        for q in qs:
            q["subject"] = CHAPTER_SUBJECT[ch]
            q = merge(q, exps.get(q["number"]), table, where)
            sec = q.get("section")
            if sec and int(sec.split(".")[0]) != ch:
                err(f"{where} {q['number']:02d}번: 근거 {sec}절이 다른 장")
            qid = f"c{ch}-{q['number']:02d}"
            questions.append({"id": qid, "set": f"c{ch}", "chapter": ch, **q})
            ids.append(qid)
        chapters.append({"id": f"c{ch}", "no": ch, "title": title, "subject": CHAPTER_SUBJECT[ch], "questionIds": ids})

    # 필드 순서 고정
    keys = ["id", "set", "number", "subject", "chapter", "section", "stem", "choices", "answer", "ref", "explanation"]
    questions = [{k: q.get(k) for k in keys} for q in questions]
    for q in questions:
        for c in q["choices"]:
            if not c:
                err(f"{q['id']}: 빈 보기")

    payload = {"subjects": SUBJECTS, "exams": exams, "chapters": chapters, "questions": questions}
    digest = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:12]
    bank = {
        "title": "사무자동화산업기사 필기 CBT",
        "source": "2027 사무자동화산업기사 1권 필기 · 모의고사 3회 + 2~8장 대표 문제",
        "version": digest,
        "passRule": {"perSubjectMin": 8, "totalMin": 36, "perSubject": 20, "pointPerQuestion": 5},
        **payload,
    }
    return bank, stats


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="파일을 쓰지 않고 검사와 기존 파일 비교만 수행")
    ap.add_argument("--src", type=Path, help="원고 폴더(기본: 이 폴더 기준 ../../20_원고)")
    args = ap.parse_args()
    if args.src:
        global SRC
        SRC = args.src.resolve()
    if not SRC.is_dir():
        print(f"원고 폴더 없음: {SRC} — --src로 20_원고 위치를 지정하십시오.")
        return 1

    bank, stats = build()
    n_mock = sum(len(e["questionIds"]) for e in bank["exams"])
    n_ch = sum(len(c["questionIds"]) for c in bank["chapters"])
    print(f"문항 {len(bank['questions'])} (모의 {n_mock} + 대표 {n_ch})")
    print(f"정답 대조 {stats['compared']}건 · 불일치 {stats['mismatch']}건")
    if errors:
        print(f"오류 {len(errors)}건 — 파일을 쓰지 않습니다.")
        for e in errors:
            print("  -", e)
        return 1
    if len(bank["questions"]) != 320:
        print("문항 수가 320이 아닙니다.")
        return 1

    text = json.dumps(bank, ensure_ascii=False, indent=1) + "\n"
    js = "/* build_bank.py 생성 파일 — 직접 수정 금지 (bank.json과 같은 내용) */\nwindow.CBT_BANK = " + json.dumps(bank, ensure_ascii=False, separators=(",", ":")) + ";\n"
    json_path, js_path = OUT_DIR / "bank.json", OUT_DIR / "bank.js"

    if args.check:
        same = json_path.exists() and json_path.read_text(encoding="utf-8") == text
        same_js = js_path.exists() and js_path.read_text(encoding="utf-8") == js
        print(f"기존 bank.json과 {'동일' if same else '다름'} · bank.js {'동일' if same_js else '다름'} · version {bank['version']}")
        return 0 if same and same_js else 2

    OUT_DIR.mkdir(exist_ok=True)
    json_path.write_text(text, encoding="utf-8", newline="\n")
    js_path.write_text(js, encoding="utf-8", newline="\n")
    print(f"저장: {json_path.name} {json_path.stat().st_size:,} B · {js_path.name} {js_path.stat().st_size:,} B · version {bank['version']}")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
