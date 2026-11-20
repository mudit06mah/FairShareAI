# FairShareAI

Measuring how fairly the cost of a shared LLM inference server is divided among its tenants, and what a fair token price needs.

Major Project, INTGT M.Tech (CSE), Jaypee Institute of Information Technology, Noida, 2026–2027.
Team: Aditya Bansal, Sambhav Ghildiyal, Mudit Maheshwari. Supervisor: Dr. Pawan Upadhyay.

## What this is

Organisations that host their own LLMs usually split the GPU bill between teams by counting tokens. On an engine like vLLM, a request's real cost depends on what it is batched with, how long its KV cache holds memory, and whether other tenants evict its cached context.

This repository contains a measurement toolkit that:

- replays every combination of three tenants on a vLLM 0.30 server: chat, long documents, and a multi-turn agent;
- measures GPU busy time and dynamic energy, with a contamination guard so that measurements stay clean on a shared university GPU cluster;
- computes each tenant's exact Shapley value as the fair reference and compares seven billing methods against it.

The study ran on Qwen2.5-0.5B on a laptop GPU, and on Qwen2.5-7B and 14B on an NVIDIA A100, at three KV-cache memory levels: 288 clean replays in total.

## Main results

- **Token billing puts 11–21% of the bill on the wrong tenant** on every setup. Long documents are over-charged.
- **The fair split moves with model size.** Chat's fair share is 53% on 7B and 35% on 14B. No fixed token formula is fair across models, including API-style price ratios, which get worse on the bigger model (error 0.37 on 7B, 0.53 on 14B).
- **Memory pressure adds a cost that only appears when tenants share:** +15% on the laptop, +25% on 7B, +47% on 14B. Prices calibrated on each tenant running alone miss it. A tenant whose cache is evicted pays 35–64% more for identical work.
- **A three-rate token price fitted to measured Shapley values stays within the 0.1 error target in every condition** (worst case 0.11). Prices fitted to cost totals do not.

The full write-up is in [`poc/results/final_summary.md`](poc/results/final_summary.md) and the project report in [`report/`](report/).

## Layout

| Path | Contents |
|---|---|
| `poc/workload.py` | Synthetic three-tenant workload generator |
| `poc/run_experiments.py` | Replay driver, busy-time and energy metering, contamination guard |
| `poc/pick_gpu.py`, `poc/run.pbs` | GPU selection and the PBS job used on the cluster |
| `poc/analyze.py` | Shapley values, billing methods and latency/cache statistics for one setup |
| `poc/compare_models.py` | Laptop vs 7B vs 14B comparison and figures |
| `poc/calibration_check.py` | Five ways to calibrate a token price |
| `poc/results/` | Raw data (`runs.jsonl`, one row per replay), summaries and figures |
| `report/` | Synopsis, final report (.docx/.pdf) and the scripts that build them |
| `analysis.md` | Critical analysis of the problem statement and related work |

## Reproducing the analysis

The analysis needs only NumPy, SciPy and Matplotlib:

```bash
cd poc
uv run --no-project --with numpy --with scipy --with matplotlib python compare_models.py
uv run --no-project --with numpy --with scipy --with matplotlib python calibration_check.py
```

Running new measurements needs a CUDA GPU with vLLM 0.30.0, `nvidia-ml-py` and `psutil`. On a PBS cluster, submit one job per memory level, for example `qsub -v KV=roomy,MODEL=Qwen/Qwen2.5-14B-Instruct poc/run.pbs`. See the comments in `run.pbs` for the guard settings.
