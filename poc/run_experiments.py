"""Replay every tenant coalition on one vLLM engine and record cost measurements.

For each KV-capacity level, one engine is started and each non-empty subset S of
{chat, docs, agent} is replayed with identical per-tenant requests and arrival times.
Recorded per run:
  busy_s      sum of engine.step() wall durations (GPU work + engine CPU overhead)
  energy_J        dynamic GPU energy from 10 ms power polling, integral of max(P - P_idle, 0)
  energy_ctr_dyn_J  NVML total-energy counter delta minus idle power x makespan (used in analysis)
  per-request arrival / first-token / finish times, cached tokens, logical KV GiB-s

Shared GPUs (e.g. the RU cluster): other users' work on the same GPU inflates busy time and
energy. Each replay is therefore guarded:
  before   wait until the GPU's utilisation has averaged at most --quiet-util % (default 0: every sample 0%)
           over --quiet-s seconds (our engine is idle then, so any utilisation is someone else's)
  during   sample other processes on the GPU and their SM utilisation every 0.5 s
  after    re-check utilisation for 2 s (same average limit)
A nonzero --quiet-util tolerates a light neighbour's brief spikes, which would otherwise fail every check.
A replay that fails any check is written with contaminated=true and retried (--max-attempts).
analyze.py ignores contaminated rows. Rows already measured cleanly in --out are skipped, so a job
killed by its walltime can simply be resubmitted.

Usage:
  laptop PoC:  python run_experiments.py --seeds 0 1 2 3 --kv-levels roomy
  A100:        python run_experiments.py --model Qwen/Qwen2.5-7B-Instruct --dtype bfloat16 \\
                   --gpu-mem-util 0.32 --kv-levels roomy --out results/qwen2.5-7b-instruct/runs.jsonl
"""

import os

# Make CUDA device numbering match nvidia-smi / NVML. Must be set before torch is imported.
os.environ.setdefault("CUDA_DEVICE_ORDER", "PCI_BUS_ID")

import argparse
import itertools
import json
import random
import socket
import sys
import threading
import time
from collections import deque
from pathlib import Path

import psutil
import pynvml
from vllm import LLM, SamplingParams
from vllm.inputs import TokensPrompt

from workload import TENANTS, VOCAB_HIGH, make_workload

MODEL = "Qwen/Qwen2.5-0.5B-Instruct"  # laptop PoC default; override with --model
BLOCK_SIZE = 16
# KV-cache blocks of 16 tokens. roomy = what the laptop run got (105,632 tokens, never preempted); fixing it gives every
# GPU and model the same KV capacity, and keeps vLLM's memory small enough to fit next to other users on a shared GPU.
KV_LEVELS = {"roomy": 6602, "tight": 1400, "vtight": 850}
KV_BYTES_PER_TOKEN = None  # set in main() from the model config (12,288 for Qwen2.5-0.5B in fp16)


def model_kv_info(model: str, dtype: str) -> tuple[int, int]:
    """Logical KV bytes per token (2 x layers x KV heads x head_dim x element size) and vocab size."""
    from transformers import AutoConfig

    c = AutoConfig.from_pretrained(model)
    c = getattr(c, "text_config", c)
    head_dim = getattr(c, "head_dim", None) or c.hidden_size // c.num_attention_heads
    kv_heads = getattr(c, "num_key_value_heads", None) or c.num_attention_heads
    elt = 1 if "fp8" in dtype else 2
    return 2 * c.num_hidden_layers * kv_heads * head_dim * elt, c.vocab_size


def gpu_handles(n: int) -> list:
    """NVML handles for the GPUs vLLM will use. NVML ignores CUDA_VISIBLE_DEVICES, so map it explicitly."""
    vis = os.environ.get("CUDA_VISIBLE_DEVICES", "").strip()
    ids = [x.strip() for x in vis.split(",") if x.strip()] if vis else [str(i) for i in range(pynvml.nvmlDeviceGetCount())]
    if len(ids) < n:
        sys.exit(f"Need {n} GPU(s) but CUDA_VISIBLE_DEVICES={vis!r} exposes {len(ids)}")
    hs = []
    for x in ids[:n]:
        if x.startswith(("GPU-", "MIG-")):
            hs.append(pynvml.nvmlDeviceGetHandleByUUID(x.encode()))
        else:
            hs.append(pynvml.nvmlDeviceGetHandleByIndex(int(x)))
    return hs


def gpu_uuid(h) -> str:
    u = pynvml.nvmlDeviceGetUUID(h)
    return u.decode() if isinstance(u, bytes) else u


def own_pids() -> set[int]:
    """This process and its descendants (vLLM's EngineCore and any tensor-parallel workers)."""
    me = psutil.Process()
    return {me.pid} | {c.pid for c in me.children(recursive=True)}


def foreign_procs(handles, own: set[int]) -> dict[int, int]:
    """Other processes holding a compute context on our GPUs: pid -> used MiB."""
    out: dict[int, int] = {}
    for h in handles:
        try:
            procs = pynvml.nvmlDeviceGetComputeRunningProcesses(h)
        except pynvml.NVMLError:
            continue
        for p in procs:
            if p.pid not in own:
                out[p.pid] = out.get(p.pid, 0) + (p.usedGpuMemory or 0) // 2**20
    return out


def max_util(handles) -> int:
    return max(pynvml.nvmlDeviceGetUtilizationRates(h).gpu for h in handles)


def wait_for_quiet(handles, quiet_s: float, max_wait_s: float, threshold: float) -> tuple[bool, float, float]:
    """Block until our GPUs' utilisation has averaged <= threshold over the last quiet_s seconds.

    Called while our engine is idle, so utilisation here is other users' work (plus, for the first
    ~1 s, the tail of our previous replay). With threshold 0 every sample in the window must be 0%;
    a small threshold lets a light neighbour's brief spikes through but not sustained work.
    Returns (became quiet, seconds waited, mean utilisation over the last window).
    """
    t0 = time.perf_counter()
    window: deque = deque()  # (time, utilisation); the oldest sample is at or before now - quiet_s
    while True:
        now = time.perf_counter()
        window.append((now, max_util(handles)))
        while len(window) > 1 and window[1][0] <= now - quiet_s:
            window.popleft()
        mean = sum(u for _, u in window) / len(window)
        if now - window[0][0] >= quiet_s and mean <= threshold:
            return True, now - t0, mean
        if now - t0 >= max_wait_s:
            return False, now - t0, mean
        time.sleep(0.2)


class GpuMonitor:
    """Background sampler over the GPUs this run uses.

    Every period_s: total power over all GPUs, for dynamic energy (as in the laptop PoC).
    Every proc_period_s: other processes on those GPUs and, where NVML supports it, their SM utilisation.
    """

    def __init__(self, handles, own: set[int], period_s: float = 0.01, proc_period_s: float = 0.5):
        self.hs = handles
        self.own = own
        self.period = period_s
        self.proc_period = proc_period_s
        self.samples: list[tuple[float, float]] = []
        self.foreign_seen: dict[int, int] = {}
        self.foreign_sm_max = 0
        self.foreign_sm_total = 0  # sum of other processes' SM % over NVML's sampling periods
        self._periods: set = set()  # (gpu, NVML timestamp) of every period sampled, for the mean
        self.proc_util_supported = None
        self._last_ts = [0] * len(handles)
        self._stop = threading.Event()
        self._t = None

    def _check_procs(self):
        for pid, mib in foreign_procs(self.hs, self.own).items():
            self.foreign_seen[pid] = max(self.foreign_seen.get(pid, 0), mib)
        if self.proc_util_supported is False:
            return
        for i, h in enumerate(self.hs):
            try:
                samples = pynvml.nvmlDeviceGetProcessUtilization(h, self._last_ts[i])
                self.proc_util_supported = True
            except pynvml.NVMLError_NotSupported:
                self.proc_util_supported = False
                return
            except pynvml.NVMLError:
                continue  # NOT_FOUND: no process samples in this interval
            for s in samples:
                self._last_ts[i] = max(self._last_ts[i], s.timeStamp)
                self._periods.add((i, s.timeStamp))
                if s.pid not in self.own:
                    self.foreign_sm_max = max(self.foreign_sm_max, s.smUtil)
                    self.foreign_sm_total += s.smUtil

    @property
    def foreign_sm_mean(self) -> float:
        """Approximate mean SM % used by other processes during the replay. Our engine is active in nearly
        every NVML sampling period, so the periods we saw stand in for the replay's duration."""
        return self.foreign_sm_total / max(len(self._periods), 1)

    def _run(self):
        next_proc = 0.0
        while not self._stop.is_set():
            t = time.perf_counter()
            self.samples.append((t, sum(pynvml.nvmlDeviceGetPowerUsage(h) for h in self.hs) / 1000.0))
            if t >= next_proc:
                self._check_procs()
                next_proc = t + self.proc_period
            time.sleep(self.period)

    def _prime(self):
        """Only count process-utilisation samples from now on, using NVML's own timestamps where possible."""
        for i, h in enumerate(self.hs):
            self._last_ts[i] = int(time.time() * 1e6)  # NVML documents CPU-epoch microseconds
            try:
                samples = pynvml.nvmlDeviceGetProcessUtilization(h, 0)
                if samples:
                    self._last_ts[i] = max(s.timeStamp for s in samples)
            except pynvml.NVMLError:
                pass

    def start(self):
        self.samples.clear()
        self.foreign_seen.clear()
        self.foreign_sm_max = 0
        self.foreign_sm_total = 0
        self._periods.clear()
        self._prime()
        self._stop.clear()
        self._t = threading.Thread(target=self._run, daemon=True)
        self._t.start()

    def stop(self):
        self._stop.set()
        self._t.join()

    def dynamic_energy(self, idle_w: float) -> float:
        e = 0.0
        for (t0, p0), (t1, _) in zip(self.samples, self.samples[1:]):
            e += max(p0 - idle_w, 0.0) * (t1 - t0)
        return e


def energy_counter_j(handles):
    try:
        return sum(pynvml.nvmlDeviceGetTotalEnergyConsumption(h) for h in handles) / 1000.0
    except pynvml.NVMLError:
        return None


def measure_idle_power(handles, seconds: float = 5.0) -> float:
    vals = []
    end = time.perf_counter() + seconds
    while time.perf_counter() < end:
        vals.append(sum(pynvml.nvmlDeviceGetPowerUsage(h) for h in handles) / 1000.0)
        time.sleep(0.02)
    vals.sort()
    return vals[len(vals) // 2]


def get_counter(llm: LLM, name: str) -> float:
    try:
        for m in llm.get_metrics():
            if m.name == name:
                return float(getattr(m, "value", 0.0))
    except Exception:
        pass
    return float("nan")


def replay(llm: LLM, wl, coalition: tuple[str, ...], tag: str) -> dict:
    """Serve the coalition's requests with their original arrival times; return measurements."""
    engine = llm.llm_engine
    pending = []  # (arrival_time, req_id, tenant, prompt, max_tokens, agent_state)
    if "chat" in coalition:
        pending += [(r.arrival, r.rid, "chat", r.prompt, r.max_tokens, None) for r in wl.chat]
    if "docs" in coalition:
        pending += [(r.arrival, r.rid, "docs", r.prompt, r.max_tokens, None) for r in wl.docs]
    if "agent" in coalition:
        for s in wl.agent:
            pending.append((s.start, f"{s.sid}-t0", "agent", list(s.base_prompt), s.max_tokens, (s, 0)))
    pending.sort(key=lambda x: x[0])

    recs: dict[str, dict] = {}
    busy = 0.0
    steps = 0
    t0 = time.perf_counter()

    def now():
        return time.perf_counter() - t0

    while pending or engine.has_unfinished_requests():
        t = now()
        while pending and pending[0][0] <= t:
            arr, rid, tenant, prompt, mx, agent_state = pending.pop(0)
            full_id = f"{tag}/{rid}"
            recs[full_id] = dict(
                tenant=tenant, rid=rid, arrival=arr, added=t, prompt_len=len(prompt), max_tokens=mx,
                first_token=None, finish=None, n_out=0, cached=None, kv_gib_s=0.0,
                prompt=prompt, agent_state=agent_state,
            )
            engine.add_request(
                full_id,
                TokensPrompt(prompt_token_ids=prompt, cache_salt=tenant),
                SamplingParams(max_tokens=mx, ignore_eos=True, temperature=0.0),
            )
        if not engine.has_unfinished_requests():
            # idle: wait for next arrival (not counted as busy)
            time.sleep(max(0.0, min(pending[0][0] - now(), 0.05)))
            continue
        s0 = time.perf_counter()
        outs = engine.step()
        dt = time.perf_counter() - s0
        busy += dt
        steps += 1
        t_done = now()
        for o in outs:
            rec = recs[o.request_id]
            n = len(o.outputs[0].token_ids)
            if n > 0 and rec["first_token"] is None:
                rec["first_token"] = t_done
                rec["cached"] = o.num_cached_tokens
            rec["n_out"] = n
            # logical KV residency: current context (prompt + generated) held during this step
            rec["kv_gib_s"] += (rec["prompt_len"] + n) * KV_BYTES_PER_TOKEN / 2**30 * dt
            if o.finished:
                rec["finish"] = t_done
                st = rec["agent_state"]
                if st is not None:
                    sess, k = st
                    if k + 1 <= len(sess.appends):
                        nxt = rec["prompt"] + list(o.outputs[0].token_ids) + sess.appends[k]
                        pending.append((
                            t_done + sess.tool_delays[k], f"{sess.sid}-t{k + 1}", "agent",
                            nxt, sess.max_tokens, (sess, k + 1),
                        ))
                        pending.sort(key=lambda x: x[0])
    makespan = now()
    for r in recs.values():
        r.pop("prompt")
        r.pop("agent_state")
    return dict(busy_s=busy, makespan_s=makespan, steps=steps, requests=list(recs.values()))


def run_key(model, level, seed, coalition, rep):
    return (model, level, seed, "+".join(coalition), rep)


def already_done(path: str) -> set:
    """Clean measurements already in the output file (for resuming after a walltime kill)."""
    done = set()
    if Path(path).exists():
        for line in open(path):
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue  # a line cut off when the job was killed
            if not r.get("contaminated"):
                done.add(run_key(r.get("model", MODEL), r["kv_level"], r["seed"], r["coalition"], r["repeat"]))
    return done


def main():
    global KV_BYTES_PER_TOKEN
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, nargs="+", default=[0, 1, 2])
    ap.add_argument("--kv-levels", nargs="+", default=["roomy", "tight"])
    ap.add_argument("--window", type=float, default=60.0)
    ap.add_argument("--repeat-grand", type=int, default=1, help="extra replays of the full coalition (noise floor)")
    ap.add_argument("--out", default="results/runs.jsonl")
    ap.add_argument("--only", nargs="*", help="restrict to these coalitions, e.g. chat+docs")
    # model / engine
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--dtype", default="float16", help="float16 (laptop PoC) or bfloat16 (A100)")
    ap.add_argument("--gpu-mem-util", type=float, default=0.80,
                    help="fraction of each GPU's memory vLLM may take; on a shared GPU this much must be free")
    ap.add_argument("--tp", type=int, default=1, help="tensor-parallel GPUs")
    # contamination control
    ap.add_argument("--quiet-s", type=float, default=3.0, help="seconds of quiet required before a replay")
    ap.add_argument("--quiet-util", type=float, default=0,
                    help="mean utilisation %% still counted as quiet, before (over --quiet-s) and after (over 2 s) "
                         "a replay; 0 = every sample must be 0%%")
    ap.add_argument("--max-wait-s", type=float, default=300.0, help="longest wait for a quiet GPU before a replay")
    ap.add_argument("--foreign-sm-threshold", type=int, default=0,
                    help="other processes' peak SM utilisation %% above which a replay counts as contaminated")
    ap.add_argument("--foreign-sm-mean-threshold", type=float, default=None,
                    help="also flag a replay when other processes' mean SM %% over it exceeds this (off by default)")
    ap.add_argument("--max-attempts", type=int, default=3, help="tries per replay before giving up on it")
    ap.add_argument("--give-up-after", type=int, default=8,
                    help="abort after this many contaminated attempts in a row (GPU too busy; resubmit later)")
    ap.add_argument("--no-resume", action="store_true", help="re-measure runs already in --out")
    ap.add_argument("--check-done", action="store_true",
                    help="only check --out: exit 0 if every requested run is already measured cleanly, else 1 "
                         "(run.pbs calls this before waiting for a GPU)")
    args = ap.parse_args()

    coalitions = [c for k in range(1, 4) for c in itertools.combinations(TENANTS, k)]
    if args.only:
        coalitions = [c for c in coalitions if "+".join(c) in args.only]

    def todo(level):
        return [(seed, c, 0) for seed in args.seeds for c in coalitions] + \
               [(seed, tuple(TENANTS), r + 1) for seed in args.seeds for r in range(args.repeat_grand)]

    if args.check_done:
        done = already_done(args.out)
        missing = sum(run_key(args.model, lv, s, c, r) not in done for lv in args.kv_levels for s, c, r in todo(lv))
        print(f"{missing} run(s) of {args.kv_levels} still to measure in {args.out}", flush=True)
        sys.exit(0 if missing == 0 else 1)

    KV_BYTES_PER_TOKEN, vocab = model_kv_info(args.model, args.dtype)
    if vocab < VOCAB_HIGH:
        sys.exit(f"{args.model} has a {vocab}-token vocabulary, but workload.py draws token IDs up to {VOCAB_HIGH}. "
                 "Use a Qwen2.5 model (same tokenizer as the PoC, so the workload stays identical) or lower VOCAB_HIGH.")

    pynvml.nvmlInit()
    hs = gpu_handles(args.tp)
    uuids = [gpu_uuid(h) for h in hs]
    print(f"model={args.model} dtype={args.dtype} tp={args.tp} gpus={uuids} host={socket.gethostname()} "
          f"kv_bytes/token={KV_BYTES_PER_TOKEN}", flush=True)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    done = set() if args.no_resume else already_done(args.out)

    streak = 0  # contaminated attempts in a row
    n_clean = n_dirty = 0
    for level in args.kv_levels:
        if all(run_key(args.model, level, s, c, r) in done for s, c, r in todo(level)):
            print(f"{level}: all runs already measured, skipping", flush=True)
            continue
        llm = LLM(
            model=args.model,
            dtype=args.dtype,
            gpu_memory_utilization=args.gpu_mem_util,
            tensor_parallel_size=args.tp,
            max_model_len=min(16384, (KV_LEVELS[level] - 2) * BLOCK_SIZE) if KV_LEVELS[level] else 16384,
            enable_prefix_caching=True,
            block_size=BLOCK_SIZE,
            num_gpu_blocks_override=KV_LEVELS[level],
            seed=0,
            disable_log_stats=False,
        )
        cfg = llm.llm_engine.vllm_config
        num_blocks = cfg.cache_config.num_gpu_blocks
        max_batched = cfg.scheduler_config.max_num_batched_tokens

        # warmup (discarded)
        replay(llm, make_workload(999, window_s=10.0, agent_sessions=1), ("chat", "docs", "agent"), f"{level}/warm")
        llm.reset_prefix_cache()
        own = own_pids()

        for seed in args.seeds:
            wl = make_workload(seed, window_s=args.window)
            plan = [(c, 0) for c in coalitions] + [(tuple(TENANTS), r + 1) for r in range(args.repeat_grand)]
            random.Random(1000 + seed).shuffle(plan)  # randomise order against thermal drift
            for coalition, rep in plan:
                if run_key(args.model, level, seed, coalition, rep) in done:
                    continue
                for attempt in range(args.max_attempts):
                    llm.reset_prefix_cache()
                    quiet, waited, util_before = wait_for_quiet(hs, args.quiet_s, args.max_wait_s, args.quiet_util)
                    idle_w = measure_idle_power(hs, 3.0)
                    pre = get_counter(llm, "vllm:num_preemptions")
                    before = foreign_procs(hs, own)
                    mon = GpuMonitor(hs, own)
                    e0 = energy_counter_j(hs)
                    mon.start()
                    tag = f"{level}/s{seed}/{'+'.join(coalition)}/r{rep}/a{attempt}"
                    res = replay(llm, wl, coalition, tag)
                    mon.stop()
                    e1 = energy_counter_j(hs)
                    # after: skip ~1 s so the utilisation counter no longer covers our own last kernels
                    time.sleep(1.2)
                    post = []
                    end = time.perf_counter() + 2.0
                    while time.perf_counter() < end:
                        post.append(max_util(hs))
                        time.sleep(0.2)
                    post_mean = sum(post) / len(post)

                    new_pids = sorted(set(mon.foreign_seen) - set(before))
                    reasons = []
                    if not quiet:
                        reasons.append("busy_before")
                    if mon.foreign_sm_max > args.foreign_sm_threshold:
                        reasons.append("foreign_sm_during")
                    if args.foreign_sm_mean_threshold is not None and mon.foreign_sm_mean > args.foreign_sm_mean_threshold:
                        reasons.append("foreign_sm_mean")
                    if new_pids:
                        reasons.append("new_foreign_process")
                    if post_mean > args.quiet_util:
                        reasons.append("busy_after")

                    res.update(
                        model=args.model, dtype=args.dtype, tp=args.tp, gpu_uuids=uuids, host=socket.gethostname(),
                        kv_level=level, num_gpu_blocks=num_blocks, max_num_batched_tokens=max_batched,
                        seed=seed, coalition=list(coalition), repeat=rep, window_s=args.window, attempt=attempt,
                        idle_w=idle_w, energy_J=mon.dynamic_energy(idle_w),
                        energy_counter_J=(e1 - e0) if e0 is not None and e1 is not None else None,
                        energy_ctr_dyn_J=(e1 - e0 - idle_w * res["makespan_s"]) if e0 is not None and e1 is not None else None,
                        mean_power_w=sum(p for _, p in mon.samples) / max(len(mon.samples), 1),
                        preemptions=get_counter(llm, "vllm:num_preemptions") - pre,
                        sm_clock_mhz=pynvml.nvmlDeviceGetClockInfo(hs[0], pynvml.NVML_CLOCK_SM),
                        temp_c=pynvml.nvmlDeviceGetTemperature(hs[0], pynvml.NVML_TEMPERATURE_GPU),
                        # contamination evidence
                        contaminated=bool(reasons), contamination=reasons, quiet_wait_s=waited,
                        foreign_procs_before=len(before), foreign_mib_before=sum(before.values()),
                        foreign_new_pids=new_pids, foreign_sm_max=mon.foreign_sm_max,
                        foreign_sm_mean=round(mon.foreign_sm_mean, 3), foreign_sm_threshold=args.foreign_sm_threshold,
                        foreign_sm_mean_threshold=args.foreign_sm_mean_threshold,
                        proc_util_supported=mon.proc_util_supported, util_after_max=max(post),
                        util_after_mean=round(post_mean, 2), util_before_mean=round(util_before, 2),
                        quiet_util=args.quiet_util,
                        cpus_allowed=len(os.sched_getaffinity(0)), loadavg_1m=os.getloadavg()[0],
                    )
                    with open(args.out, "a") as f:
                        f.write(json.dumps(res) + "\n")
                    status = "CONTAMINATED " + ",".join(reasons) if reasons else "clean"
                    print(f"{tag}: busy={res['busy_s']:.2f}s makespan={res['makespan_s']:.1f}s "
                          f"E={res['energy_J']:.0f}J preempt={res['preemptions']} temp={res['temp_c']}C "
                          f"waited={waited:.0f}s foreign_sm max/mean={mon.foreign_sm_max}/{mon.foreign_sm_mean:.2f}% "
                          f"[{status}]", flush=True)
                    if reasons:
                        n_dirty += 1
                        streak += 1
                        if streak >= args.give_up_after:
                            print(f"Giving up: {streak} contaminated attempts in a row; the GPU is too busy. "
                                  "Resubmit later; clean runs are kept and will be skipped.", flush=True)
                            sys.exit(3)
                    else:
                        n_clean += 1
                        streak = 0
                        break
        del llm
        import gc, torch
        gc.collect()
        torch.cuda.empty_cache()
    print(f"done: {n_clean} clean, {n_dirty} contaminated attempts", flush=True)
    if n_dirty and not n_clean:
        sys.exit(3)  # nothing clean: fail, so PBS jobs chained with depend=afterok don't start


if __name__ == "__main__":
    os.environ.setdefault("VLLM_CONFIGURE_LOGGING", "0")
    main()
