"""Figures for the final project report (build_report.js).

  figures/report/r_*.png   result charts from poc/compare_models.py, re-rendered for print: white background, no in-image
                           titles (the report's captions replace them)
  figures/report/calibration.png   error of five ways to calibrate a token price (poc/calibration_check.py)
  figures/report/{wbs,gantt,pipeline,replay_flow}.png   project-plan and design diagrams

Run from report/:  uv run --no-project --with numpy --with scipy --with matplotlib python make_report_figures.py
"""

import os
import statistics as st
import sys
from datetime import date
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.figure import Figure
from matplotlib.lines import Line2D
from matplotlib.patches import FancyBboxPatch, Polygon

HERE = Path(__file__).resolve().parent
OUT = HERE / "figures" / "report"
OUT.mkdir(parents=True, exist_ok=True)
POC = HERE.parent / "poc"

sys.path.insert(0, str(HERE))
import make_diagrams as M  # noqa: E402  box / arrow / path helpers and fills shared with the synopsis diagrams

INK, INK2, EDGE = M.INK, M.INK2, M.EDGE
WHITE = "#ffffff"


# ---------- result charts ----------
def result_charts():
    os.chdir(POC)
    sys.path.insert(0, str(POC))
    import compare_models as CM

    plt.rcParams.update({"figure.facecolor": WHITE, "axes.facecolor": WHITE, "savefig.facecolor": WHITE})
    Figure.suptitle = lambda self, *a, **k: None  # captions in the report replace the titles
    orig_save = Figure.savefig

    def save(self, fname, *a, **k):
        k.setdefault("bbox_inches", "tight")
        k.setdefault("pad_inches", 0.06)
        k["dpi"] = 200
        return orig_save(self, OUT / ("r_" + Path(fname).name), *a, **k)

    Figure.savefig = save
    CM.OUT = OUT
    devnull = open(os.devnull, "w")
    stdout, sys.stdout = sys.stdout, devnull
    try:
        CM.main()
    finally:
        sys.stdout = stdout
        Figure.savefig = orig_save
    return CM


def calibration_chart(CM):
    import calibration_check as CC

    rows = [(("3-rate", "solo"), "Each tenant alone\n(benchmark calibration)"),
            (("3-rate", "pairs"), "Pairs of tenants"),
            (("3-rate", "all"), "All tenant combinations"),
            (("4-rate", "solo"), "Each tenant alone,\nplus a memory-time price"),
            (("3-rate", "ceiling"), "Measured Shapley values\n(from the other seeds)")]
    cells = {k: {} for k, _ in rows}
    for s, (_, path) in zip(CM.SETUPS, CC.SETUPS):
        _, by = CC.A.load(path)
        out = CC.evaluate(by, "busy_s")
        for k, _ in rows:
            cells[k][s["key"]] = [st.mean(out[(lv, *k)]) for lv in CC.LEVELS]

    fig, ax = plt.subplots(figsize=(9.6, 4.0))
    offs = {"laptop": -0.2, "7b": 0.0, "14b": 0.2}
    for i, (k, _) in enumerate(rows):
        y = len(rows) - 1 - i
        allv = []
        for s in CM.SETUPS:
            v = cells[k][s["key"]]
            allv += v
            ax.plot(v, [y + offs[s["key"]]] * 3, ls="", **s["style"], zorder=3)
        m = st.mean(allv)
        ax.plot([m, m], [y - 0.34, y + 0.34], color=INK, lw=2, zorder=4, solid_capstyle="butt")
        ax.annotate(f"mean {m:.3f}   worst {max(allv):.2f}", xy=(max(allv), y), xytext=(12, 0),
                    textcoords="offset points", va="center", fontsize=8.5, color=INK2)
    ax.axvline(0.1, color=CM.AXIS, lw=1.3, zorder=1)
    ax.text(0.102, len(rows) - 0.45, "0.1 = project target", fontsize=8, color=INK2, va="bottom")
    ax.set_yticks(range(len(rows)), [lab for _, lab in rows][::-1])
    ax.tick_params(axis="y", length=0)
    ax.spines["left"].set_visible(False)
    ax.set_xlim(0, 0.46)
    ax.set_ylim(-0.6, len(rows) - 0.3)
    ax.set_xlabel("error vs Shapley (normalised L1, busy time); one mark per setup and memory level", fontsize=9)
    ax.grid(axis="x", color=CM.GRID, lw=0.8)
    ax.set_axisbelow(True)
    h = [Line2D([], [], ls="", label=s["label"], **s["style"]) for s in CM.SETUPS]
    h.append(Line2D([], [], color=INK, lw=2, label="mean of the 9 cells"))
    fig.legend(handles=h, loc="upper left", bbox_to_anchor=(0.0, 1.0), ncol=4, frameon=False, fontsize=8.5,
               handletextpad=0.4, columnspacing=1.3)
    fig.tight_layout(rect=(0, 0, 1, 0.92))
    fig.savefig(OUT / "calibration.png", dpi=200, bbox_inches="tight", pad_inches=0.06)
    plt.close(fig)


# ---------- diagrams ----------
def canvas(w, h):
    fig, ax = plt.subplots(figsize=(w, h))
    ax.set_xlim(0, w)
    ax.set_ylim(0, h)
    ax.axis("off")
    return fig, ax


def save(fig, name):
    fig.savefig(OUT / name, dpi=200, bbox_inches="tight", pad_inches=0.05, facecolor=WHITE)
    plt.close(fig)


def diamond(ax, cx, cy, w, h, text, fs=8):
    ax.add_patch(Polygon([(cx - w / 2, cy), (cx, cy + h / 2), (cx + w / 2, cy), (cx, cy - h / 2)],
                         closed=True, fc="#fff6d6", ec=EDGE, lw=1))
    ax.text(cx, cy, text, ha="center", va="center", fontsize=fs, color=INK)


def label(ax, x, y, text, ha="left"):
    ax.text(x, y, text, ha=ha, va="center", fontsize=7.5, color=INK2)


def wbs():
    fig, ax = canvas(11, 5.6)
    M.box(ax, 3.0, 4.85, 5.0, 0.6, "FairShareAI: Major Project (this semester)", "core", fs=10, bold=True)
    ax.set_ylim(0.55, 5.6)
    groups = [
        ("1. Research", ["1.1 Literature survey", "1.2 Critical analysis\nof the proposal", "1.3 Research questions\nand metrics"]),
        ("2. Measurement\nharness", ["2.1 Workload generator", "2.2 Coalition replay\non vLLM", "2.3 GPU metering\n(NVML)", "2.4 Contamination\nguard"]),
        ("3. Experiments", ["3.1 Laptop PoC (0.5B)", "3.2 Cluster setup (RU)", "3.3 Qwen2.5-7B runs", "3.4 Qwen2.5-14B runs"]),
        ("4. Analysis", ["4.1 Shapley and billing\nmethods", "4.2 Cross-model\ncomparison", "4.3 Calibration check", "4.4 Figures and tables"]),
        ("5. Documentation", ["5.1 Synopsis", "5.2 Results summary", "5.3 Final report\nand viva"]),
    ]
    w, gap = 1.95, 0.2
    ax.plot([1.175, 1.175 + 4 * (w + gap)], [4.45, 4.45], color=INK2, lw=1.1)
    ax.plot([5.5, 5.5], [4.85, 4.45], color=INK2, lw=1.1)
    for g, (head, items) in enumerate(groups):
        x = 0.2 + g * (w + gap)
        ax.plot([x + w / 2, x + w / 2], [4.45, 4.2], color=INK2, lw=1.1)
        M.box(ax, x, 3.6, w, 0.6, head, "engine", fs=9, bold=True)
        ax.plot([x + 0.15, x + 0.15], [3.6, 3.2 - 0.75 * (len(items) - 1) - 0.0], color=INK2, lw=1)
        for j, it in enumerate(items):
            y = 2.9 - 0.75 * j
            ax.plot([x + 0.15, x + 0.3], [y + 0.3, y + 0.3], color=INK2, lw=1)
            M.box(ax, x + 0.3, y, w - 0.3, 0.6, it, "data", fs=7.6)
    save(fig, "wbs.png")


def gantt():
    tasks = [
        ("Topic selection and study of the proposal", date(2026, 8, 3), date(2026, 8, 21)),
        ("Literature survey and critical analysis", date(2026, 8, 17), date(2026, 9, 24)),
        ("Laptop proof-of-concept (96 replays)", date(2026, 9, 7), date(2026, 9, 24)),
        ("Synopsis and mid-semester review", date(2026, 9, 21), date(2026, 10, 9)),
        ("Cluster access, VPN and software setup", date(2026, 10, 12), date(2026, 11, 14)),
        ("Contamination guard and PBS job scripts", date(2026, 11, 13), date(2026, 11, 18)),
        ("Qwen2.5-7B replays on the A100 (96)", date(2026, 11, 14), date(2026, 11, 16)),
        ("Qwen2.5-14B replays on the A100 (96)", date(2026, 11, 16), date(2026, 11, 19)),
        ("Cross-model analysis and calibration check", date(2026, 11, 15), date(2026, 11, 20)),
        ("Final report and viva preparation", date(2026, 11, 18), date(2026, 12, 4)),
    ]
    t0 = date(2026, 8, 1)
    d = lambda x: (x - t0).days
    fig, ax = plt.subplots(figsize=(10, 3.9))
    for i, (name, s, e) in enumerate(tasks):
        y = len(tasks) - 1 - i
        ax.barh(y, max(d(e) - d(s), 1.5), left=d(s), height=0.56, color="#2a78d6", edgecolor=WHITE, lw=1.5)
    ax.set_yticks(range(len(tasks)), [t[0] for t in tasks][::-1], fontsize=8.5)
    ax.tick_params(axis="y", length=0)
    months = [date(2026, m, 1) for m in (8, 9, 10, 11, 12)]
    ax.set_xticks([d(m) for m in months], [m.strftime("%b %Y") for m in months], fontsize=8.5)
    ax.set_xlim(-2, d(date(2026, 12, 8)))
    ax.grid(axis="x", color="#e1e0d9", lw=0.8)
    ax.set_axisbelow(True)
    for s_ in ("top", "right", "left"):
        ax.spines[s_].set_visible(False)
    ax.spines["bottom"].set_color("#c3c2b7")
    fig.tight_layout()
    save(fig, "gantt.png")


def pipeline():
    fig, ax = canvas(11.2, 7.0)
    X = [0.1, 3.1, 6.3, 9.3]  # column left edges
    W = [2.3, 2.5, 2.3, 1.8]
    cx = [x + w / 2 for x, w in zip(X, W)]
    R = [X[i] + W[i] for i in range(4)]  # right edges
    # row A: cluster job control
    M.box(ax, X[0], 5.9, W[0], 0.9, "PBS job (run.pbs)\nqueue gpu,\noffline model cache", "core", fs=8.5)
    M.box(ax, X[1], 5.9, W[1], 0.9, "Completion check\n(--check-done)\nskip finished replays", "core", fs=8.5)
    M.box(ax, X[2], 5.9, W[2], 0.9, "GPU picker (pick_gpu.py)\nidle GPU with\nenough free memory", "core", fs=8.5)
    M.arrow(ax, (R[0], 6.35), (X[1], 6.35))
    M.arrow(ax, (R[1], 6.35), (X[2], 6.35))
    # row B: measurement
    M.box(ax, X[0], 3.85, W[0], 1.15, "Workload generator\n(workload.py)\n3 tenants, seeded,\nequal token volume", "data", fs=8.5)
    M.box(ax, X[1], 3.85, W[1], 1.15, "Replay driver\n(run_experiments.py)\n7 combinations x 4 seeds\nx 3 memory levels", "core", fs=8.5, bold=True)
    M.box(ax, X[2], 3.85, W[2], 1.15, "vLLM 0.30 engine\nQwen2.5 model\nprefix caching,\nfixed KV capacity", "engine", fs=8.5)
    M.box(ax, X[3], 3.85, W[3], 1.15, "GPU\nNVML readings:\npower, energy,\nper-process use", "engine", fs=8.2)
    M.arrow(ax, (R[0], 4.42), (X[1], 4.42), "requests", off=(0, 0.1))
    M.arrow(ax, (R[1], 4.65), (X[2], 4.65), "add, step", off=(0, 0.1))
    M.arrow(ax, (X[2], 4.15), (R[1], 4.15), "timings", off=(0, -0.24))
    M.arrow(ax, (R[2], 4.42), (X[3], 4.42))
    M.arrow(ax, (cx[1], 5.9), (cx[1], 5.0), "runs still to do", off=(0.62, 0))
    M.arrow(ax, (cx[2], 5.9), (cx[2], 5.0), "GPU index", off=(0.45, 0))
    # row C: guard and data
    M.box(ax, X[2], 2.05, W[2], 1.0, "Contamination guard\nquiet before, monitor\nduring, check after", "core", fs=8.5)
    M.box(ax, X[1], 2.05, W[1], 1.0, "runs.jsonl\none row per replay\n(no prompt text)", "data", fs=8.5, bold=True)
    M.path(ax, [(cx[3], 3.85), (cx[3], 2.55), (R[2], 2.55)], "utilisation", (R[2] + 0.12, 2.68))
    M.arrow(ax, (X[2], 2.55), (R[1], 2.55), "clean or\nflagged", off=(0, 0.1))
    M.arrow(ax, (cx[1], 3.85), (cx[1], 3.05), "costs, timings", off=(0.7, 0))
    # row D: analysis and outputs
    M.box(ax, X[0], 0.2, W[0], 1.05, "calibration_check.py\nfive ways to fit\na token price", "core", fs=8.5)
    M.box(ax, X[1], 0.2, W[1], 1.05, "analyze.py\nShapley value, 7 billing\nmethods, error (nL1)", "core", fs=8.5, bold=True)
    M.box(ax, X[2], 0.2, W[2], 1.05, "compare_models.py\nlaptop vs 7B vs 14B", "core", fs=8.5)
    M.box(ax, X[3], 0.2, W[3], 1.05, "Summaries,\nfigures, tables", "out", fs=8.5)
    M.arrow(ax, (cx[1], 2.05), (cx[1], 1.25))
    M.arrow(ax, (X[1], 0.72), (R[0], 0.72))
    M.arrow(ax, (R[1], 0.72), (X[2], 0.72))
    M.arrow(ax, (R[2], 0.72), (X[3], 0.72))
    # legend
    for j, (k, t) in enumerate([("core", "our code"), ("engine", "engine and GPU"), ("data", "data"), ("out", "outputs")]):
        y = 6.62 - j * 0.24
        ax.add_patch(FancyBboxPatch((X[3] + 0.05, y - 0.07), 0.22, 0.14, boxstyle="round,pad=0.01", fc=M.FILL[k], ec=EDGE, lw=0.8))
        ax.text(X[3] + 0.35, y, t, va="center", fontsize=8, color=INK2)
    save(fig, "pipeline.png")


def replay_flow():
    fig, ax = canvas(11.6, 8.3)
    c1, c2, bw = 2.3, 7.6, 3.4
    B = lambda cx, cy, t, k="core", h=0.62: M.box(ax, cx - bw / 2, cy - h / 2, bw, h, t, k, fs=8.3)
    # column 1: job start
    B(c1, 7.8, "PBS job starts for one memory level", "data")
    diamond(ax, c1, 6.75, 2.9, 1.0, "every replay of this level\nalready measured?")
    B(c1, 5.6, "Pick an idle GPU with enough free\nmemory (wait up to PICK_WAIT)")
    diamond(ax, c1, 4.45, 2.9, 0.95, "GPU found\nin time?")
    B(c1, 3.3, "Start the vLLM engine on that GPU with\nthis level's fixed KV-cache capacity", "engine")
    M.arrow(ax, (c1, 7.49), (c1, 7.25))
    M.arrow(ax, (c1, 6.25), (c1, 5.91)); label(ax, c1 + 0.1, 6.08, "no")
    M.arrow(ax, (c1, 5.29), (c1, 4.92))
    M.arrow(ax, (c1, 3.97), (c1, 3.61)); label(ax, c1 + 0.1, 3.79, "yes")
    M.box(ax, 4.45, 6.5, 1.1, 0.5, "exit 0", "out", fs=8.3)
    M.arrow(ax, (c1 + 1.45, 6.75), (4.45, 6.75)); label(ax, 4.0, 6.88, "yes")
    M.box(ax, 4.45, 4.2, 1.1, 0.5, "exit 2", "out", fs=8.3)
    M.arrow(ax, (c1 + 1.45, 4.45), (4.45, 4.45)); label(ax, 4.0, 4.58, "no")
    M.path(ax, [(c1, 2.99), (c1, 2.4), (5.45, 2.4), (5.45, 7.8), (c2 - bw / 2, 7.8)])
    # column 2: guarded replay loop
    B(c2, 7.8, "Next tenant combination still to measure")
    B(c2, 6.85, "Wait until the GPU is quiet: mean utilisation\nat most QUIET_UTIL over 3 seconds")
    B(c2, 5.9, "Replay the combination; sample other\nprocesses' GPU use every 0.5 seconds", "engine")
    B(c2, 4.95, "Re-check GPU utilisation for 2 seconds")
    diamond(ax, c2, 3.9, 2.9, 0.95, "any check\nfailed?")
    B(c2, 2.75, "Write a clean row to runs.jsonl", "data")
    diamond(ax, c2, 1.7, 2.9, 0.95, "combinations\nleft?")
    M.box(ax, c2 - 0.55, 0.25, 1.1, 0.5, "exit 0", "out", fs=8.3)
    for a, b in [(7.49, 7.16), (6.54, 6.21), (5.59, 5.26), (4.64, 4.37)]:
        M.arrow(ax, (c2, a), (c2, b))
    M.arrow(ax, (c2, 3.42), (c2, 3.06)); label(ax, c2 + 0.1, 3.24, "no")
    M.arrow(ax, (c2, 2.44), (c2, 2.17))
    M.arrow(ax, (c2, 1.22), (c2, 0.75)); label(ax, c2 + 0.1, 0.98, "no")
    M.path(ax, [(c2 - 1.45, 1.7), (5.7, 1.7), (5.7, 7.62), (c2 - bw / 2, 7.62)]); label(ax, 5.8, 1.85, "yes")
    # failure branch
    M.box(ax, 9.75, 3.55, 1.35, 0.7, "flag the row,\nretry", "core", fs=8)
    M.arrow(ax, (c2 + 1.45, 3.9), (9.75, 3.9)); label(ax, 9.2, 4.03, "yes")
    diamond(ax, 10.42, 2.45, 1.45, 0.95, "8 flags\nin a row?", fs=7.5)
    M.arrow(ax, (10.42, 3.55), (10.42, 2.93))
    M.box(ax, 9.87, 0.95, 1.1, 0.5, "exit 3", "out", fs=8.3)
    M.arrow(ax, (10.42, 1.97), (10.42, 1.45)); label(ax, 10.5, 1.7, "yes")
    M.path(ax, [(11.15, 2.45), (11.45, 2.45), (11.45, 6.85), (c2 + bw / 2, 6.85)]); label(ax, 11.2, 2.62, "no")
    save(fig, "replay_flow.png")


if __name__ == "__main__":
    wbs()
    gantt()
    pipeline()
    replay_flow()
    CM = result_charts()
    calibration_chart(CM)
    print("figures written to", OUT)
