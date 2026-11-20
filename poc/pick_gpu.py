"""Pick the least-used GPU(s) on a shared node and print their UUIDs, comma-separated.

Watches every GPU for --sample-s seconds and keeps those with enough free memory for vLLM
(--need-frac of total, plus a small margin) and mean utilisation at or below --max-util. Ranks them
by mean utilisation, then number of other processes, then memory in use. If none qualifies, it
re-checks every 30 s for up to --wait-max-s seconds, then exits with status 1.

--only restricts the choice to GPUs an admin has assigned (indices or UUIDs, as in CUDA_VISIBLE_DEVICES);
the others are still shown for context but never picked.

Usage: export CUDA_VISIBLE_DEVICES=$(python pick_gpu.py --n 1 --need-frac 0.32 --max-util 5)
"""

import argparse
import sys
import time

import pynvml


def uuid(h) -> str:
    u = pynvml.nvmlDeviceGetUUID(h)
    return u.decode() if isinstance(u, bytes) else u


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=1, help="number of GPUs wanted")
    ap.add_argument("--need-frac", type=float, required=True, help="vLLM --gpu-mem-util; this fraction must be free")
    ap.add_argument("--margin-frac", type=float, default=0.03)
    ap.add_argument("--max-util", type=float, default=100.0,
                    help="skip GPUs whose mean utilisation over the sample is above this (percent)")
    ap.add_argument("--sample-s", type=float, default=10.0)
    ap.add_argument("--wait-max-s", type=float, default=1800.0)
    ap.add_argument("--only", default="",
                    help="comma-separated GPU indices or UUIDs to choose from (e.g. an admin-assigned CUDA_VISIBLE_DEVICES)")
    args = ap.parse_args()

    pynvml.nvmlInit()
    hs = [pynvml.nvmlDeviceGetHandleByIndex(i) for i in range(pynvml.nvmlDeviceGetCount())]
    allowed = set(range(len(hs)))
    if args.only.strip():
        by_uuid = {uuid(h): i for i, h in enumerate(hs)}
        allowed = set()
        for x in (t.strip() for t in args.only.split(",") if t.strip()):
            i = by_uuid.get(x) if not x.isdigit() else int(x)
            if i is None or not 0 <= i < len(hs):
                sys.exit(f"--only: no GPU {x!r} on this node")
            allowed.add(i)
        print(f"choosing only from assigned GPU(s) {sorted(allowed)}", file=sys.stderr)
    deadline = time.time() + args.wait_max_s
    first = True
    while True:
        util = [0.0] * len(hs)
        k = 0
        end = time.time() + args.sample_s
        while time.time() < end:
            for i, h in enumerate(hs):
                util[i] += pynvml.nvmlDeviceGetUtilizationRates(h).gpu
            k += 1
            time.sleep(0.5)
        cands, cells = [], []
        for i, h in enumerate(hs):
            mem = pynvml.nvmlDeviceGetMemoryInfo(h)
            try:
                nproc = len(pynvml.nvmlDeviceGetComputeRunningProcesses(h))
            except pynvml.NVMLError:
                nproc = 0
            u = util[i] / k
            mem_ok = mem.free / mem.total >= args.need_frac + args.margin_frac
            ok = mem_ok and u <= args.max_util and i in allowed
            if first:  # full table on the first check, then one compact line per re-check
                why = ("ok" if ok else "not assigned" if i not in allowed
                       else "not enough free memory" if not mem_ok else f"busy (over {args.max_util:g}%)")
                print(f"  GPU {i}: util {u:5.1f}%  {nproc:2d} processes  "
                      f"{mem.used / 2**30:5.1f}/{mem.total / 2**30:.0f} GiB used  {why}", file=sys.stderr)
            cells.append(f"{i}:{u:.0f}%/{mem.free / 2**30:.0f}G{'*' if ok else ''}")
            if ok:
                cands.append((u, nproc, mem.used, i))
        if not first:
            print(f"  {time.strftime('%H:%M:%S')} util/free GiB per GPU (* = usable): {'  '.join(cells)}", file=sys.stderr)
        cands.sort()
        if len(cands) >= args.n:
            chosen = [c[3] for c in cands[: args.n]]
            print(f"picked GPU(s) {chosen}", file=sys.stderr)
            print(",".join(uuid(hs[i]) for i in chosen))
            return
        if time.time() >= deadline:
            scope = f" of assigned GPU(s) {sorted(allowed)}" if len(allowed) < len(hs) else ""
            sys.exit(f"Only {len(cands)} GPU(s){scope} have {args.need_frac:.0%} memory free and at most "
                     f"{args.max_util:g}% utilisation; needed {args.n}. Giving up.")
        if first:
            print(f"Only {len(cands)} suitable GPU(s); re-checking every 30 s for up to {args.wait_max_s / 60:.0f} min",
                  file=sys.stderr)
        first = False
        time.sleep(30)


if __name__ == "__main__":
    main()
