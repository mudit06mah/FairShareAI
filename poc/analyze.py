"""Turn results/runs.jsonl into attribution tables and figures.

Reference allocations (per KV level and seed) are exact 3-player Shapley values of
C(S) = busy-time (primary) or dynamic energy from the NVML counter (secondary). They are compared with
token-based allocations of the full-coalition run:
  tokens      share of prompt + output tokens (plain token metering)
  api_price   1 x uncached input + 0.1 x cached input + 5 x output (commercial-API-style ratios)
  fit_iso     3-rate non-negative price fitted to each tenant's *isolated* cost on the other seeds
  fit_oracle  3-rate price fitted directly to Shapley values on the other seeds (best case for token pricing)
Other views: leave-one-out, isolated-replay and logical KV GiB-s shares.

Usage: python analyze.py [--runs results/runs.jsonl]
"""

import argparse
import json
import statistics as st
from collections import defaultdict
from itertools import combinations
from pathlib import Path

import numpy as np
from scipy.optimize import nnls

import os

TENANTS = ("chat", "docs", "agent")
NO_TITLES = bool(os.environ.get("NO_TITLES"))  # report figures: captions replace in-image titles
SIMPLE = bool(os.environ.get("SIMPLE"))  # report figures: drop the oracle price, show error as % of GPU time mis-billed
SIMPLE_LABELS = {"fit_iso": "Calibrated\n3-rate price", "isolated": "Cost when\nrunning alone", "kv_gib_s": "Memory-time",
                 "api_price": "API-style\nprice", "tokens": "Plain token\ncount", "loo": "Leave-\none-out"}
API_PRICE = {"uncached": 1.0, "cached": 0.1, "out": 5.0}
COLORS = {"chat": "#2a78d6", "docs": "#eb6834", "agent": "#1baf7a"}  # dataviz reference slots 1-3
INK, INK2, GRID = "#0b0b0b", "#52514e", "#e4e3df"


def key(c):
    return "+".join(t for t in TENANTS if t in c)


def load(path):
    runs = []
    for l in open(path):
        try:
            runs.append(json.loads(l))
        except json.JSONDecodeError:
            pass  # last line cut off when a cluster job hit its walltime
    dirty = [r for r in runs if r.get("contaminated")]
    runs = [r for r in runs if not r.get("contaminated")]
    if dirty:
        print(f"Ignoring {len(dirty)} contaminated replay attempt(s) (another process was using the GPU).")
    models = {r.get("model") for r in runs}
    if len(models) > 1:
        raise SystemExit(f"{path} mixes models {sorted(map(str, models))}; keep one model per results file.")
    by = defaultdict(dict)  # (level, seed) -> coalition key -> [runs]
    for r in runs:
        by[(r["kv_level"], r["seed"])].setdefault(key(r["coalition"]), []).append(r)
    return runs, by


def primary(runs_for_coalition):
    """The repeat-0 run is the measurement; repeats estimate noise only."""
    return min(runs_for_coalition, key=lambda r: r["repeat"])


def shapley(v):
    n = len(TENANTS)
    w = {0: 1 / 3, 1: 1 / 6, 2: 1 / 3}
    phi = {}
    for i in TENANTS:
        others = [t for t in TENANTS if t != i]
        s = 0.0
        for k in range(n):
            for S in combinations(others, k):
                s += w[k] * (v[key(S + (i,))] - (v[key(S)] if S else 0.0))
        phi[i] = s
    return phi


def norm(d):
    tot = sum(d.values())
    return {k: (x / tot if tot else float("nan")) for k, x in d.items()}


def features(run):
    f = {t: np.zeros(3) for t in TENANTS}
    for q in run["requests"]:
        cached = q["cached"] or 0
        f[q["tenant"]] += [q["prompt_len"] - cached, cached, q["n_out"]]
    return f


def l1(a, b):
    return sum(abs(a[t] - b[t]) for t in TENANTS)


def pct(xs, p):
    xs = sorted(xs)
    if not xs:
        return float("nan")
    return xs[min(len(xs) - 1, int(round(p / 100 * (len(xs) - 1))))]


def analyze(by, metric):
    """Per (level, seed): cost values, Shapley, and every allocation's shares."""
    out = {}
    for (level, seed), cs in sorted(by.items()):
        if len(cs) < 7:
            continue
        v = {k: primary(rs)[metric] for k, rs in cs.items()}
        grand = primary(cs[key(TENANTS)])
        phi = shapley(v)
        f = features(grand)
        tok = {t: f[t].sum() for t in TENANTS}
        api = {t: f[t] @ [API_PRICE["uncached"], API_PRICE["cached"], API_PRICE["out"]] for t in TENANTS}
        loo = {t: v[key(TENANTS)] - v[key([x for x in TENANTS if x != t])] for t in TENANTS}
        iso = {t: v[t] for t in TENANTS}
        kv = defaultdict(float)
        for q in grand["requests"]:
            kv[q["tenant"]] += q["kv_gib_s"]
        # noise floor: Shapley recomputed with the repeated full-coalition measurement
        reps = [r for r in cs[key(TENANTS)] if r["repeat"] > 0]
        noise = None
        if reps:
            v2 = dict(v)
            v2[key(TENANTS)] = reps[0][metric]
            noise = l1(norm(shapley(v2)), norm(phi))
        out[(level, seed)] = dict(
            v=v, phi=phi, total=v[key(TENANTS)], shares=dict(
                shapley=norm(phi), tokens=norm(tok), api_price=norm(api),
                loo=norm(loo), isolated=norm(iso), kv_gib_s=norm(dict(kv)),
            ),
            features=f, iso_features={t: features(primary(cs[t]))[t] for t in TENANTS},
            noise_l1=noise, grand_rep_delta=(abs(reps[0][metric] - v[key(TENANTS)]) / v[key(TENANTS)]) if reps else None,
        )
    # fitted 3-rate token prices, leave-one-seed-out within each KV level
    for (level, seed), a in out.items():
        train = [b for (l2, s2), b in out.items() if l2 == level and s2 != seed]
        if not train:
            continue
        X = np.array([b["iso_features"][t] for b in train for t in TENANTS])
        y = np.array([b["v"][t] for b in train for t in TENANTS])
        p_iso, _ = nnls(X, y)
        X2 = np.array([b["features"][t] for b in train for t in TENANTS])
        y2 = np.array([b["phi"][t] for b in train for t in TENANTS])
        p_or, _ = nnls(X2, y2)
        a["shares"]["fit_iso"] = norm({t: a["features"][t] @ p_iso for t in TENANTS})
        a["shares"]["fit_oracle"] = norm({t: a["features"][t] @ p_or for t in TENANTS})
        a["prices"] = dict(fit_iso=p_iso.tolist(), fit_oracle=p_or.tolist())
    return out


def latency_and_cache(by):
    rows = []
    for (level, seed), cs in sorted(by.items()):
        for k, rs in cs.items():
            r = primary(rs)
            chat = [q for q in r["requests"] if q["tenant"] == "chat" and q["first_token"] is not None]
            ttft = [q["first_token"] - q["arrival"] for q in chat]
            tpot = [(q["finish"] - q["first_token"]) / max(q["n_out"] - 1, 1) for q in chat]
            ag = [q for q in r["requests"] if q["tenant"] == "agent" and not q["rid"].endswith("-t0")]
            hit = [(q["cached"] or 0) / q["prompt_len"] for q in ag]
            agq = [q for q in r["requests"] if q["tenant"] == "agent"]
            ag_unc = sum(q["prompt_len"] - (q["cached"] or 0) for q in agq)
            ag_bill = sum(API_PRICE["uncached"] * (q["prompt_len"] - (q["cached"] or 0))
                          + API_PRICE["cached"] * (q["cached"] or 0) + API_PRICE["out"] * q["n_out"] for q in agq)
            rows.append(dict(
                level=level, seed=seed, coalition=k, busy_s=r["busy_s"], energy_J=r["energy_J"],
                makespan_s=r["makespan_s"], preemptions=r["preemptions"], temp_c=r["temp_c"],
                chat_ttft_p50=pct(ttft, 50) if ttft else None, chat_ttft_p95=pct(ttft, 95) if ttft else None,
                chat_tpot_p50=pct(tpot, 50) if tpot else None, chat_tpot_p95=pct(tpot, 95) if tpot else None,
                agent_hit=st.mean(hit) if hit else None,
                agent_uncached_k=ag_unc / 1000 if agq else None,
                agent_api_bill_k=ag_bill / 1000 if agq else None,
            ))
    return rows


def ms(xs):
    xs = [x for x in xs if x is not None]
    if not xs:
        return "n/a"
    return f"{st.mean(xs):.3f} ± {st.stdev(xs):.3f}" if len(xs) > 1 else f"{xs[0]:.3f}"


def fmt_pp(xs):
    xs = [100 * x for x in xs]
    return f"{st.mean(xs):+.1f} ± {st.stdev(xs):.1f}" if len(xs) > 1 else f"{xs[0]:+.1f}"


def report(res_by_metric, lat, runs, outdir):
    lines = ["# PoC results (generated by analyze.py)\n"]
    lines.append(f"Runs: {len(runs)}. Mean ± sample SD across seeds (n = number of seeds, small).\n")
    methods = ["tokens", "api_price", "fit_iso", "fit_oracle", "isolated", "loo", "kv_gib_s"]
    for metric, res in res_by_metric.items():
        for level in sorted({l for l, _ in res}):
            items = [a for (l, _), a in sorted(res.items()) if l == level]
            lines.append(f"\n## Reference = Shapley on `{metric}`, KV level `{level}` ({len(items)} seeds)\n")
            lines.append("Tenant share of the full-coalition cost (%), and each method's deviation from Shapley (pp):\n")
            lines.append("| tenant | Shapley share % | " + " | ".join(f"{m} Δpp" for m in methods) + " |")
            lines.append("|---|---|" + "---|" * len(methods))
            for t in TENANTS:
                sh = [a["shares"]["shapley"][t] for a in items]
                cells = []
                for m in methods:
                    d = [a["shares"][m][t] - a["shares"]["shapley"][t] for a in items if m in a["shares"]]
                    cells.append(fmt_pp(d) if d else "n/a")
                lines.append(f"| {t} | {100 * st.mean(sh):.1f} | " + " | ".join(cells) + " |")
            lines.append("\nNormalized L1 distance to Shapley (sum over tenants of |share − Shapley share|; JouleShare's metric):\n")
            lines.append("| method | nL1 |")
            lines.append("|---|---|")
            for m in methods:
                d = [l1(a["shares"][m], a["shares"]["shapley"]) for a in items if m in a["shares"]]
                lines.append(f"| {m} | {ms(d)} |")
            nz = [a["noise_l1"] for a in items if a["noise_l1"] is not None]
            if nz:
                lines.append(f"| *noise floor (repeat of full coalition)* | {ms(nz)} |")
            lines.append(f"\nSubadditivity: C(all) / Σ C(single) = {ms([a['total'] / sum(a['v'][t] for t in TENANTS) for a in items])}")
            pr = [a.get("prices") for a in items if a.get("prices")]
            if pr:
                lines.append(f"\nFitted prices [uncached_in, cached_in, out] per token (fit_iso, first seed): "
                             f"{[f'{x:.2e}' for x in pr[0]['fit_iso']]}; out/uncached ratio "
                             f"{ms([p['fit_iso'][2] / p['fit_iso'][0] for p in pr if p['fit_iso'][0] > 0])}")
    lines.append("\n## Chat-tenant latency externality and agent cache hits\n")
    lines.append("| KV level | coalition | busy s | energy J | preemptions | chat TTFT p50 s | chat TTFT p95 s | chat TPOT p50 s | chat TPOT p95 s | agent hit (turns ≥1) | agent uncached input (k tok) | agent API-style bill (k units) |")
    lines.append("|---|---|---|---|---|---|---|---|---|---|---|---|")
    order = ["chat", "docs", "agent", "chat+docs", "chat+agent", "docs+agent", "chat+docs+agent"]
    for level in sorted({r["level"] for r in lat}):
        for k in order:
            rs = [r for r in lat if r["level"] == level and r["coalition"] == k]
            if not rs:
                continue
            g = lambda f: ms([r[f] for r in rs])
            lines.append(f"| {level} | {k} | {g('busy_s')} | {g('energy_J')} | {g('preemptions')} | {g('chat_ttft_p50')} | "
                         f"{g('chat_ttft_p95')} | {g('chat_tpot_p50')} | {g('chat_tpot_p95')} | {g('agent_hit')} | {g('agent_uncached_k')} | {g('agent_api_bill_k')} |")
    temps = [r["temp_c"] for r in runs]
    lines.append(f"\nGPU temperature range across runs: {min(temps)}–{max(temps)} °C; "
                 f"SM clock range: {min(r['sm_clock_mhz'] for r in runs)}–{max(r['sm_clock_mhz'] for r in runs)} MHz.")
    ec = [(r["energy_J"], r["energy_counter_J"]) for r in runs if r.get("energy_counter_J")]
    if ec:
        lines.append(f"NVML total-energy counter available; counter/idle-subtracted ratio median "
                     f"{st.median(c / e for e, c in ec if e > 0):.2f} (counter includes idle power).")
    (outdir / "summary.md").write_text("\n".join(lines) + "\n")


def figures(res, lat, figdir):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.rcParams.update({"font.size": 10, "axes.edgecolor": GRID, "axes.labelcolor": INK2,
                         "xtick.color": INK2, "ytick.color": INK2, "axes.titlecolor": INK})
    methods = [("tokens", "Plain tokens"), ("api_price", "API-style price"), ("fit_iso", "Fitted 3-rate price"),
               ("fit_oracle", "Oracle 3-rate price"), ("isolated", "Isolated replay"),
               ("loo", "Leave-one-out"), ("kv_gib_s", "KV GiB·s"), ("shapley", "Shapley (reference)")]
    if SIMPLE:
        methods = [(m, SIMPLE_LABELS.get(m, lab).replace("\n", " ")) for m, lab in methods if m != "fit_oracle"]
    for level in sorted({l for l, _ in res}):
        items = [a for (l, _), a in sorted(res.items()) if l == level]
        fig, axes = plt.subplots(1, 3, figsize=(11, 3.6), sharey=True)
        for ax, t in zip(axes, TENANTS):
            ys = np.arange(len(methods))[::-1]
            for y, (m, _) in zip(ys, methods):
                vals = [100 * a["shares"][m][t] for a in items if m in a["shares"]]
                if not vals:
                    continue
                mu = st.mean(vals)
                sd = st.stdev(vals) if len(vals) > 1 else 0
                ax.barh(y, mu, height=0.6, color=COLORS[t], alpha=1.0 if m == "shapley" else 0.55)
                ax.errorbar(mu, y, xerr=sd, color=INK2, lw=1, capsize=2)
                ax.text(mu + sd + 1, y, f"{mu:.0f}", va="center", fontsize=8, color=INK2)
            ref = st.mean(100 * a["shares"]["shapley"][t] for a in items)
            ax.axvline(ref, color=INK, lw=1, ls="--")
            ax.set_title(t, loc="left", fontsize=11)
            ax.set_xlim(0, 100)
            ax.grid(axis="x", color=GRID, lw=0.6)
            ax.set_axisbelow(True)
            ax.set_yticks(ys, [lab for _, lab in methods])
            ax.set_xlabel("share of full-coalition busy time (%)")
            for s in ("top", "right"):
                ax.spines[s].set_visible(False)
        if not NO_TITLES:
            fig.suptitle(f"Tenant cost share by allocation method, KV level '{level}' (dashed = Shapley on busy time)",
                         x=0.01, ha="left", fontsize=11, color=INK)
        fig.tight_layout()
        fig.savefig(figdir / f"shares_{level}.png", dpi=150)
        plt.close(fig)

    order = ["chat", "chat+agent", "chat+docs", "chat+docs+agent"]
    levels = [l for l in ("roomy", "tight", "vtight") if any(r["level"] == l for r in lat)]
    fig, axes = plt.subplots(1, len(levels), figsize=(4.5 * len(levels), 3.2), sharey=True, squeeze=False)
    for ax, level in zip(axes[0], levels):
        mu = []
        for k in order:
            v = [r["chat_ttft_p95"] for r in lat if r["level"] == level and r["coalition"] == k and r["chat_ttft_p95"] is not None]
            mu.append(st.mean(v) if v else 0)
        ax.scatter(range(len(order)), mu, s=60, color=COLORS["chat"], zorder=3)
        for i, m in enumerate(mu):
            ax.annotate(f"{m:.2f} s", (i, m), textcoords="offset points", xytext=(0, 8), ha="center", fontsize=8, color=INK2)
        ax.set_xlim(-0.5, len(order) - 0.5)
        ax.set_ylim(0.05, 15)
        ax.set_xticks(range(len(order)), [o.replace("+", "\n+") for o in order], fontsize=8)
        ax.set_title(f"KV level '{level}'", loc="left", fontsize=10)
        ax.set_ylabel("chat TTFT p95 (s, log scale)")
        ax.set_yscale("log")
        ax.grid(axis="y", color=GRID, lw=0.6)
        ax.set_axisbelow(True)
        for s in ("top", "right"):
            ax.spines[s].set_visible(False)
    if not NO_TITLES:
        fig.suptitle("Chat tenant's p95 time-to-first-token depending on who else is served", x=0.01, ha="left", fontsize=11)
    fig.tight_layout()
    fig.savefig(figdir / "chat_ttft.png", dpi=150)
    plt.close(fig)

    order = ["agent", "chat+agent", "docs+agent", "chat+docs+agent"]
    fig, axes = plt.subplots(1, len(levels), figsize=(4.5 * len(levels), 3.2), sharey=True, squeeze=False)
    for ax, level in zip(axes[0], levels):
        mu = []
        for k in order:
            v = [r["agent_api_bill_k"] for r in lat if r["level"] == level and r["coalition"] == k and r["agent_api_bill_k"] is not None]
            mu.append(st.mean(v) if v else 0)
        base = mu[0] or 1
        ax.bar(range(len(order)), mu, width=0.6, color=COLORS["agent"])
        for i, m in enumerate(mu):
            ax.text(i, m, f"{m / base:.2f}×", ha="center", va="bottom", fontsize=8, color=INK2)
        ax.set_xticks(range(len(order)), [o.replace("+", "\n+") for o in order], fontsize=8)
        ax.set_title(f"KV level '{level}'", loc="left", fontsize=10)
        ax.set_ylabel("agent API-style bill (k units)")
        ax.grid(axis="y", color=GRID, lw=0.6)
        ax.set_axisbelow(True)
        for s_ in ("top", "right"):
            ax.spines[s_].set_visible(False)
    if not NO_TITLES:
        fig.suptitle("Agent's bill under cache-discounted token pricing (identical agent tokens; labels = × agent alone)",
                     x=0.01, ha="left", fontsize=11)
    fig.tight_layout()
    fig.savefig(figdir / "agent_bill.png", dpi=150)
    plt.close(fig)


def nl1_figure(res, figdir, metric_label, fname):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    methods = [("tokens", "Plain\ntokens"), ("api_price", "API-style\nprice"), ("fit_iso", "Fitted\n3-rate price"),
               ("fit_oracle", "Oracle\n3-rate price"), ("isolated", "Isolated\nreplay"), ("loo", "Leave-\none-out"),
               ("kv_gib_s", "KV\nGiB·s")]
    scale = 50.0 if SIMPLE else 1.0  # L1 / 2 = fraction of cost billed to the wrong tenant
    if SIMPLE:
        methods = [(m, SIMPLE_LABELS.get(m, lab)) for m, lab in methods if m != "fit_oracle"]
    levels = [l for l in ("roomy", "tight", "vtight") if any(l == k[0] for k in res)]
    ramp = {"roomy": "#86b6ef", "tight": "#3987e5", "vtight": "#184f95"}  # ordinal blue ramp, light -> dark
    names = {"roomy": "roomy KV (~104k tok)", "tight": "tight KV (22.4k tok)", "vtight": "very tight KV (13.6k tok)"}
    fig, ax = plt.subplots(figsize=(10, 3.8))
    w = 0.8 / len(levels)
    for j, level in enumerate(levels):
        items = [a for (l, _), a in res.items() if l == level]
        mus, sds = [], []
        for m, _ in methods:
            d = [scale * l1(a["shares"][m], a["shares"]["shapley"]) for a in items if m in a["shares"]]
            mus.append(st.mean(d)); sds.append(st.stdev(d) if len(d) > 1 else 0)
        xs = np.arange(len(methods)) + (j - (len(levels) - 1) / 2) * w
        ax.bar(xs, mus, width=w * 0.92, color=ramp[level], label=names[level], yerr=sds,
               error_kw=dict(ecolor=INK2, lw=0.8, capsize=2))
    ax.set_xticks(np.arange(len(methods)), [lab for _, lab in methods], fontsize=9)
    ax.set_ylabel("% of GPU time billed to the wrong tenant" if SIMPLE else f"normalised L1 vs Shapley ({metric_label})")
    ax.grid(axis="y", color=GRID, lw=0.6)
    ax.set_axisbelow(True)
    for s_ in ("top", "right"):
        ax.spines[s_].set_visible(False)
    ax.set_ylim(0, 45 if SIMPLE else 0.9)
    ax.legend(frameon=False, fontsize=9, loc="upper center", ncol=3)
    if not NO_TITLES:
        ax.set_title("Attribution error of each billing method (lower = closer to the Shapley reference; 0 = identical)",
                     loc="left", fontsize=11, color=INK)
    fig.tight_layout()
    fig.savefig(figdir / fname, dpi=150)
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", default="results/runs.jsonl")
    args = ap.parse_args()
    runs, by = load(args.runs)
    outdir = Path(args.runs).parent
    # laptop results keep using figures/; any other results file gets its own figures folder next to it
    default_fig = "figures" if args.runs == ap.get_default("runs") else outdir / "figures"
    figdir = Path(os.environ.get("FIGDIR", default_fig))
    figdir.mkdir(parents=True, exist_ok=True)
    res = {m: analyze(by, m) for m in ("busy_s", "energy_ctr_dyn_J")}
    lat = latency_and_cache(by)
    report(res, lat, runs, outdir)
    figures(res["busy_s"], lat, figdir)
    nl1_figure(res["busy_s"], figdir, "busy time", "nl1_busy.png")
    nl1_figure(res["energy_ctr_dyn_J"], figdir, "dynamic energy", "nl1_energy.png")
    serial = {m: {f"{l}/s{s}": {"v": a["v"], "phi": a["phi"], "shares": a["shares"], "prices": a.get("prices")}
                  for (l, s), a in r.items()} for m, r in res.items()}
    (outdir / "summary.json").write_text(json.dumps(serial, indent=1, default=float))
    print((outdir / "summary.md").read_text())


if __name__ == "__main__":
    main()
