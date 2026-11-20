"""Diagrams for the project synopsis: system architecture, PoC workflow, project timeline."""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

OUT = Path(__file__).parent / "figures"
OUT.mkdir(exist_ok=True)
INK, INK2, EDGE = "#0b0b0b", "#52514e", "#8a8983"
FILL = {"app": "#eef3fb", "core": "#cde2fb", "engine": "#ffe3d6", "data": "#d7f2e7", "out": "#f3efe0"}


def box(ax, x, y, w, h, text, kind, fs=9, bold=False):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.08",
                                fc=FILL[kind], ec=EDGE, lw=1))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fs, color=INK,
            fontweight="bold" if bold else "normal", wrap=True)
    return (x, y, w, h)


def arrow(ax, p, q, text=None, dashed=False, off=(0, 0.12)):
    ax.add_patch(FancyArrowPatch(p, q, arrowstyle="-|>", mutation_scale=11, color=INK2, lw=1.1,
                                 linestyle="--" if dashed else "-", shrinkA=2, shrinkB=2))
    if text:
        ax.text((p[0] + q[0]) / 2 + off[0], (p[1] + q[1]) / 2 + off[1], text, ha="center", fontsize=7.5, color=INK2)


def path(ax, pts, text=None, tpos=None, dashed=False):
    ls = "--" if dashed else "-"
    for a, b in zip(pts[:-2], pts[1:-1]):
        ax.plot([a[0], b[0]], [a[1], b[1]], color=INK2, lw=1.1, ls=ls)
    arrow(ax, pts[-2], pts[-1], dashed=dashed)
    if text:
        ax.text(*tpos, text, ha="left", fontsize=7.5, color=INK2)


def architecture():
    fig, ax = plt.subplots(figsize=(11, 6.2))
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 6.1)
    ax.axis("off")
    box(ax, 0.2, 5.1, 2.2, 0.9, "Tenant applications\nchat · documents · agents", "app")
    box(ax, 3.0, 5.1, 2.6, 0.9, "Gateway\nidentifies tenant · applies limits", "core", bold=True)
    box(ax, 6.3, 5.1, 2.3, 0.9, "Admission control\nfair order of requests", "core", bold=True)
    box(ax, 6.3, 3.3, 2.3, 1.1, "vLLM engine\nbatching · KV cache\nprefix cache\n(separate per tenant)", "engine")
    box(ax, 9.1, 3.3, 1.7, 1.1, "GPU monitoring\n(NVML)\npower · memory", "engine")
    box(ax, 3.0, 3.3, 2.6, 1.1, "Engine adapter\nwhich requests ran together\nstep times · cache events", "core", bold=True)
    box(ax, 3.0, 1.6, 2.6, 1.0, "Event collector\nstores events\n(no prompt text)", "data")
    box(ax, 6.3, 1.6, 2.3, 1.0, "Cost ledger\nGPU time · memory ·\nslowdown per tenant", "core", bold=True)
    box(ax, 9.1, 0.2, 1.7, 0.9, "Server cost &\nbilling rules", "data")
    box(ax, 0.2, 1.6, 2.2, 1.0, "Replay & calibration\nfair reference cost\n(Shapley value)", "data")
    box(ax, 3.0, 0.2, 2.6, 0.9, "Tenant cost reports", "out")
    box(ax, 6.3, 0.2, 2.3, 0.9, "Dashboard\ncapacity planning", "out")
    arrow(ax, (2.4, 5.55), (3.0, 5.55), "requests")
    arrow(ax, (5.6, 5.55), (6.3, 5.55))
    arrow(ax, (7.45, 5.1), (7.45, 4.4), "dispatch", off=(0.45, 0))
    arrow(ax, (6.3, 3.85), (5.6, 3.85), "records", off=(0, 0.1))
    arrow(ax, (4.3, 3.3), (4.3, 2.6), "events", off=(0.4, 0))
    path(ax, [(9.95, 3.3), (9.95, 2.1), (8.6, 2.1)], "GPU readings", (9.0, 2.2))
    arrow(ax, (5.6, 2.1), (6.3, 2.1))
    arrow(ax, (9.1, 0.8), (8.6, 1.7))
    arrow(ax, (7.45, 1.6), (7.45, 1.1))
    arrow(ax, (6.3, 1.85), (5.6, 0.75))
    arrow(ax, (3.0, 2.1), (2.4, 2.1), "events", off=(0, 0.1))
    path(ax, [(8.3, 2.6), (8.3, 2.9), (8.85, 2.9), (8.85, 5.55), (8.6, 5.55)],
         "usage per tenant\n(for scheduling)", (8.95, 4.6), dashed=True)
    fig.tight_layout()
    fig.savefig(OUT / "architecture.png", dpi=170)
    plt.close(fig)


def poc_workflow():
    fig, ax = plt.subplots(figsize=(11, 2.1))
    ax.set_xlim(0, 11)
    ax.set_ylim(0.45, 2.15)
    ax.axis("off")
    steps = [
        ("Create workloads\n3 tenants, same\nnumber of tokens", "data"),
        ("Run every\ncombination of\ntenants (7 runs)", "engine"),
        ("Measure GPU time\nand energy\nof each run", "engine"),
        ("Compute fair\nshare per tenant\n(Shapley value)", "core"),
        ("Compare with\ntoken-based\nbilling methods", "core"),
        ("Measure how\ntenants slow\neach other down", "out"),
    ]
    w, gap = 1.6, 0.22
    for i, (t, k) in enumerate(steps):
        x = 0.15 + i * (w + gap)
        box(ax, x, 0.55, w, 1.5, t, k, fs=8.5)
        if i:
            arrow(ax, (x - gap, 1.3), (x, 1.3))
    fig.tight_layout()
    fig.savefig(OUT / "poc_workflow.png", dpi=170)
    plt.close(fig)


def timeline():
    tasks = [
        ("Literature review & critical analysis", 0, 3, "done"),
        ("Laptop proof-of-concept (96 runs)", 2, 4, "done"),
        ("Cluster onboarding, pin vLLM, telemetry adapter", 4, 6, "plan"),
        ("Event schema, resource ledger, reconciliation", 5, 8, "plan"),
        ("Calibrated estimator + counterfactual replay (8B)", 7, 11, "plan"),
        ("Scale-up: 30–35B, 70B, tensor parallel", 10, 14, "plan"),
        ("Interference & eviction cost model", 11, 15, "plan"),
        ("Admission control (shadow mode) vs VTC / DLPM", 14, 18, "plan"),
        ("Reports / dashboard prototype", 16, 19, "plan"),
        ("Evaluation, thesis & paper writing", 18, 22, "plan"),
    ]
    fig, ax = plt.subplots(figsize=(11, 4.2))
    for i, (name, s, e, st) in enumerate(tasks):
        y = len(tasks) - 1 - i
        ax.barh(y, e - s, left=s, height=0.55, color="#2a78d6" if st == "done" else "#9ec5f4",
                edgecolor="white", linewidth=1.5)
    ax.set_yticks(range(len(tasks)), [t[0] for t in tasks][::-1], fontsize=8.5)
    ax.tick_params(axis="y", length=0)
    ax.set_xlim(-0.3, 22.5)
    ax.set_xticks(range(0, 23, 2), [f"W{w}" for w in range(0, 23, 2)], fontsize=8)
    ax.grid(axis="x", color="#e4e3df", lw=0.6)
    ax.set_axisbelow(True)
    for s_ in ("top", "right", "left"):
        ax.spines[s_].set_visible(False)
    ax.axvline(4, color=INK2, lw=1, ls="--")
    ax.text(4.1, len(tasks) - 0.4, "cluster access\nexpected", fontsize=7.5, color=INK2, va="top")
    from matplotlib.patches import Patch
    ax.legend(handles=[Patch(color="#2a78d6", label="completed"), Patch(color="#9ec5f4", label="planned")],
              frameon=False, fontsize=8, loc="upper right")
    ax.set_xlabel("weeks from project start", fontsize=8.5, color=INK2)
    fig.tight_layout()
    fig.savefig(OUT / "timeline.png", dpi=170)
    plt.close(fig)


if __name__ == "__main__":
    architecture()
    poc_workflow()
    timeline()
    print("ok")
