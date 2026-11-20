"""Report figures for the cluster run: Qwen2.5-7B on an RU A100, compared with the laptop PoC (Qwen2.5-0.5B, RTX 3050).

Usage: python compare_7b.py
Writes results/qwen2.5-7b-instruct/report_figures/*.png and prints every number the figures show, so the
write-up (results/qwen2.5-7b-instruct/experiment_summary.md) can quote them. Uses analyze.py for loading, Shapley
values and the billing methods, so the numbers match analyze.py's summary.md exactly.
"""

import statistics as st
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.lines import Line2D
from matplotlib.patches import Patch
from scipy.optimize import nnls

import analyze as A

LAPTOP_RUNS = "results/runs.jsonl"
A100_RUNS = "results/qwen2.5-7b-instruct/runs.jsonl"
OUT = Path("results/qwen2.5-7b-instruct/report_figures")
LEVELS = ("roomy", "tight", "vtight")
LEVEL_LABEL = {"roomy": "Roomy memory\n(~106k tokens of KV cache)", "tight": "Tight memory\n(22.4k tokens)",
               "vtight": "Very tight memory\n(13.6k tokens)"}
LEVEL_SHORT = {"roomy": "roomy\n(~106k tok)", "tight": "tight\n(22.4k tok)", "vtight": "very tight\n(13.6k tok)"}

# dataviz reference palette (light mode): tenants = categorical slots 1-3 (validated all-pairs);
# machines = emphasis pair, laptop in muted gray (hollow marker) vs A100 in violet (filled marker)
SURF, INK, INK2, MUTED, GRID, AXIS = "#fcfcfb", "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#c3c2b7"
TENANT_C = A.COLORS
LAPTOP_C, A100_C = MUTED, "#6250d6"
TENANT_NAME = {"chat": "chat (many short requests)", "docs": "docs (few very long prompts)",
               "agent": "agent (multi-turn, cached context)"}

plt.rcParams.update({
    "figure.facecolor": SURF, "axes.facecolor": SURF, "savefig.facecolor": SURF, "font.size": 9.5,
    "axes.edgecolor": AXIS, "axes.labelcolor": INK2, "xtick.color": INK2, "ytick.color": INK2,
    "axes.titlecolor": INK, "axes.titlesize": 10, "axes.spines.top": False, "axes.spines.right": False,
    "axes.titlelocation": "left",
})


def load(path):
    runs, by = A.load(path)
    return dict(runs=runs, by=by, res={m: A.analyze(by, m) for m in ("busy_s", "energy_ctr_dyn_J")},
                lat=A.latency_and_cache(by))


def items(d, level, metric="busy_s"):
    return [a for (l, _), a in sorted(d["res"][metric].items()) if l == level]


def nl1(d, level, method, metric="busy_s"):
    return [A.l1(a["shares"][method], a["shares"]["shapley"]) for a in items(d, level, metric)]


def share(d, level, method, tenant):
    return [a["shares"][method][tenant] for a in items(d, level)]


def lat(d, level, coalition, field):
    return [r[field] for r in d["lat"] if r["level"] == level and r["coalition"] == coalition and r[field] is not None]


def coalition_means(d, level, coalition):
    rs = [A.primary(cs[coalition]) for (l, _), cs in d["by"].items() if l == level]
    return dict(tokens=st.mean(sum(q["prompt_len"] + q["n_out"] for q in r["requests"]) for r in rs) / 1e3,
                steps=st.mean(r["steps"] for r in rs), busy=st.mean(r["busy_s"] for r in rs),
                energy=st.mean(r["energy_ctr_dyn_J"] for r in rs) / 1e3)


def machine_legend(fig, y=0.925):
    h = [Line2D([], [], marker="o", ls="", ms=7, mfc=SURF, mec=LAPTOP_C, mew=1.6, label="Laptop: Qwen2.5-0.5B on RTX 3050"),
         Line2D([], [], marker="o", ls="", ms=7.5, mfc=A100_C, mec=SURF, mew=1.0, label="RU cluster: Qwen2.5-7B on A100")]
    fig.legend(handles=h, loc="upper left", bbox_to_anchor=(0.003, y), ncol=2, frameon=False, fontsize=9,
               handletextpad=0.3, columnspacing=1.4)


def fig_steps(a100):
    """Equal tokens per tenant, very unequal engine steps and busy time; serving together costs little more than chat alone."""
    rows = [("chat", "chat alone"), ("docs", "docs alone"), ("agent", "agent alone"), ("chat+docs+agent", "all three together")]
    vals = {k: coalition_means(a100, "roomy", k) for k, _ in rows}
    panels = [("tokens", "Tokens served (thousands)", "{:.0f}k"), ("steps", "Engine steps (scheduler iterations)", "{:,.0f}"),
              ("busy", "GPU busy time (seconds)", "{:.1f} s"), ("energy", "Dynamic GPU energy (kJ)", "{:.1f} kJ")]
    fig, axes = plt.subplots(1, 4, figsize=(12.5, 2.7), sharey=True)
    ys = np.arange(len(rows))[::-1]
    for ax, (f, title, fmt) in zip(axes, panels):
        xmax = max(vals[k][f] for k, _ in rows)
        for y, (k, _) in zip(ys, rows):
            c = TENANT_C.get(k, MUTED)
            ax.barh(y, vals[k][f], height=0.36, color=c)
            ax.text(vals[k][f] + 0.02 * xmax, y, fmt.format(vals[k][f]), va="center", ha="left", fontsize=8.5, color=INK2)
        ax.set_xlim(0, xmax * 1.32)
        ax.set_title(title)
        ax.grid(axis="x", color=GRID, lw=0.8)
        ax.set_axisbelow(True)
        ax.tick_params(axis="y", length=0)
        ax.spines["left"].set_visible(False)
    axes[0].set_yticks(ys, [lab for _, lab in rows])
    fig.suptitle("Same token volume, very different GPU cost (A100, Qwen2.5-7B, roomy memory, mean of 4 seeds)",
                 x=0.01, ha="left", fontsize=11, color=INK)
    fig.tight_layout(rect=(0, 0, 1, 0.95))
    fig.savefig(OUT / "1_steps_not_tokens.png", dpi=150)
    plt.close(fig)
    return vals


def fig_who_pays(a100):
    rows = [("shapley", "GPU cost actually caused\n(Shapley reference)"), ("tokens", "Plain token count"),
            ("api_price", "API-style price\n(output 5x, cached 0.1x)"), ("fit_iso", "Calibrated 3-rate price\n(fitted on isolated runs)")]
    ypos = [3.35, 2, 1, 0]
    fig, axes = plt.subplots(1, 3, figsize=(12.5, 3.0), sharey=True)
    out = {}
    for ax, level in zip(axes, LEVELS):
        for y, (m, _) in zip(ypos, rows):
            left = 0.0
            for t in A.TENANTS:
                w = 100 * st.mean(share(a100, level, m, t))
                out[(level, m, t)] = w
                ax.barh(y, w, left=left, height=0.5, color=TENANT_C[t], edgecolor=SURF, linewidth=2)
                if w >= 8:
                    ax.text(left + 1.5, y, f"{w:.0f}%", va="center", ha="left", fontsize=8.5, color="#ffffff")
                left += w
        ax.set_xlim(0, 100)
        ax.set_xticks([])
        for s in ("left", "bottom"):
            ax.spines[s].set_visible(False)
        ax.tick_params(axis="y", length=0)
        ax.set_title(LEVEL_LABEL[level].replace("\n", " "))
    axes[0].set_yticks(ypos, [lab for _, lab in rows])
    fig.legend(handles=[Patch(color=TENANT_C[t], label=TENANT_NAME[t]) for t in A.TENANTS], loc="upper left",
               bbox_to_anchor=(0.003, 0.915), ncol=3, frameon=False, fontsize=9, handlelength=1.2)
    fig.suptitle("Who pays what: each tenant's share of the bill (A100, Qwen2.5-7B, busy time, mean of 4 seeds)",
                 x=0.01, ha="left", fontsize=11, color=INK, y=0.985)
    fig.tight_layout(rect=(0, 0, 1, 0.84))
    fig.savefig(OUT / "2_who_pays.png", dpi=150)
    plt.close(fig)
    return out


METHODS = [("tokens", "Plain token count"), ("api_price", "API-style price"),
           ("fit_iso", "Calibrated 3-rate price\n(fitted on isolated runs)"),
           ("fit_oracle", "Best possible 3-rate price\n(fitted on shared runs)"),
           ("isolated", "Cost when running alone"), ("loo", "Leave-one-out\n(marginal cost)"),
           ("kv_gib_s", "Memory x time\n(KV GiB-seconds)")]


def fig_error(lap, a100):
    fig, axes = plt.subplots(1, 3, figsize=(12.5, 4.4), sharey=True)
    ys = np.arange(len(METHODS))[::-1].astype(float)
    out = {}
    for ax, level in zip(axes, LEVELS):
        ax.axvline(0.1, color=AXIS, lw=0.9, zorder=1)
        for y, (m, _) in zip(ys, METHODS):
            for d, dy, style, key in ((lap, 0.16, dict(mfc=SURF, mec=LAPTOP_C, mew=1.6, ms=7), "laptop"),
                                      (a100, -0.16, dict(mfc=A100_C, mec=SURF, mew=1.0, ms=7.5), "a100")):
                v = nl1(d, level, m)
                mu, sd = st.mean(v), st.stdev(v)
                out[(key, level, m)] = (mu, sd)
                c = LAPTOP_C if key == "laptop" else A100_C
                ax.hlines(y + dy, max(0, mu - sd), mu + sd, color=c, lw=1.1, zorder=2)
                ax.plot(mu, y + dy, "o", zorder=3, **style)
        ax.set_xlim(0, 0.78)
        ax.set_ylim(-0.6, len(METHODS) - 0.05)
        ax.grid(axis="x", color=GRID, lw=0.8)
        ax.set_axisbelow(True)
        ax.tick_params(axis="y", length=0)
        ax.spines["left"].set_visible(False)
        ax.set_title(LEVEL_LABEL[level].replace("\n", " "))
        ax.set_xlabel("error vs Shapley (normalised L1; 0 = perfect)")
    axes[0].text(0.11, len(METHODS) - 0.2, "0.1 = project's go/no-go target", fontsize=8, color=INK2, va="top")
    mu, _ = out[("a100", "vtight", "fit_iso")]
    yv = ys[[m for m, _ in METHODS].index("fit_iso")] - 0.16
    axes[2].annotate(f"{mu:.2f} on the A100,\nabove the target", xy=(mu + 0.055, yv), xytext=(0.30, yv - 0.15),
                     fontsize=8, color=INK2, va="center",
                     arrowprops=dict(arrowstyle="-", color=AXIS, lw=0.8))
    axes[0].set_yticks(ys, [lab for _, lab in METHODS])
    machine_legend(fig)
    fig.suptitle("How wrong is each billing method? (busy-time reference; dot = mean of 4 seeds, line = ±1 SD)",
                 x=0.01, ha="left", fontsize=11, color=INK, y=0.985)
    fig.tight_layout(rect=(0, 0, 1, 0.88))
    fig.savefig(OUT / "3_error_laptop_vs_a100.png", dpi=150)
    plt.close(fig)
    return out


def fig_interference(lap, a100):
    fig, axes = plt.subplots(1, 2, figsize=(12.5, 3.6))
    xs = np.arange(len(LEVELS))
    out = {}
    specs = [(axes[0], "chat+docs+agent", "chat_ttft_p95", "chat", 1.0, "s",
              "Chat's slowest 5% wait for a first token (p95 TTFT), all three tenants sharing"),
             (axes[1], "chat+docs+agent", "agent_hit", "agent", 100.0, "%",
              "Agent's prefix-cache hit rate, all three tenants sharing")]
    for ax, coal, field, alone_coal, scale, unit, title in specs:
        alone = []
        for d, key, style in ((lap, "laptop", dict(color=LAPTOP_C, mfc=SURF, mec=LAPTOP_C, mew=1.6, ms=7)),
                              (a100, "a100", dict(color=A100_C, mfc=A100_C, mec=SURF, mew=1.0, ms=7.5))):
            mus = [scale * st.mean(lat(d, l, coal, field)) for l in LEVELS]
            sds = [scale * st.stdev(lat(d, l, coal, field)) for l in LEVELS]
            for l, m, s in zip(LEVELS, mus, sds):
                out[(key, field, l)] = (m, s)
            ax.vlines(xs, [max(m - s, 1e-3) for m, s in zip(mus, sds)], [m + s for m, s in zip(mus, sds)],
                      color=style["color"], lw=1.1, zorder=2)
            ax.plot(xs, mus, "-o", lw=2, zorder=3, solid_capstyle="round", **style)
            alone += [scale * st.mean(lat(d, l, alone_coal, field)) for l in LEVELS]
            if key == "a100":
                lab = f"{mus[-1]:.1f} s" if unit == "s" else f"{mus[-1]:.0f}%"
                ax.text(xs[-1] + 0.09, mus[-1], f"{lab} (A100)", va="center", ha="left", fontsize=8.5, color=INK2)
        a, lo, hi = st.mean(alone), min(alone), max(alone)
        out[(field, "alone")] = (a, lo, hi)
        ax.axhline(a, color=AXIS, lw=0.9, zorder=1)
        rng = f"{lo:.2f}-{hi:.2f} s" if unit == "s" else f"{lo:.0f}-{hi:.0f}%"
        ax.text(1.0 if unit == "%" else -0.15, a * (1.06 if unit == "s" else 1) + (1.2 if unit == "%" else 0),
                f"{alone_coal} alone (any level, either machine): {rng}", fontsize=8, color=INK2, va="bottom", ha="left")
        ax.set_xticks(xs, [LEVEL_SHORT[l] for l in LEVELS])
        ax.set_xlim(-0.2, len(LEVELS) - 0.55)
        ax.grid(axis="y", color=GRID, lw=0.8)
        ax.set_axisbelow(True)
        ax.set_title(title, fontsize=9.5)
    axes[0].set_yscale("log")
    axes[0].set_ylim(0.06, 15)
    axes[0].set_yticks([0.1, 0.3, 1, 3, 10], ["0.1 s", "0.3 s", "1 s", "3 s", "10 s"])
    axes[0].minorticks_off()
    axes[1].set_ylim(0, 90)
    axes[1].set_yticks([0, 20, 40, 60, 80], ["0%", "20%", "40%", "60%", "80%"])
    machine_legend(fig)
    fig.suptitle("The cost token prices can't see: harm to other tenants grows as memory gets tighter",
                 x=0.01, ha="left", fontsize=11, color=INK, y=0.985)
    fig.tight_layout(rect=(0, 0, 1, 0.86))
    fig.savefig(OUT / "4_interference_laptop_vs_a100.png", dpi=150)
    plt.close(fig)
    return out


def constrained_fit_check(d):
    """Re-fit the isolated 3-rate price with cached <= uncached (and cached = uncached) to test whether the inverted
    cached price explains the very-tight error. Same leave-one-seed-out protocol as analyze.py."""
    out = {}
    for level in LEVELS:
        acc = {"free": [], "cached<=uncached": []}
        for (l, s), a in d["res"]["busy_s"].items():
            if l != level:
                continue
            train = [b for (l2, s2), b in d["res"]["busy_s"].items() if l2 == level and s2 != s]
            X = np.array([b["iso_features"][t] for b in train for t in A.TENANTS])
            y = np.array([b["v"][t] for b in train for t in A.TENANTS])
            p_free, _ = nnls(X, y)
            q, _ = nnls(np.column_stack([X[:, 0] + X[:, 1], X[:, 0], X[:, 2]]), y)  # cached = q0, uncached = q0 + q1
            p_con = np.array([q[0] + q[1], q[0], q[2]])
            for k, p in (("free", p_free), ("cached<=uncached", p_con)):
                acc[k].append(A.l1(A.norm({t: a["features"][t] @ p for t in A.TENANTS}), a["shares"]["shapley"]))
        out[level] = {k: (st.mean(v), st.stdev(v)) for k, v in acc.items()}
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    lap, a100 = load(LAPTOP_RUNS), load(A100_RUNS)
    print("runs:", len(lap["runs"]), "laptop,", len(a100["runs"]), "A100 (contaminated rows already dropped)")

    vals = fig_steps(a100)
    print("\n[1] A100 roomy, mean of 4 seeds")
    for k, v in vals.items():
        print(f"  {k:16s} tokens {v['tokens']:.1f}k  steps {v['steps']:.0f}  busy {v['busy']:.1f}s  "
              f"ms/step {1e3 * v['busy'] / v['steps']:.1f}  dyn energy {v['energy']:.1f} kJ")

    sh = fig_who_pays(a100)
    print("\n[2] A100 shares (%) chat/docs/agent")
    for level in LEVELS:
        for m in ("shapley", "tokens", "api_price", "fit_iso"):
            print(f"  {level:6s} {m:9s} " + " / ".join(f"{sh[(level, m, t)]:.1f}" for t in A.TENANTS))

    err = fig_error(lap, a100)
    print("\n[3] nL1 vs Shapley (busy time), laptop | A100")
    for m, _ in METHODS:
        print(f"  {m:10s} " + "   ".join(f"{l}: {err[('laptop', l, m)][0]:.3f}±{err[('laptop', l, m)][1]:.3f} | "
                                         f"{err[('a100', l, m)][0]:.3f}±{err[('a100', l, m)][1]:.3f}" for l in LEVELS))
    print("  energy reference, A100: " + "  ".join(
        f"{m} " + "/".join(f"{st.mean(nl1(a100, l, m, 'energy_ctr_dyn_J')):.3f}" for l in LEVELS)
        for m in ("tokens", "api_price", "fit_iso", "isolated", "loo", "kv_gib_s")))

    inter = fig_interference(lap, a100)
    print("\n[4] interference (all three sharing), laptop | A100")
    for field in ("chat_ttft_p95", "agent_hit"):
        print(f"  {field}: alone {inter[(field, 'alone')][1]:.3f}-{inter[(field, 'alone')][2]:.3f}; " + "  ".join(
            f"{l}: {inter[('laptop', field, l)][0]:.2f} | {inter[('a100', field, l)][0]:.2f}" for l in LEVELS))
    for d, name in ((lap, "laptop"), (a100, "A100")):
        bills = []
        for l in LEVELS:
            alone = st.mean(lat(d, l, "agent", "agent_api_bill_k"))
            bills.append(f"{l} {st.mean(lat(d, l, 'chat+docs+agent', 'agent_api_bill_k')) / alone:.2f}x")
        print(f"  agent API-style bill, all three vs alone ({name}): " + ", ".join(bills))

    print("\n[5] subadditivity C(all) / sum C(single), busy time, laptop | A100")
    for l in LEVELS:
        f = lambda d: [a["total"] / sum(a["v"][t] for t in A.TENANTS) for a in items(d, l)]
        print(f"  {l:6s} {st.mean(f(lap)):.3f} | {st.mean(f(a100)):.3f}")
    for d, name in ((lap, "laptop"), (a100, "A100")):
        r, v = coalition_means(d, "roomy", "chat+docs+agent")["busy"], coalition_means(d, "vtight", "chat+docs+agent")["busy"]
        print(f"  {name}: all three busy roomy {r:.1f}s -> very tight {v:.1f}s (memory pressure adds {100 * (v - r) / r:.0f}%)")

    print("\n[6] calibrated price with cached <= uncached (tests the inverted-cached-price explanation)")
    for d, name in ((lap, "laptop"), (a100, "A100")):
        chk = constrained_fit_check(d)
        print(f"  {name}: " + "  ".join(f"{l}: free {chk[l]['free'][0]:.3f} -> constrained {chk[l]['cached<=uncached'][0]:.3f}"
                                        for l in LEVELS))
    pr = [a["prices"]["fit_iso"] for l in LEVELS for a in items(a100, l)]
    print(f"  A100 fitted out/uncached price ratio: " + ", ".join(
        f"{l} {st.mean(a['prices']['fit_iso'][2] / a['prices']['fit_iso'][0] for a in items(a100, l)):.1f}" for l in LEVELS)
          + f"; cached/uncached ratio {min(p[1] / p[0] for p in pr):.2f}-{max(p[1] / p[0] for p in pr):.2f}")
    temps = [r["temp_c"] for r in a100["runs"]]
    print(f"\n[7] A100 conditions: {len(a100['runs'])} clean runs, temp {min(temps)}-{max(temps)} C, SM clock "
          f"{min(r['sm_clock_mhz'] for r in a100['runs'])}-{max(r['sm_clock_mhz'] for r in a100['runs'])} MHz, "
          f"quiet wait max {max(r.get('quiet_wait_s', 0) for r in a100['runs']):.0f}s, "
          f"foreign SM max {max(r.get('foreign_sm_max') or 0 for r in a100['runs'])}, "
          f"GPUs used {sorted({r['gpu_uuids'][0][-8:] for r in a100['runs']})}")
    print(f"\nfigures written to {OUT}/")


if __name__ == "__main__":
    main()
