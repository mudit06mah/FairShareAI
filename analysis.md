# FairShareAI — critical analysis of the problem statement

*24 September 2026. Pre-cluster review of `FairShareAI-Proposal.pdf`, informed by `plan.md`, `important.txt`, the papers listed in §5, and the laptop proof-of-concept in `poc/`. Sources marked **[abstract]** were only available at abstract level.*

## 1. The problem, restated

Stripped of the platform features, the proposal makes one empirical claim and one normative claim.

- **Empirical:** On a shared, self-hosted inference engine, the GPU resources a request consumes are not proportional to its token count. Prefill and decode tokens cost different amounts. Attention cost grows with context. A request's KV cache occupies scarce memory for as long as it lives. Prefix caching makes repeated input almost free. Requests batched together share fixed per-step costs and slow each other down.
- **Normative:** Because of this, token-based chargeback *cross-subsidises* some tenants at the expense of others, and fixing the accounting (and scheduling on it) would materially improve fairness, SLOs and utilisation.

The empirical claim is almost certainly true in some form; it follows from how transformers are served, and the PoC confirms it on a laptop. The normative claim — that the mismatch is *large enough, in the right direction, and not already fixed by simple pricing*, to justify a new accounting platform — is where the argument is weak. The proposal never quantifies it, and it compares against the weakest possible alternative.

## 2. Does the argument hold up?

### 2.1 What holds

- **Token counts are a poor proxy for per-request GPU work under batching.** This is now independently measured:
  - JouleShare (arXiv 2608.00026) finds plain token-proportional *energy* attribution deviates from exact Shapley by 0.44–0.46 normalised L1 on A800, A40 and H100 GPUs, i.e. roughly a quarter of each batch's energy is charged to the wrong requests.
  - LLMVisor (arXiv 2608.08382) reduces p90/p99 latency-attribution error relative to a token-count baseline by up to 2.5–4.4×.
- **There are real externalities.** Batching and memory pressure let one tenant's workload change another's latency and cache hit rate. ISJL (2608.02244) formalises the batching externality (analytically only). PrefixShield (2608.01657) measures cross-tenant eviction harm on vLLM: 9.4 pp of victim hit ratio recovered over LRU.
- **Operators cannot answer tenant-level questions with today's tools.** OpenCost's July 2026 inference-cost support (on llm-d/vLLM) reports cost per model and namespace, and states that tenant-level metrics are still work in progress. vLLM exposes aggregate cache and timing metrics, not a per-tenant ledger. The gap between "we know what the deployment cost" and "we know which tenant caused it" is real.

### 2.2 What does not hold, or is unproven

**(a) The direction of the subsidy is asserted, and the best evidence points the other way for compute and energy.** The proposal's motivating example is that long-context and document workloads "appear inexpensive under token-only accounting". JouleShare's measurements show the opposite for energy: token counting *over*-charges long prompts (an 8,254-token prompt billed 2.6× its Shapley energy), because a prefill token is processed in parallel and costs far less than a decode token. The proposal's claim can only be true if the binding resource is *memory held over time* (KV residency, ISJL's max-driven view), not compute or energy. Which resource binds depends on model size, GPU, context mix and load. The proposal never says which regime it expects, and its cost views would give opposite verdicts in different regimes. The PoC (§7) tests this directly.

**(b) The comparison is against a strawman.** "Token counting" in the proposal means counting all tokens equally. Nobody prices that way:
- Commercial APIs price output at about 5× input (Anthropic and OpenAI flagship models, September 2026). Cached input is priced at 0.1× (or less), and cache writes at 1.25× (5-minute retention) or 2× (1-hour retention) on Anthropic.
- VTC, the standard fair-scheduling baseline (OSDI '24), uses weighted input/output tokens by default and explicitly allows a profiled non-linear cost function.
- DLPM charges shared prefixes once.

The meaningful question is whether *differentiated* token prices — three or four rates that any billing system can implement — leave a material residual error. JouleShare did not test this (it compares only against plain token counts), and neither does the proposal. If three prices close most of the gap, most of FairShareAI's attribution engine is unnecessary; if they do not, that residual is the actual research contribution. This is the single most important missing piece of evidence.

**(c) The largest cost component is not a measurement problem.** Patil (arXiv 2606.11690, **[abstract]**) measures effective cost on one H100 spanning $0.21 to $15.25 per million output tokens depending on concurrency. Utilisation dominates $/token. For a private cluster, idle and reserved capacity may be a large share of the bill. The proposal correctly treats that share as a *policy* allocation ("allocated cost"), but this means a large fraction of any tenant's charge is a choice, not a measurement. Per-request attribution accuracy only matters for the utilised fraction; the proposal should say how large that fraction is expected to be.

**(d) "True cost" is not uniquely defined, so "attribution error below 15–20%" is not testable as written.** Under batching and shared caches, cost is not additive: serving A and B together costs less than serving them separately. Isolated replay, leave-one-out marginal cost and Shapley value give different answers, and all three depend on what C(S) measures (busy time, energy, capacity at an SLO). The proposal lists "error against isolated replay" and "error against Shapley-style references" as if they were the same target. `plan.md` §3 already flags that prediction is not identification: many share assignments reproduce the same batch total. The PoC measures how far these references disagree on real hardware (§7).

**(e) The novelty claim overlaps heavily with 2024–2026 work** (§5). Multi-resource cost with shared-prefix redistribution (FairCache), KV memory-time cost (Justitia), additive per-request latency attribution (LLMVisor), Shapley energy attribution (JouleShare), per-tenant KV admission debt (PrefixShield), token-latency isolation (FairInference) and prefix-aware fair scheduling (DLPM) all exist. None of them is cited in the proposal.

**(f) The "95.7% of agentic input tokens are cache reads" framing does not support cross-tenant cache accounting.** That figure (TraceLab, 2606.30560) is the Codex figure (Claude: 95.8%). It is token-weighted, provider-reported and entirely *within-session* reuse; the paper does not study cross-user sharing. Its actionable finding is about *retention time*: misses rise after 5 minutes idle, almost nothing hits after 1 hour, and misses after human think time are 12.8% of priced cost. That supports metering residency and retention, which providers already coarsely price with TTL tiers. It does not show that "who created a shared prefix" matters.

## 3. Specific weak or unsupported claims in the proposal

| Claim (proposal wording) | Problem | What would support it |
|---|---|---|
| Two customers with the same token count may impose "substantially different costs" | No magnitude, no example, no hardware | Matched-token experiment on a real engine; the PoC does this at small scale |
| Long-context and agent workloads "appear inexpensive under token-only accounting" | Contradicted for energy by JouleShare; direction depends on the binding resource | Show the direction under a stated cost reference and load regime |
| Monitoring systems "frequently cannot answer" the ten listed questions | No survey, interviews or case study | Design-partner interviews with a concrete disputed allocation (`plan.md` §15) |
| Organisations "overprovision GPUs because demand … is poorly understood" | Asserted; overprovisioning also has SLO, procurement-lead-time and burst causes | Capacity data from a partner; counterfactual replica count at matched SLO |
| "Runaway agents" starving interactive users | Plausible but anecdotal; engine limits (max tokens, concurrency) already bound it | A trace showing it happening under default vLLM limits |
| Attribution error < 15–20% | Reference undefined (§2.2d); percentages unstable for small tenants | Define the reference and metric (e.g. normalised L1 vs Shapley on a declared C) |
| ≥ 15% fewer p95 SLA violations; 10–20% better utilisation | No baseline, no workload, no load level; utilisation can rise through useless recomputation | SLO-qualified goodput vs VTC/DLPM at matched offered load |
| < 2% measurement overhead | Not estimated; per-block event logging can be heavy | Microbenchmark of event volume per request |
| > 95% reconciliation of expenditure | Reconciliation is an accounting identity; it can be exact while attribution is wrong | Report unattributed residual and attribution error separately (`plan.md` §8) |
| 2,500–4,000 A100 GPU-hours, 10–20 TB storage | Not derived from an experiment manifest | Configurations × seeds × duration; storage from measured event volume |
| Central hypothesis: resource-aware attribution *and* scheduling reduce cross-subsidy *and* SLA violations *while* maintaining utilisation | Three outcomes in one hypothesis; a partial result is hard to interpret | Split into an attribution hypothesis and a scheduling hypothesis, each falsifiable |

## 4. Scope

The proposal promises 12 deliverables. They include a gateway, measurement library, attribution engine, scheduler, budget service, dashboards, simulator, benchmark, multi-model evaluation, 2–3 enterprise pilots, open-source release and a paper. On top of that it lists SSO, RBAC, multi-region, Kubernetes and compliance requirements. Almost none of the enterprise surface is research, and several items (gateway, budgets, dashboards) exist in LiteLLM-, OpenCost- or Kubecost-class tools. The research value sits in a narrow core: *can cheap engine telemetry produce per-tenant allocations that beat differentiated token prices against a declared counterfactual reference, and does acting on them change a decision?* `plan.md` already narrows the project this way; this analysis agrees and adds that the differentiated-price baseline must be the bar.

## 5. Related work

| Work | What it does | Evidence | Overlap with FairShareAI |
|---|---|---|---|
| **VTC** — Sheng et al., OSDI 2024 | Fair scheduling on a service cost `w_p·n_p + w_q·n_q` (default 1:2); allows profiled non-linear cost | A10G, A100 | Fairness baseline; shows "token counting" is a configurable default, not a fixed limitation |
| **DLPM / D²LPM** — Cao et al., arXiv 2501.14312 | Locality-aware fair scheduling; shared prefix counted once | A100, A10G | Prefix-aware fairness exists; its first-computer-pays rule is the free-riding problem FairCache addresses |
| **FairCache** — Bai et al., IEEE TPDS 2026 **[abstract]** | Unifies compute, memory and I/O into one metric; redistributes shared-prefix prefill cost across beneficiaries; max-min fair cache allocation | Prototype and theory; hardware not stated in abstract | **Strongest overlap** with the proposal's §3–§4 |
| **LLMVisor** — Jin et al., arXiv 2608.08382 | Piecewise-linear batch-latency model with additive per-request shares; GPU-time quotas | A100/H100, 8B–32B | Per-tenant GPU-time attribution already exists; not energy, dollars or KV residency |
| **Justitia** — Yang et al., arXiv 2510.17015 | KV token-time cost `pd + d²/2`; fair scheduling of LLM agents | A100, V100, H800 | Memory-residency cost for agents already published |
| **JouleShare** — Luo et al., arXiv 2608.00026 | Exact Shapley energy attribution by subset replay; JCalib online estimator | A800/A40/H100, ≤ 14B, n ≤ 16 | Direct precedent for "token accounting is wrong"; compares only against plain tokens |
| **StepSplit** — arXiv 2611.13802 (same group as JouleShare) *[added 18 Nov 2026]* | Closed-form "step-sharing" Shapley value, about 1% error against exact Shapley | Qwen2.5-7B, vLLM 0.30 | Cheap Shapley on the same model and engine as our cluster runs. Memory pressure and eviction aren't part of its evaluation, as far as checked |
| **unalloc** — arXiv 2609.24991 *[added 18 Nov 2026]* | Tenant-level meters comparing tokens with time-share, plus a financial ledger | H100 | A 12–14 pp gap between token and time-share billing; overlaps items 1–2 of "what is left" below |
| **Bursts** — arXiv 2611.13412 *[added 18 Nov 2026]* | Prefix-cache collapse (metastability) under bursty agent traffic | Not checked | Related to our agent cache-loss result; about stability, not billing |
| **ISJL** — Yao & Zhou, arXiv 2608.02244 | Max-driven batch cost; resource-fair scheduling with a 3/4 competitive ratio | Simulation only; no GPU, no prefix caching | Formalises the batching externality; unvalidated on hardware |
| **PrefixShield** — Wang & Buyya, arXiv 2608.01657 | Per-tenant block "debt" guiding admission and eviction in namespace-isolated prefix caches | vLLM 0.10.2, L4/A100, ≤ 7B | Per-tenant KV accountability exists, in blocks rather than money or residency time |
| **FairInference** — Bali et al., arXiv 2609.18112 **[abstract]** | δ-token latency isolation and δ-fair KV eviction | Not stated | Overlaps the interference/fair-scheduling aim |
| **TraceLab** — Zhu et al., arXiv 2606.30560 | 4.3k Claude Code/Codex sessions: long context, short output, 95.7–95.8% within-session cache hits, idle-gap misses | Real traces | Workload realism for agents; argues for retention-aware metering |
| **Beyond Per-Token Pricing** — Patil, arXiv 2606.11690 **[abstract]** | Concurrency-aware $/token; `vllm-cost-meter` | H100, A100 | Utilisation dominates $/token |
| **OpenCost 1.121** (July 2026) | Inference cost per model/namespace from llm-d/vLLM metrics, input/output priced separately, cache hits considered | Production tooling | Closes the deployment-level chargeback gap; tenant-level is "work in progress" |
| **DRF** (NSDI 2011), **FairRide** (NSDI 2016) | Multi-resource fairness; fairness–efficiency trade-offs with shared caches | Theory and systems | Impossibility-style limits on promising every fairness property at once |
| **Commercial pricing** (Anthropic, OpenAI, Sept 2026) | Output ≈ 5× input; cached input ≈ 0.1×; cache writes 1.25×/2× by TTL; Anthropic has no long-context surcharge | Public price lists | The realistic baseline the proposal should beat |
| **Prompt-cache side channels** — Gu et al. (ICML 2025); Wu et al. "I Know What You Asked" (NDSS 2025); Song et al. "The Early Bird Catches the Leak" (IEEE TIFS 2025) | Cross-user prefix-cache sharing leaks prompts via timing; global sharing found at 7 API providers | Real APIs / vLLM-style systems | Cross-tenant sharing, on which much of the proposal's cache-accounting menu relies, is a security liability; vLLM's `cache_salt` exists for isolation |

**What is left that is new.** None of these works does all of the following:
1. attributes *physical* resources (GPU time **and** KV residency) per tenant on a real engine;
2. converts them into a *reconciled* financial ledger;
3. benchmarks against *differentiated* token prices rather than plain token counts;
4. validates against a declared counterfactual reference under cache isolation.

That combination, plus evidence that it changes a real decision (a chargeback, a quota, a replica count), is a defensible contribution. "Resource-aware fair scheduling" and "cache-aware accounting" alone are not.

**Update, 18 November 2026.** unalloc now covers much of items 1–2: per-tenant time attribution on a real engine, and a ledger. StepSplit makes Shapley cheap on the same model and engine we used. Based on the cluster runs (§10), what still looks new is:
1. attribution under KV-cache memory pressure, where the sharing-only cost grows with model size (+15 / +25 / +47% for 0.5B / 7B / 14B);
2. the victim-pays effect, measured: the evicted tenant pays 35–64% more for identical work;
3. the fair split moving with model size, so that no fixed token formula is fair across models;
4. exact all-coalition Shapley on a real engine at three model sizes;
5. evidence that a token price stays fair only when it is recalibrated against measured Shapley values for each model and memory condition.

Repeat the literature search once before submission.

## 6. Corrections to `important.txt`

| Statement | Assessment |
|---|---|
| JouleShare: "token-proportional attribution misallocates ~25% of a batch's energy … n ≤ 16, fixed replay groups" | **Correct.** Normalised L1 is 0.44–0.46; halving gives ~22–23% moved, and the paper says "roughly a quarter". Exact at n = 8, sampled to 16. Compares only against plain token counts, uses dynamic energy only, and finds long prompts *over*-charged. |
| ISJL "proves the batching externality analytically with zero GPU measurements" | **Correct.** Step-count cost model, compute-bound assumption, known output lengths, no prefix caching, simulation on LMSYS traces. |
| PrefixShield "meters KV blocks per tenant but converts them to an abstract 'debt', never dollars" | **Mostly correct.** It meters *newly materialised* blocks (a count), not residency over time, and tenants are namespace-isolated (no cross-tenant sharing). |
| "95.7% of agentic input tokens are cache reads" | **Correct but narrow.** Codex figure (Claude 95.8%), token-weighted, within-session only. |
| "Nobody meters cache residency at all" | **Overstated.** Justitia uses KV token-time as its cost; FairCache includes memory; vLLM exposes sampled block residency; Anthropic prices 1-hour vs 5-minute cache retention differently. Defensible version: *nobody attributes physical cache residency per tenant, in money, on a real engine.* |
| "None joins them on a real engine at real prices" | **Plausible,** subject to reading the full FairCache paper, which may come close on the scheduling side. |

## 7. Evidence from the laptop PoC

*See `poc/README.md` for method and limitations. Numbers from `poc/results/summary.md`.*

**Setup recap.** Qwen2.5-0.5B on vLLM 0.30, RTX 3050 Laptop GPU. Three tenants with about equal token volume (≈ 97–101k tokens each): chat (many short requests), docs (few 6–12k-token prompts), agent (multi-turn, growing, cached context). Caches are isolated per tenant. All 7 tenant coalitions were replayed for 4 seeds at 3 KV-memory levels, 96 runs in total. Reference: exact Shapley value of GPU busy time, with dynamic energy as a second reference. Run-to-run noise (repeat of the full coalition) was ≤ 0.003 normalised L1, so every difference below is far above measurement noise.

**Finding 1 — Plain token billing is substantially wrong, at the same magnitude JouleShare reported, but in the opposite direction to the proposal's headline example.**

| Normalised L1 vs Shapley (busy time), mean ± SD over 4 seeds | roomy KV | tight KV | very tight KV |
|---|---|---|---|
| Plain tokens | 0.42 ± 0.06 | 0.40 ± 0.06 | 0.31 ± 0.05 |
| API-style price (in 1, cached 0.1, out 5) | 0.30 ± 0.05 | 0.23 ± 0.07 | 0.16 ± 0.03 |
| 3-rate price fitted on *isolated* benchmarks (held-out seed) | 0.10 ± 0.04 | 0.07 ± 0.02 | 0.05 ± 0.04 |
| 3-rate price fitted on Shapley (best any linear token price can do) | 0.08 ± 0.01 | 0.08 ± 0.02 | 0.05 ± 0.02 |
| Isolated replay | 0.09 ± 0.02 | 0.07 ± 0.01 | 0.04 ± 0.02 |
| Leave-one-out marginal | 0.29 ± 0.07 | 0.20 ± 0.04 | 0.15 ± 0.03 |
| Logical KV GiB·s | 0.65 ± 0.06 | 0.59 ± 0.04 | 0.46 ± 0.05 |

The energy reference gives nearly identical numbers (plain tokens 0.41 / 0.38 / 0.29; see `poc/results/summary.md`).

- Token shares are ≈ 33% each. Shapley busy-time shares are **chat 54% / docs 17% / agent 29%** (roomy), moving to 48% / 21% / 31% under very tight memory.
- Plain token billing therefore **over-charges the long-document tenant by 13–17 percentage points** and **under-charges the short-request chat tenant by 15–21 pp**, in every configuration, including when memory is the scarce resource (very tight: 9.8 preemptions per full-coalition run).
- This contradicts the proposal's claim that long-context workloads "appear inexpensive under token-only accounting", and it replicates JouleShare's direction with a different cost basis (busy time), GPU and vLLM version.

**Finding 2 — Most of that error is removable with a calibrated 3-rate token price; an attribution engine is not needed for per-request compute cost in this setting.**
- The off-the-shelf API ratio (output = 5 × input) removes only 28–48% of the error.
- The measured cost ratio is different: fitted output/uncached-input price is **≈ 14–16 : 1** on this hardware, not 5 : 1.
- A 3-rate price fitted only from each tenant's *isolated* benchmark, and tested on a held-out seed's mixed run, reaches 0.05–0.10. That is as good as the best possible linear token price (0.05–0.08) and as good as isolated replay.
- Caveat: only the agent has cached tokens, so the fitted "cached" rate is not separately identifiable. It absorbs agent-specific overhead and should not be read as a physical price. The test is also on held-out *seeds* of the same three workload families, not on new workload shapes.

**Finding 3 — The choice of "true cost" reference matters as much as the billing method.**
- Leave-one-out marginal cost (the proposal's "marginal cost" view) differs from Shapley by 0.15–0.29, and it is unstable across seeds (± 0.07 at roomy).
- Batching makes cost strongly sub-additive: C(all) / Σ C(single) = 0.58–0.66. Serving the three tenants together takes 34–42% less GPU time than serving them separately, and how that saving is shared is a policy choice, not a measurement.

**Finding 4 — Charging by KV residency (GiB·s) would be the *worst* allocation tested.**
KV GiB·s is off by 0.46–0.65, worse than plain tokens, because docs hold the most memory while memory was not what limited throughput. Even at 13.6k tokens of KV (about 1.1 × the largest request) it does not become a good cost proxy. This does not rule out memory-driven cost on large models with long decode phases, which is a cluster question.

**Finding 5 — The real, unpriced harm is the externality, and it grows sharply with memory pressure.**

| Metric | Alone | + docs (roomy / tight / very tight) | All three (roomy / tight / very tight) |
|---|---|---|---|
| Chat p95 time-to-first-token | 0.11 s | 1.13 / 1.63 / 2.73 s | 1.20 / 3.66 / **7.37 s** |
| Chat p50 time-to-first-token | 0.07 s | 0.08 / 0.08 / 0.09 s | 0.09 / 0.25 / 1.88 s |
| Agent prefix-cache hit rate (turns ≥ 1) | 0.77 | — | 0.77 / 0.41 / 0.23 |
| Agent API-style bill (identical token work) | 1.00× | docs+agent: 1.00 / 1.21 / 1.45× | 1.00 / **1.54** / **1.64×** |

- Chat's tail latency rises 11× from docs' long prefills alone, and up to 70× under memory pressure.
- The agent loses up to 70% of its cache hits to evictions caused by other tenants, even though caches are isolated.
- Under cache-discounted pricing (the realistic baseline), the **victim pays**. The agent's bill rises 54–64% for identical work, while the tenants causing the evictions pay nothing extra.
- This is a cross-subsidy that token pricing *creates* rather than fails to fix. It is the part of the proposal's problem statement (interference cost, displaced cache, recomputation caused by eviction) that the PoC supports most strongly.

Figures: `poc/figures/nl1_busy.png`, `shares_*.png`, `chat_ttft.png`, `agent_bill.png`.

## 8. What remains uncertain and needs cluster-scale validation

1. **Which resource binds at production scale.** On 8B–70B models on A100s, is the dominant scarce resource compute (which favours long prompts under token billing) or KV memory (which penalises them)? This decides the direction of the subsidy, and a 0.5B model on a 4 GB laptop GPU cannot answer it.
2. **Whether differentiated token prices close the gap at scale.** The PoC tests this for one tiny model. The residual error of a fitted 3–4-rate price on held-out 8B–70B workload mixes is the key go/no-go number for the attribution engine.
3. **Tensor-parallel and multi-replica effects.** Communication cost, per-rank KV sharding and routing cannot be observed on one GPU.
4. **Stability of attributions across models, GPUs and engine versions** (proposal RQ8). One laptop, one model and one vLLM version show nothing here.
5. **Scaling of the counterfactual reference.** Exact Shapley over 3 tenants is 7 replays. Real tenant counts need sampled Shapley or a calibrated estimator, and nobody has validated estimator error at, say, 20–50 tenants.
6. **Realistic load and arrival processes.** Near-saturation behaviour, bursts and long idle gaps (TraceLab: median human think time 1.4 minutes, p90 20.6 minutes) need longer runs and real or trace-derived workloads.
7. **Telemetry overhead** at high request rates with per-block event capture (< 2% target).
8. **Scheduling benefit.** Whether admission control on these estimates beats VTC/DLPM on SLO-qualified goodput. The PoC does no scheduling.
9. **Share of the bill that is idle or reserved capacity** on the real cluster, which bounds how much per-request accuracy can matter financially.
10. **Whether anyone changes a decision.** Not a cluster question, but the proposal's value depends on it and no evidence exists yet.

## 9. Closing note — what the PoC says about the problem statement

The proposal says token accounting misrepresents the cost of shared, self-hosted inference. On one laptop GPU, with one small model, three synthetic tenants and 96 real replays, that is **true but mis-aimed**:

1. **Per-request compute attribution is a real problem against plain tokens (≈ 0.3–0.4 L1 error) but a small one against calibrated prices.** A 3-rate token price fitted from isolated benchmarks gets within 0.05–0.10 of the Shapley reference, and so does isolated replay. That argues *against* building a heavyweight attribution engine for this part, unless cluster experiments on 8B–70B models show the residual growing.
2. **The direction the proposal asserts is wrong in every configuration measured.** Long-context documents are over-charged by token billing, not under-charged, even under heavy memory pressure. The motivation section should be rewritten around evidence rather than intuition.
3. **The defensible problem is interference.** Tail latency inflation of 11–70×, and cache eviction that makes the victim pay 54–64% more under cache-discounted pricing, are costs that no per-token price can represent, because they depend on *who else is running*. This is where FairShareAI's measurement layer, interference cost view and cache-aware accounting would earn their place. It aligns with existing work (PrefixShield, FairInference, FairCache), so the contribution must be the physical-to-financial ledger and its validation, not the idea itself.

**Recommended reframing for the cluster phase.** Test first whether calibrated differentiated token prices remain within ~0.1 L1 on 8B–70B models and new workload mixes (go/no-go for the attribution engine). Then concentrate the project on measuring and pricing interference and eviction externalities, with scheduling as the lever that reduces them.

## 10. Update after the cluster runs (18 November 2026)

The cluster runs (Qwen2.5-7B and Qwen2.5-14B on RU's A100s, 96 clean replays each, the same workload as the PoC) answer several of the §8 questions. Full detail is in `poc/results/final_summary.md`.

- **§8.1, which resource binds and the direction of the subsidy.** Long documents are over-charged by token billing on all three setups (0.5B, 7B, 14B), and memory pressure never flips that. The under-charged tenant does change with the model: chat on 0.5B and 7B, the agent on 14B.
- **§8.2, whether differentiated prices close the gap at scale (the go/no-go).**
  - With plenty of memory, a 3-rate price calibrated on each tenant running alone stays within about 0.1 on every setup.
  - Under memory pressure it degrades with model size: 0.05 (laptop), 0.14 (7B) and 0.21 (14B) at very tight memory.
  - Calibrating on cost totals from tenant combinations, or adding a memory-time term, doesn't fully fix that.
  - A 3-rate price fitted to *measured Shapley values* on other seeds stays within about 0.1 everywhere (worst 0.11).
  - **Verdict: go,** with a narrower role for the attribution engine than the proposal's. It doesn't need to bill every request. It needs to measure Shapley values periodically, so that per-token prices can be recalibrated for each model and memory condition. Whether those prices carry over to new tenant mixes is still untested.
- **§8.4, stability across models.** Attributions are *not* stable across models. At roomy memory the fair split (chat / docs / agent) is 53 / 14 / 33% on 7B and 35 / 20 / 45% on 14B. Chat's cost is set by how long its traffic keeps the engine running, while docs and agent scale with computation. As a result, API-style ratios get worse on the bigger model (0.37 → 0.53).
- **§8.6, load.** 7B left the A100 with spare capacity; on 14B the same traffic overloaded it. The conclusions hold in both regimes. Under heavy load costs are more additive, and leave-one-out billing improves (0.17–0.19, against 0.29–0.50 on 7B).
- **§9.3, interference.** It replicates on all three setups and grows with model size. Chat's p95 time to first token reaches 29 s on 14B under very tight memory, against 0.26 s alone, and the evicted agent pays 1.35–1.64× under cache-discounted pricing.

Still open: §8.3 (tensor parallelism), §8.5 (more tenants), §8.7–8.10, real traces, and a controlled load sweep.
