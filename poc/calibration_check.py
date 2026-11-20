"""Can a token price be calibrated well enough under memory pressure? Uses the existing replays only (no GPU time).

The calibrated 3-rate price in analyze.py ("fit_iso") is fitted on each tenant running alone, and it degrades under
memory pressure (final_summary.md section 5.3). This script tests two fixes, leave-one-seed-out within each memory
level, exactly like fit_iso:
  calibration data   solo   each tenant alone (= fit_iso)
                     pairs  the three two-tenant runs: total cost ~ total tokens of the run
                     solo+pairs, all (solo + pairs + all three together)
  price form         3-rate [uncached in, cached in, out] per token
                     4-rate the same plus a price per KV-cache GiB-second the tenant held (a memory-time term)
An operator can collect any of these by running tenant mixes and metering totals; none of them needs Shapley values.
The held-out seed's bill = each tenant's tokens (and memory-time) in the shared run x the fitted prices; the error is
the normalised L1 distance to that seed's Shapley shares. "ceiling" fits the price directly to Shapley values.

Usage: python calibration_check.py   (from poc/)
"""

import statistics as st
from collections import defaultdict

import numpy as np
from scipy.optimize import nnls

import analyze as A

SETUPS = [("0.5B laptop", "results/runs.jsonl"), ("7B A100", "results/qwen2.5-7b-instruct/runs.jsonl"),
          ("14B A100", "results/qwen2.5-14b-instruct/runs.jsonl")]
LEVELS = ("roomy", "tight", "vtight")
SOURCES = {"solo": (1,), "pairs": (2,), "solo+pairs": (1, 2), "all": (1, 2, 3)}


def tenant_feats(run, four):
    """Per-tenant [uncached, cached, out(, KV GiB-s)] in one run."""
    f = {t: np.zeros(4) for t in A.TENANTS}
    for q in run["requests"]:
        c = q["cached"] or 0
        f[q["tenant"]] += [q["prompt_len"] - c, c, q["n_out"], q["kv_gib_s"]]
    return {t: (v if four else v[:3]) for t, v in f.items()}


def evaluate(by, metric):
    res = A.analyze(by, metric)  # Shapley per (level, seed), same as every other number in the summaries
    out = defaultdict(list)
    for (level, seed), a in res.items():
        train = [(s, cs) for (l, s), cs in by.items() if l == level and s != seed and (l, s) in res]
        grand = A.primary(by[(level, seed)][A.key(A.TENANTS)])
        for four in (False, True):
            form = "4-rate" if four else "3-rate"
            g = tenant_feats(grand, four)
            for src, sizes in SOURCES.items():
                X, y = [], []
                for _, cs in train:
                    for k, rs in cs.items():
                        if len(k.split("+")) in sizes:
                            r = A.primary(rs)
                            X.append(sum(tenant_feats(r, four).values()))
                            y.append(r[metric])
                p, _ = nnls(np.array(X), np.array(y))
                out[(level, form, src)].append(A.l1(A.norm({t: g[t] @ p for t in A.TENANTS}), a["shares"]["shapley"]))
            # ceiling: fit straight to the training seeds' Shapley values, with features from their shared runs
            X = [tenant_feats(A.primary(cs[A.key(A.TENANTS)]), four)[t] for _, cs in train for t in A.TENANTS]
            y = [res[(level, s)]["phi"][t] for s, _ in train for t in A.TENANTS]
            p, _ = nnls(np.array(X), np.array(y))
            out[(level, form, "ceiling")].append(A.l1(A.norm({t: g[t] @ p for t in A.TENANTS}), a["shares"]["shapley"]))
        out[(level, "check", "fit_iso")].append(A.l1(a["shares"]["fit_iso"], a["shares"]["shapley"]))
    return out


def main():
    for metric in ("busy_s", "energy_ctr_dyn_J"):
        print(f"\n=== error vs Shapley ({metric}), mean ± SD over 4 held-out seeds; columns roomy | tight | very tight")
        cells = defaultdict(list)  # (form, src) -> mean error of each setup x level cell
        for name, path in SETUPS:
            _, by = A.load(path)
            out = evaluate(by, metric)
            print(f"\n{name}")
            fmt = lambda k: " | ".join(f"{st.mean(out[(l, *k)]):.3f} ± {st.stdev(out[(l, *k)]):.3f}" for l in LEVELS)
            print(f"  {'(analyze.py fit_iso)':22s} {fmt(('check', 'fit_iso'))}")
            for form in ("3-rate", "4-rate"):
                for src in (*SOURCES, "ceiling"):
                    print(f"  {form + ' ' + src:22s} {fmt((form, src))}")
                    cells[(form, src)] += [(st.mean(out[(l, form, src)]), f"{name} {l}") for l in LEVELS]
        print(f"\n--- over all {len(cells[('3-rate', 'solo')])} setup x level cells ({metric}): mean / worst / cells above 0.1")
        for (form, src), v in cells.items():
            worst = max(v)
            print(f"  {form + ' ' + src:22s} {st.mean(e for e, _ in v):.3f} / {worst[0]:.3f} ({worst[1]}) / "
                  f"{sum(e > 0.1 for e, _ in v)}")


if __name__ == "__main__":
    main()
