// Builds FairShareAI_Cheatsheet.docx (convert to PDF with update_toc.py or soffice)
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, LevelFormat, Footer, PageNumber,
} = require("docx");

const FONT = "Arial";
const W = 9638; // A4 with 2 cm margins

function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    out.push(t.startsWith("**") ? new TextRun({ text: t.slice(2, -2), ...base, bold: true }) : new TextRun({ text: t.slice(1, -1), ...base, italics: true }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}
const P = (t) => new Paragraph({ children: runs(t), spacing: { after: 120, line: 290 } });
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const B = (t) => new Paragraph({ children: runs(t), numbering: { reference: "b", level: 0 }, spacing: { after: 60, line: 280 } });
const Q = (q, a) => [
  new Paragraph({ children: runs("Q: " + q, { bold: true }), spacing: { before: 120, after: 40 }, keepNext: true }),
  new Paragraph({ children: runs(a), spacing: { after: 100, line: 280 }, indent: { left: 360 } }),
];
const bd = { style: BorderStyle.SINGLE, size: 4, color: "A6A6A6" };
const borders = { top: bd, bottom: bd, left: bd, right: bd };
function TABLE(header, rows, widths) {
  const tot = widths.reduce((a, b) => a + b, 0);
  const cols = widths.map((w) => Math.round((w / tot) * W));
  cols[cols.length - 1] += W - cols.reduce((a, b) => a + b, 0);
  const cell = (t, i, head) => new TableCell({
    borders, width: { size: cols[i], type: WidthType.DXA },
    shading: head ? { fill: "DDEBF7", type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: runs(t, { size: 19, bold: head || undefined }) })],
  });
  return new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: cols,
    rows: [new TableRow({ tableHeader: true, children: header.map((t, i) => cell(t, i, true)) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((t, i) => cell(t, i, false)) }))],
  });
}
const GAP = () => new Paragraph({ children: [], spacing: { after: 100 } });
const BOX = (lines) => new Table({
  width: { size: W, type: WidthType.DXA }, columnWidths: [W],
  rows: [new TableRow({ children: [new TableCell({
    borders, width: { size: W, type: WidthType.DXA }, shading: { fill: "F2F2F2", type: ShadingType.CLEAR, color: "auto" },
    margins: { top: 120, bottom: 120, left: 160, right: 160 },
    children: lines.map((l) => new Paragraph({ children: runs(l), spacing: { after: 60, line: 280 } })),
  })] })],
});

const children = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: "FairShareAI: Project Cheatsheet", bold: true, size: 36 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: "Everything you need to explain the project, in plain words", italics: true, size: 22, color: "595959" })] }),

  H1("1. The project in 30 seconds"),
  BOX([
    "Many teams (**tenants**) share one GPU server that runs an LLM. The server's cost is usually split by **counting tokens**.",
    "But the GPU does not work equally hard for every token. Requests are processed **together in batches**, they keep data in **GPU memory** for different amounts of time, and they **slow each other down**.",
    "**FairShareAI** measures the real GPU time and memory each tenant uses, splits the cost fairly, and uses this to schedule requests fairly.",
    "Our laptop experiment showed: (1) token counting bills **15-21%** of GPU time to the wrong tenant; (2) surprisingly, it **over-charges long documents**; (3) a better token price with **3 rates** fixes most of it; (4) what **no** price fixes is tenants **slowing each other down** (up to **70×** slower replies). So the project focuses on (4).",
  ]),
  GAP(),

  H1("2. Key terms explained simply"),
  TABLE(["Term", "What it means", "Simple analogy / why it matters"], [
    ["LLM inference", "Running a trained language model to answer a request", "Like using a calculator, not building one. We never train models."],
    ["Token", "A piece of a word (about 3/4 of a word). Models read and write tokens", "APIs charge per token"],
    ["Tenant", "One customer or team sharing the server", "Like flatmates sharing one electricity bill"],
    ["Prompt / input tokens", "The text sent to the model", "Reading the question"],
    ["Output tokens", "The text the model writes back", "Writing the answer"],
    ["Prefill", "The step where the model reads the whole prompt", "Done **all at once in parallel**, so it is cheap per token"],
    ["Decode", "The step where the model writes the answer", "Done **one token at a time**, so it is expensive per token"],
    ["KV cache", "Notes the model keeps in GPU memory about the text so far, so it does not re-read it", "Like bookmarks and notes; they grow with the length of the text"],
    ["Prefix caching", "If a new request starts with the same text as an earlier one, the old notes are reused", "An agent re-sends its whole history every turn; caching avoids re-reading it"],
    ["Cache hit", "The needed notes were still in memory", "Cheap. A miss means recomputing them."],
    ["Eviction", "Old cache notes are thrown out to make room", "Someone else's big job can throw out *your* notes"],
    ["Preemption", "The engine pauses a request and frees its memory when memory runs out, and redoes it later", "Wasted work, and the request gets slower"],
    ["Batching (continuous batching)", "The GPU processes many requests together in each step", "Like a bus instead of taxis: cheaper per person, but everyone waits for the slowest stop"],
    ["vLLM", "Popular open-source engine for serving LLMs", "The software our system plugs into"],
    ["Cache salt", "A tag per tenant mixed into the cache key", "Stops tenants reusing (and spying on) each other's cache"],
    ["GPU busy time", "Total time the GPU was working (idle time not counted)", "Our main measure of cost"],
    ["Dynamic energy", "Energy used above idle power, measured by NVIDIA's NVML counter", "Second cost measure; gave the same conclusions"],
    ["TTFT", "Time to first token: how long until the reply starts", "What a chat user feels as \"lag\""],
    ["p95 (95th percentile)", "95% of requests are faster than this value", "Measures the slow, annoying cases, not the average"],
    ["SLO", "Service level objective: a promised response time", "e.g. \"first token within 1 second\""],
    ["Interference", "One tenant making another slower or evicting its cache", "The cost that token billing cannot see"],
    ["Admission control / scheduling", "Deciding which waiting request goes to the GPU next", "Like a queue manager at a bank counter"],
    ["VTC", "A fair scheduler that serves the tenant who has received the least so far (counted in tokens)", "Our main comparison for scheduling"],
    ["Shapley value", "A fair way to split a shared cost (explained in Section 3)", "Our \"fair reference\" answer"],
    ["Leave-one-out (LOO)", "Cost with everyone minus cost without one tenant", "Another reference; unfair because whoever is \"last\" pays the most"],
    ["Cost when running alone", "Each tenant's cost if it had the GPU to itself", "Simple reference; close to Shapley in our tests"],
    ["Memory-time (GiB·s)", "Memory used × how long it was used", "Like kWh for electricity. Worst billing method in our test"],
    ["Seed", "A number that fixes the random workload", "4 seeds = 4 different random versions of the same experiment"],
  ], [20, 42, 38]),
  GAP(),

  H1("3. How the fair share (Shapley value) works"),
  P("**Idea:** a tenant should pay the *extra* cost it adds, averaged over every possible order in which the tenants could have joined. This is fair because nobody gets the advantage of joining first or the penalty of joining last."),
  H2("Toy example with two tenants"),
  BOX([
    "A alone = 10 s of GPU time. B alone = 10 s. A and B together = 14 s (batching saves 6 s).",
    "Order A then B: A adds 10, B adds 14 − 10 = 4.   Order B then A: B adds 10, A adds 4.",
    "Average: A = (10 + 4) / 2 = **7 s**, B = **7 s**. Total 14 s, and the 6 s saving is shared equally.",
  ]),
  GAP(),
  P("With 3 tenants there are 7 possible groups (chat, docs, agent, chat+docs, chat+agent, docs+agent, all three). That is why we ran **7 runs** for each setting. We used the same method as the JouleShare paper."),
  H2("Real example from our experiment (seed 0, roomy memory)"),
  TABLE(["Group of tenants", "GPU busy time"], [
    ["chat alone", "48.4 s"], ["docs alone", "17.2 s"], ["agent alone", "32.1 s"],
    ["chat + docs", "54.9 s"], ["chat + agent", "50.8 s"], ["docs + agent", "44.8 s"], ["all three", "60.7 s"],
  ], [60, 40]),
  GAP(),
  P("Serving all three together took 60.7 s, while running them one after another would take 97.7 s. This saving is why batching is used. The Shapley values split the 60.7 s as **chat 30.8 s, docs 12.2 s, agent 17.6 s**. Token counting would give each about 20 s, so docs would pay 20 s instead of 12.2 s (over-charged) and chat would pay 20 s instead of 30.8 s (under-charged)."),
  H2("How we score a billing method: \"% billed to the wrong tenant\""),
  P("Compare each tenant's share under the billing method with its fair (Shapley) share, add up the differences and divide by 2 (every second over-charged to one tenant is a second under-charged to another). In seed 0: chat is 17.5 points too low, docs 13.4 too high and agent 4.2 too high, so (17.5 + 13.4 + 4.2) / 2 = **17.5% of GPU time billed to the wrong tenant**. In the research papers this number × 2 is called the *normalised L1 distance*."),

  H1("4. The four papers, in plain words"),
  TABLE(["Paper", "What they did", "Main result", "What is missing (our gap)"], [
    ["**JouleShare** [1] (Luo et al., 2026)", "Measured the energy of every subset of requests on real data-centre GPUs and computed Shapley values", "Token counting charges about a quarter of the energy to the wrong requests; long prompts are over-charged", "Energy only; compared only with plain token counts, not with better token prices; at most 16 requests"],
    ["**ISJL** [2] (Yao and Zhou, 2026)", "Maths model of batch cost: each step costs as much as the biggest request needs. Proposed a scheduling algorithm with a proven guarantee", "Short requests batched with long ones end up paying for the long ones", "No real GPU measurements at all; no prefix caching"],
    ["**PrefixShield** [3] (Wang and Buyya, 2026)", "Counted how many new cache blocks each tenant creates (\"debt\") and used it to choose what to evict, in vLLM", "Protects the victim tenant's cache hit rate by about 9 percentage points", "The debt is counted in blocks and never turned into cost or money"],
    ["**TraceLab** [4] (Zhu et al., 2026)", "Studied about 4,300 real Claude Code and Codex coding-agent sessions", "About 95.7% of agent input tokens come from the cache (within a session); misses happen after the user is idle for more than 5 minutes", "Describes workloads only; no cost splitting between tenants"],
  ], [18, 30, 27, 25]),
  GAP(),
  P("**Our gap in one line:** nobody measures GPU time *and* memory per tenant on a real engine, compares it with a *calibrated* token price, *and* measures how tenants slow each other down."),

  H1("5. What we actually did (the experiment)"),
  B("**Setup:** laptop GPU (RTX 3050, 4 GB), vLLM engine, a small model (Qwen2.5-0.5B)."),
  B("**Three tenants with the same number of tokens (about 100,000 each):** chat (about 127 short questions), docs (about 10 long documents of 6,000-12,000 tokens), agent (4 sessions of 6 calls whose history grows and is reused from the cache)."),
  B("**Random token IDs** were used instead of real text, so we could control exactly which parts repeat. Output length was fixed so every run did the same amount of work."),
  B("**Separate cache per tenant** (cache salt), because shared caches can leak prompts [8]."),
  B("**7 groups × 4 seeds × 3 memory settings** (roomy, tight, very tight). We limited the memory on purpose to imitate a busy server. Plus repeat runs to check noise: **96 runs**, about 60 seconds each."),
  B("For each run we measured **GPU busy time** and **energy**, then computed the fair Shapley share and compared 6 billing methods with it."),

  H1("6. What we found, and why"),
  TABLE(["Finding", "Why it happens"], [
    ["Plain token billing: **15-21%** of GPU time billed to the wrong tenant", "Tokens are not all equal: reading a prompt token is cheap, writing an output token is expensive"],
    ["**Long documents over-charged**, short chat requests under-charged (opposite of what the proposal assumed)", "Docs have huge prompts (cheap, read in parallel) and few outputs. Chat writes many more output tokens (expensive, one at a time)"],
    ["API-style price (output = 5 × input) removes only about a quarter to a half of the error", "On our hardware an output token actually costs **14-16×** an input token, not 5×"],
    ["**Calibrated three-rate price** (new input, cached input, output) gets the error down to **3-5%**", "We fitted the three rates from single-tenant runs. Most of the error was simply wrong prices"],
    ["**Memory-time is the worst** billing method (23-33% wrong)", "Docs hold the most memory, but memory was not what limited the GPU"],
    ["Chat's slowest replies (p95 TTFT) became up to **70× slower** with other tenants (0.11 s → 7.37 s)", "Docs' long prompts occupy the GPU, and with little memory requests get paused and redone"],
    ["The agent lost up to **70%** of its cache hits, and under API pricing paid **up to 64% more** for the same work", "Other tenants evicted its cached history, so it had to be re-read at full price; the tenants causing it paid nothing extra"],
  ], [52, 48]),
  GAP(),
  BOX(["**Conclusion:** per-token cost can mostly be fixed with better token prices. The real open problem is **interference**, meaning tenants slowing each other down and evicting each other's cache. That is what the main project will measure, price and reduce with fair scheduling."]),
  GAP(),

  H1("7. Numbers to remember"),
  TABLE(["What", "Number"], [
    ["Runs in the experiment", "96 (7 groups × 4 seeds × 3 memory settings, plus repeats)"],
    ["Tokens per tenant", "about 100,000"],
    ["GPU time billed to the wrong tenant: plain tokens / API price / calibrated price", "15-21% / 8-15% / 3-5%"],
    ["Fair shares at tight memory (chat / docs / agent)", "53% / 18% / 29% (tokens give about 33% each)"],
    ["Real cost of an output token vs an input token", "14-16× on our hardware"],
    ["Savings from batching all three tenants together", "34-42% less GPU time than running separately"],
    ["Chat p95 time to first token: alone vs all three (very tight memory)", "0.11 s vs 7.37 s (about 70×)"],
    ["Agent cache hits: alone vs all three (very tight memory)", "77% vs 23%"],
    ["Measurement noise (repeated runs)", "less than 0.2%"],
    ["JouleShare's result for comparison", "about a quarter of energy wrongly billed"],
  ], [60, 40]),
  GAP(),

  H1("8. Questions the panel may ask"),
  ...Q("Why not just bill by tokens like OpenAI does?", "Because on a shared server, tokens do not reflect the real GPU work. Our experiment showed 15-21% of GPU time going to the wrong tenant. API providers already use different prices for input, cached input and output tokens for this reason."),
  ...Q("If a three-rate price fixes most of the error, why build FairShareAI?", "Because (a) the right rates depend on the model and hardware, so they must be measured, which is what our system does, and (b) no token price can capture interference. The chat tenant was up to 70× slower and the agent paid up to 64% more because of other tenants."),
  ...Q("What is the Shapley value and why use it?", "It splits a shared cost by averaging each tenant's extra cost over every order in which tenants could join (see the 10 s / 10 s / 14 s example). It is a standard fair-division method from game theory (1953), and JouleShare used it too."),
  ...Q("Why were long documents over-charged? Isn't a long prompt expensive?", "The model reads a prompt in one parallel pass, which is cheap per token. Writing output is one token at a time, which is expensive per token. The docs tenant had many prompt tokens but few output tokens."),
  ...Q("Why did you use random tokens instead of real text?", "To control exactly which parts repeat (for prefix caching) and to keep every run identical. The cost of processing a token does not depend on what the word is."),
  ...Q("Why a laptop GPU and a 0.5B model?", "The cluster was not available yet. The laptop was enough to test whether the problem is real. The exact numbers will change on larger models, which is why the cluster phase exists."),
  ...Q("Why separate caches per tenant?", "Research [8] showed that if tenants share a prefix cache, one tenant can guess another's prompt from how fast its own requests are answered. So we keep caches separate for security."),
  ...Q("How do you know the results are not just noise?", "Repeating the same run changed the result by less than 0.2%, while the differences we report are 3% to 30%. We also used 4 different random workloads."),
  ...Q("What is the difference between your work and JouleShare?", "JouleShare measures energy and only compares with plain token counts. We measure GPU time and energy, compare with calibrated token prices, and measure interference between tenants (latency and cache eviction)."),
  ...Q("What will you do on the cluster?", "Repeat the experiment with 8B, 30B and 70B models, build the telemetry adapter and cost ledger, measure interference properly, and test a fair scheduler against VTC."),
  ...Q("What does \"memory-time\" mean and why did it do badly?", "Memory multiplied by time, like kWh. It did badly because the tenant holding the most memory (docs) was not the one keeping the GPU busy."),
  ...Q("What is p95 TTFT?", "Time to first token that 95% of requests beat, so it describes the slowest 5% of replies, the ones users complain about."),

  H1("9. Honest limitations (say these before they ask)"),
  B("Very small model on a laptop GPU. Numbers will change on large models."),
  B("Synthetic workloads, only 3 tenants and 4 seeds."),
  B("The calibrated price was tested on new random workloads of the *same* types, not completely new types."),
  B("GPU busy time includes a little CPU overhead of the engine; memory-time was estimated from context length."),

  H1("10. References"),
  ...[
    "[1] Q. Luo et al., \"Request-Level Energy Attribution for Batched LLM Serving (JouleShare),\" arXiv:2608.00026, 2026.",
    "[2] D. Yao and Z. Zhou, \"Efficiency and Cost Alignment in Batched LLM Serving via Resource-Fair Scheduling (ISJL),\" arXiv:2608.02244, 2026.",
    "[3] Z. Wang and R. Buyya, \"Preserving Admission Responsibility in Multi-Tenant LLM Prefix Caches (PrefixShield),\" arXiv:2608.01657, 2026.",
    "[4] K. Zhu et al., \"TraceLab: Characterizing Coding Agent Workloads for LLM Serving,\" arXiv:2606.30560, 2026.",
    "[5] W. Kwon et al., \"PagedAttention / vLLM,\" SOSP 2023.   [6] Y. Sheng et al., \"Fairness in Serving LLMs (VTC),\" OSDI 2024.",
    "[7] L. S. Shapley, \"A Value for n-Person Games,\" 1953.   [8] G. Wu et al., \"I Know What You Asked,\" NDSS 2025.",
  ].map((t) => new Paragraph({ children: [new TextRun({ text: t, size: 18 })], spacing: { after: 60 } })),
];

const doc = new Document({
  title: "FairShareAI Cheatsheet",
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 28, bold: true, font: FONT, color: "1F4E79" }, paragraph: { spacing: { before: 280, after: 120 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 23, bold: true, font: FONT, color: "2E75B6" }, paragraph: { spacing: { before: 180, after: 80 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: "b", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 500, hanging: 280 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080" })] })] }) },
    children,
  }],
});
Packer.toBuffer(doc).then((b) => { fs.writeFileSync(path.join(__dirname, "FairShareAI_Cheatsheet.docx"), b); console.log("written"); });
