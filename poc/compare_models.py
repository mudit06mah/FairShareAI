"""Final comparison: the laptop PoC (Qwen2.5-0.5B, RTX 3050) and the RU cluster runs (Qwen2.5-7B and -14B on A100s).

Usage: python compare_models.py   (from poc/)
Writes results/final_figures/*.png and prints every number the figures show, so results/final_summary.md can quote
them. Loading, Shapley values and the billing methods come from analyze.py (via compare_7b.py), so the numbers match
analyze.py's summary.md for each model exactly.
"""

import statistics as st
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.lines import Line2D
from matplotlib.patches import Patch

import analyze as A
from compare_7b import (AXIS, GRID, INK, INK2, LEVEL_LABEL, LEVEL_SHORT, LEVELS, METHODS, SURF, TENANT_C, TENANT_NAME,
                        coalition_means, constrained_fit_check, items, lat, load, nl1, share)

OUT = Path("results/final_figures")
# Setups in a fixed order. Colours: the laptop stays muted gray with a hollow marker (context), 7B is categorical
# slot 7 (violet) as in the 7B report, 14B is slot 6 (green); violet/green validated with the dataviz checker
# (CVD dE 28.8, normal 35.5, both >= 3:1 on the surface). Marker shape is the secondary encoding.
SETUPS = [
    dict(key="laptop", path="results/runs.jsonl", label="Laptop: 0.5B on RTX 3050", short="0.5B laptop",
         color="#898781", style=dict(marker="o", mfc=SURF, mec="#898781", mew=1.6, ms=7)),
    dict(key="7b", path="results/qwen2.5-7b-instruct/runs.jsonl", label="A100: Qwen2.5-7B", short="7B A100",
         color="#6250d6", style=dict(marker="o", mfc="#6250d6", mec=SURF, mew=1.0, ms=7.5)),
    dict(key="14b", path="results/qwen2.5-14b-instruct/runs.jsonl", label="A100: Qwen2.5-14B", short="14B A100",
         color="#008300", style=dict(marker="s", mfc="#008300", mec=SURF, mew=1.0, ms=7)),
]
ALL3 = "chat+docs+agent"


def legend(fig, y=0.925):
    h = [Line2D([], [], ls="", label=s["label"], **s["style"]) for s in SETUPS]
    fig.legend(handles=h, loc="upper left", bbox_to_anchor=(0.003, y), ncol=3, frameon=False, fontsize=9,
               handletextpad=0.3, columnspacing=1.4)


def style_ax(ax, grid="x"):
    ax.grid(axis=grid, color=GRID, lw=0.8)
    ax.set_axisbelow(True)


def end_labels(ax, x, ys, texts, min_px=19):
    """Direct labels at the right end of lines, nudged apart vertically so they never overlap."""
    pts = sorted(((ax.transData.transform((x, y))[1], y, t) for y, t in zip(ys, texts)), key=lambda p: p[0])
    placed = []
    for py, _, _ in pts:
        placed.append(max(py, placed[-1] + min_px) if placed else py)
    shift = (sum(p[0] for p in pts) - sum(placed)) / len(placed)  # keep the group centred on the data
    for (py0, y, t), py in zip(pts, placed):
        ax.annotate(t, xy=(x, y), xytext=(8, (py + shift - py0) * 72 / ax.figure.dpi), textcoords="offset points",
                    va="center", ha="left", fontsize=8.5, color=INK2)


def fig_cost_by_model(D):
    """Busy time of each tenant alone and all three together, roomy memory, per setup."""
    rows = [("chat", "chat alone"), ("docs", "docs alone"), ("agent", "agent alone"), (ALL3, "all three together")]
    vals = {(s["key"], k): coalition_means(D[s["key"]], "roomy", k) for s in SETUPS for k, _ in rows}
    fig, axes = plt.subplots(1, 2, figsize=(12.5, 3.4), sharey=True)
    ys = np.arange(len(rows))[::-1].astype(float)
    h = 0.24
    for ax, (f, title, fmt) in zip(axes, [("busy", "GPU busy time (seconds)", "{:.1f} s"),
                                          ("ms", "Milliseconds per engine step", "{:.1f}")]):
        xmax = 0
        for i, s in enumerate(SETUPS):
            for y, (k, _) in zip(ys, rows):
                v = vals[(s["key"], k)]
                x = v["busy"] if f == "busy" else 1e3 * v["busy"] / v["steps"]
                xmax = max(xmax, x)
                yy = y + (1 - i) * h
                ax.barh(yy, x, height=h - 0.03, color=s["color"] if s["key"] != "laptop" else "#c3c2b7")
                ax.text(x + 0.8 if f == "busy" else x + 0.3, yy, fmt.format(x), va="center", ha="left", fontsize=7.5,
                        color=INK2)
        ax.set_xlim(0, xmax * 1.18)
        ax.set_title(title)
        style_ax(ax)
        ax.tick_params(axis="y", length=0)
        ax.spines["left"].set_visible(False)
    axes[0].set_yticks(ys, [lab for _, lab in rows])
    fig.legend(handles=[Patch(color="#c3c2b7" if s["key"] == "laptop" else s["color"], label=s["label"]) for s in SETUPS],
               loc="upper left", bbox_to_anchor=(0.003, 0.9), ncol=3, frameon=False, fontsize=9, handlelength=1.2)
    fig.suptitle("A bigger model makes docs and agent much more expensive, but not chat (roomy memory, mean of 4 seeds)",
                 x=0.01, ha="left", fontsize=11, color=INK, y=0.985)
    fig.tight_layout(rect=(0, 0, 1, 0.84))
    fig.savefig(OUT / "1_cost_by_model.png", dpi=150)
    plt.close(fig)
    return vals


def fig_who_pays(D):
    rows = [("tokens", None, "Plain token count\n(any model)")] + \
           [("shapley", s, f"Fair share (Shapley)\n{s['short']}") for s in SETUPS]
    ypos = [3.35, 2, 1, 0]
    fig, axes = plt.subplots(1, 3, figsize=(12.5, 3.2), sharey=True)
    out = {}
    for ax, level in zip(axes, LEVELS):
        for y, (m, s, _) in zip(ypos, rows):
            d = D[(s or SETUPS[2])["key"]]
            left = 0.0
            for t in A.TENANTS:
                w = 100 * st.mean(share(d, level, m, t))
                out[(level, m if s is None else s["key"], t)] = w
                ax.barh(y, w, left=left, height=0.5, color=TENANT_C[t], edgecolor=SURF, linewidth=2)
                if w >= 8:
                    ax.text(left + 1.5, y, f"{w:.0f}%", va="center", ha="left", fontsize=8.5, color="#ffffff")
                left += w
        ax.set_xlim(0, 100)
        ax.set_xticks([])
        for sp in ("left", "bottom"):
            ax.spines[sp].set_visible(False)
        ax.tick_params(axis="y", length=0)
        ax.set_title(LEVEL_LABEL[level].replace("\n", " "))
    axes[0].set_yticks(ypos, [lab for _, _, lab in rows])
    fig.legend(handles=[Patch(color=TENANT_C[t], label=TENANT_NAME[t]) for t in A.TENANTS], loc="upper left",
               bbox_to_anchor=(0.003, 0.915), ncol=3, frameon=False, fontsize=9, handlelength=1.2)
    fig.suptitle("The fair split depends on the model; token billing gives the same split every time (busy time)",
                 x=0.01, ha="left", fontsize=11, color=INK, y=0.985)
    fig.tight_layout(rect=(0, 0, 1, 0.84))
    fig.savefig(OUT / "2_who_pays.png", dpi=150)
    plt.close(fig)
    return out


def fig_error(D, metric="busy_s", fname="3_error_by_model.png", ref="busy-time"):
    fig, axes = plt.subplots(1, 3, figsize=(12.5, 4.8), sharey=True)
    ys = np.arange(len(METHODS))[::-1].astype(float)
    out = {}
    for ax, level in zip(axes, LEVELS):
        ax.axvline(0.1, color=AXIS, lw=0.9, zorder=1)
        for y, (m, _) in zip(ys, METHODS):
            for s, dy in zip(SETUPS, (0.22, 0, -0.22)):
                v = nl1(D[s["key"]], level, m, metric)
                mu, sd = st.mean(v), st.stdev(v)
                out[(s["key"], level, m)] = (mu, sd)
                ax.hlines(y + dy, max(0, mu - sd), mu + sd, color=s["color"], lw=1.1, zorder=2)
                ax.plot(mu, y + dy, ls="", zorder=3, **s["style"])
        ax.set_xlim(0, 0.8)
        ax.set_ylim(-0.6, len(METHODS) - 0.05)
        style_ax(ax)
        ax.tick_params(axis="y", length=0)
        ax.spines["left"].set_visible(False)
        ax.set_title(LEVEL_LABEL[level].replace("\n", " "))
        ax.set_xlabel("error vs Shapley (normalised L1; 0 = perfect)")
    axes[0].text(0.11, len(METHODS) - 0.2, "0.1 = project's go/no-go target", fontsize=8, color=INK2, va="top")
    axes[0].set_yticks(ys, [lab for _, lab in METHODS])
    legend(fig, 0.93)
    fig.suptitle(f"How wrong is each billing method? ({ref} reference; mark = mean of 4 seeds, line = ±1 SD)",
                 x=0.01, ha="left", fontsize=11, color=INK, y=0.985)
    fig.tight_layout(rect=(0, 0, 1, 0.89))
    fig.savefig(OUT / fname, dpi=150)
    plt.close(fig)
    return out


def fig_memory_pressure(D):
    """(a) extra cost of serving all three as memory shrinks; (b) error of the calibrated price."""
    fig, axes = plt.subplots(1, 2, figsize=(12.5, 3.7))
    xs = np.arange(len(LEVELS))
    out, labs = {}, []
    for s in SETUPS:
        d = D[s["key"]]
        g = [st.mean(a["total"] for a in items(d, l)) for l in LEVELS]
        ext = [100 * (x - g[0]) / g[0] for x in g]
        fit = [st.mean(nl1(d, l, "fit_iso")) for l in LEVELS]
        for l, e, f in zip(LEVELS, ext, fit):
            out[(s["key"], l)] = (e, f)
        kw = dict(color=s["color"], lw=2, zorder=3, solid_capstyle="round", **s["style"])
        axes[0].plot(xs, ext, **kw)
        axes[1].plot(xs, fit, **kw)
        labs.append((ext[-1], f"+{ext[-1]:.0f}%  {s['short']}", fit[-1], f"{fit[-1]:.2f}  {s['short']}"))
    axes[0].set_ylim(-3, 52)
    axes[0].set_yticks([0, 10, 20, 30, 40, 50], ["0%", "+10%", "+20%", "+30%", "+40%", "+50%"])
    axes[0].set_title("Extra GPU busy time to serve all three tenants, compared with roomy memory", fontsize=9.5)
    axes[1].axhline(0.1, color=AXIS, lw=0.9, zorder=1)
    axes[1].text(1.55, 0.097, "0.1 target", fontsize=8, color=INK2, va="top")
    axes[1].set_ylim(0, 0.25)
    axes[1].set_title("Error of a token price calibrated on each tenant running alone", fontsize=9.5)
    for ax in axes:
        ax.set_xticks(xs, [LEVEL_SHORT[l] for l in LEVELS])
        ax.set_xlim(-0.2, len(LEVELS) - 0.35)
        style_ax(ax, "y")
    for i in (0, 1):
        end_labels(axes[i], xs[-1], [l[2 * i] for l in labs], [l[2 * i + 1] for l in labs])
    legend(fig, 0.9)
    fig.suptitle("Memory pressure costs more on bigger models, and benchmarks run alone can't see that cost",
                 x=0.01, ha="left", fontsize=11, color=INK, y=0.985)
    fig.tight_layout(rect=(0, 0, 1, 0.84))
    fig.savefig(OUT / "4_memory_pressure.png", dpi=150)
    plt.close(fig)
    return out


def fig_interference(D):
    fig, axes = plt.subplots(1, 2, figsize=(12.5, 3.7))
    xs = np.arange(len(LEVELS))
    out, labs = {}, []
    for s in SETUPS:
        d = D[s["key"]]
        ttft = [st.mean(lat(d, l, ALL3, "chat_ttft_p95")) for l in LEVELS]
        bill = [st.mean(lat(d, l, ALL3, "agent_api_bill_k")) / st.mean(lat(d, l, "agent", "agent_api_bill_k"))
                for l in LEVELS]
        for l, t, b in zip(LEVELS, ttft, bill):
            out[(s["key"], l)] = (t, b)
        out[(s["key"], "ttft_alone")] = st.mean(st.mean(lat(d, l, "chat", "chat_ttft_p95")) for l in LEVELS)
        kw = dict(color=s["color"], lw=2, zorder=3, solid_capstyle="round", **s["style"])
        axes[0].plot(xs, ttft, **kw)
        axes[1].plot(xs, bill, **kw)
        labs.append((ttft[-1], f"{ttft[-1]:.1f} s  {s['short']}", bill[-1], f"{bill[-1]:.2f}x  {s['short']}"))
    axes[0].set_yscale("log")
    axes[0].set_ylim(0.3, 50)
    axes[0].set_yticks([0.3, 1, 3, 10, 30], ["0.3 s", "1 s", "3 s", "10 s", "30 s"])
    axes[0].minorticks_off()
    alone = ", ".join(f"{out[(s['key'], 'ttft_alone')]:.2f} s ({s['short']})" for s in SETUPS)
    axes[0].set_title("Chat's slowest 5% wait for a first token, all three sharing", fontsize=9.5)
    axes[0].text(-0.15, 0.33, f"chat alone: {alone}", fontsize=7.5, color=INK2, va="bottom")
    axes[1].axhline(1.0, color=AXIS, lw=0.9, zorder=1)
    axes[1].set_ylim(0.9, 1.75)
    axes[1].set_yticks([1.0, 1.2, 1.4, 1.6], ["1.0x (same as alone)", "1.2x", "1.4x", "1.6x"])
    axes[1].set_title("Agent's cache-discounted (API-style) bill, sharing vs alone, for identical work", fontsize=9.5)
    for ax in axes:
        ax.set_xticks(xs, [LEVEL_SHORT[l] for l in LEVELS])
        ax.set_xlim(-0.2, len(LEVELS) - 0.3)
        style_ax(ax, "y")
    for i in (0, 1):
        end_labels(axes[i], xs[-1], [l[2 * i] for l in labs], [l[2 * i + 1] for l in labs])
    legend(fig, 0.9)
    fig.suptitle("The cost token prices can't see: tenants slow each other down and the evicted tenant pays more",
                 x=0.01, ha="left", fontsize=11, color=INK, y=0.985)
    fig.tight_layout(rect=(0, 0, 1, 0.84))
    fig.savefig(OUT / "5_interference.png", dpi=150)
    plt.close(fig)
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    D = {s["key"]: load(s["path"]) for s in SETUPS}
    print("clean runs: " + ", ".join(f"{s['short']} {len(D[s['key']]['runs'])}" for s in SETUPS))

    v = fig_cost_by_model(D)
    print("\n[1] roomy, mean of 4 seeds: busy s / steps / ms per step / dyn energy kJ")
    for k in ("chat", "docs", "agent", ALL3):
        print(f"  {k:16s} " + "   ".join(f"{s['short']}: {v[(s['key'], k)]['busy']:.1f} / {v[(s['key'], k)]['steps']:.0f} / "
                                         f"{1e3 * v[(s['key'], k)]['busy'] / v[(s['key'], k)]['steps']:.1f} / "
                                         f"{v[(s['key'], k)]['energy']:.1f}" for s in SETUPS))

    sh = fig_who_pays(D)
    print("\n[2] shares % chat/docs/agent (busy time)")
    for level in LEVELS:
        print(f"  {level:6s} tokens " + " / ".join(f"{sh[(level, 'tokens', t)]:.1f}" for t in A.TENANTS) + "   Shapley " +
              "   ".join(f"{s['short']}: " + " / ".join(f"{sh[(level, s['key'], t)]:.1f}" for t in A.TENANTS) for s in SETUPS))
    for s in SETUPS:
        for m in ("api_price", "fit_iso"):
            print(f"  {s['short']:11s} {m:9s} " + "   ".join(
                f"{l}: " + " / ".join(f"{100 * st.mean(share(D[s['key']], l, m, t)):.1f}" for t in A.TENANTS) for l in LEVELS))

    for metric, fname, ref in (("busy_s", "3_error_by_model.png", "busy-time"),
                               ("energy_ctr_dyn_J", "3b_error_by_model_energy.png", "dynamic-energy")):
        err = fig_error(D, metric, fname, ref)
        print(f"\n[3] nL1 vs Shapley ({metric}), mean±sd: " + " | ".join(s["short"] for s in SETUPS))
        for m, _ in METHODS:
            print(f"  {m:10s} " + "   ".join(f"{l}: " + " | ".join(f"{err[(s['key'], l, m)][0]:.3f}±{err[(s['key'], l, m)][1]:.3f}"
                                                                 for s in SETUPS) for l in LEVELS))
        for s in SETUPS:
            its = [a for l in LEVELS for a in items(D[s["key"]], l, metric)]
            print(f"  noise floor {s['short']}: max nL1 {max(a['noise_l1'] for a in its):.4f}, repeat delta "
                  f"median {100 * st.median(a['grand_rep_delta'] for a in its):.2f}% max {100 * max(a['grand_rep_delta'] for a in its):.2f}%")

    mp = fig_memory_pressure(D)
    print("\n[4] memory pressure: all-three busy vs roomy (%), calibrated-price nL1; also energy and preemptions")
    for s in SETUPS:
        d = D[s["key"]]
        ge = [st.mean(a["total"] for a in items(d, l, "energy_ctr_dyn_J")) for l in LEVELS]
        gb = [st.mean(a["total"] for a in items(d, l)) for l in LEVELS]
        pre = [st.mean(lat(d, l, ALL3, "preemptions")) for l in LEVELS]
        sub = [st.mean(a["total"] / sum(a["v"][t] for t in A.TENANTS) for a in items(d, l)) for l in LEVELS]
        print(f"  {s['short']:11s} busy " + " / ".join(f"{x:.1f}s" for x in gb) + "  extra " +
              " / ".join(f"{mp[(s['key'], l)][0]:+.0f}%" for l in LEVELS) + "  energy " +
              " / ".join(f"{x / 1e3:.1f}kJ ({100 * (x - ge[0]) / ge[0]:+.0f}%)" for x in ge) + "  fit_iso " +
              " / ".join(f"{mp[(s['key'], l)][1]:.3f}" for l in LEVELS) + "  preempt " + " / ".join(f"{x:.1f}" for x in pre) +
              "  together/alone " + " / ".join(f"{x:.3f}" for x in sub))
    for s in SETUPS:
        chk = constrained_fit_check(D[s["key"]])
        pr = [a["prices"]["fit_iso"] for l in LEVELS for a in items(D[s["key"]], l)]
        print(f"  {s['short']:11s} cached<=uncached refit: " + "  ".join(
            f"{l} {chk[l]['free'][0]:.3f}->{chk[l]['cached<=uncached'][0]:.3f}" for l in LEVELS) +
              "; output/uncached price ratio " + " / ".join(
            f"{st.mean(a['prices']['fit_iso'][2] / a['prices']['fit_iso'][0] for a in items(D[s['key']], l)):.1f}" for l in LEVELS))

    it = fig_interference(D)
    print("\n[5] interference, all three sharing: chat p95 TTFT s, agent API bill shared/alone, agent hit rate shared (alone)")
    for s in SETUPS:
        d = D[s["key"]]
        print(f"  {s['short']:11s} ttft alone {it[(s['key'], 'ttft_alone')]:.2f}s; " + "  ".join(
            f"{l}: {it[(s['key'], l)][0]:.2f}s {it[(s['key'], l)][1]:.2f}x hit {100 * st.mean(lat(d, l, ALL3, 'agent_hit')):.0f}% "
            f"({100 * st.mean(lat(d, l, 'agent', 'agent_hit')):.0f}%)" for l in LEVELS))

    print("\n[6] cluster conditions")
    for s in SETUPS[1:]:
        R = D[s["key"]]["runs"]
        g = lambda k: [r[k] for r in R if r.get(k) is not None]
        by_level = {l: sorted({r["gpu_uuids"][0][-6:] for r in R if r["kv_level"] == l}) for l in LEVELS}
        print(f"  {s['short']}: {len(R)} clean, GPUs {by_level}, temp {min(g('temp_c'))}-{max(g('temp_c'))} C, "
              f"foreign SM mean max {max(g('foreign_sm_mean') or [0]):.2f}% median {st.median(g('foreign_sm_mean') or [0]):.2f}%, "
              f"foreign SM peak max {max(g('foreign_sm_max'))}, quiet wait max {max(g('quiet_wait_s')):.0f}s, "
              f"util before mean max {max(g('util_before_mean') or [0]):.1f}%, after max {max(g('util_after_mean') or [0]):.1f}%")
    print(f"\nfigures written to {OUT}/")


if __name__ == "__main__":
    main()
