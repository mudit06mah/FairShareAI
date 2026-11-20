// Builds FairShareAI_Major_Project_Synopsis.docx (then run update_toc.py to refresh the contents page and export the PDF)
// Run from report/:  node build_synopsis.js && /usr/bin/python3 update_toc.py FairShareAI_Major_Project_Synopsis.docx
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, LevelFormat, PageBreak, Header, PageNumber,
  TabStopType, Tab,
} = require("docx");

const FIG = (p) => path.join(__dirname, "figures", p);
const CONTENT_W = 9026; // A4 width 11906 minus 1440 margins each side (DXA)
const FONT = "Times New Roman";

// ---------- text helpers ----------
// inline markup: **bold**, *italic*, _{sub}
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|_\{[^}]+\})/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), ...base, bold: true }));
    else if (t.startsWith("_{")) out.push(new TextRun({ text: t.slice(2, -1), ...base, subScript: true }));
    else out.push(new TextRun({ text: t.slice(1, -1), ...base, italics: true }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}
const LINE = 336; // ~1.4 line spacing
const P = (text, keepNext = false) => new Paragraph({ children: runs(text), keepNext, spacing: { after: 140, line: LINE }, alignment: AlignmentType.JUSTIFIED });
const SECTIONS = [];
const H1 = (text) => { SECTIONS.push(text); return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] }); };
// page numbers for the contents table come from a first build (see build.sh); blank on the first pass
const TOC_PAGES = fs.existsSync(path.join(__dirname, "toc_pages.json")) ? JSON.parse(fs.readFileSync(path.join(__dirname, "toc_pages.json"), "utf8")) : {};
const H2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
const B = (text) => new Paragraph({ children: runs(text), numbering: { reference: "bullets", level: 0 }, spacing: { after: 80, line: LINE }, alignment: AlignmentType.JUSTIFIED });
const N = (text, ref) => new Paragraph({ children: runs(text), numbering: { reference: ref, level: 0 }, spacing: { after: 80, line: LINE }, alignment: AlignmentType.JUSTIFIED });

// numbered display equation: centred expression, number flush right
const EQ = (expr, num) => new Paragraph({
  tabStops: [{ type: TabStopType.CENTER, position: Math.round(CONTENT_W / 2) }, { type: TabStopType.RIGHT, position: CONTENT_W }],
  spacing: { before: 100, after: 160 },
  children: [new TextRun({ children: [new Tab()] }), ...runs(expr), new TextRun({ children: [new Tab(), `(${num})`] })],
});

// captions: tables above, figures below
const TCAP = (n, text) => new Paragraph({
  alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 160, after: 100 },
  children: [new TextRun({ text: `Table ${n}: `, bold: true, size: 18 }), new TextRun({ text, size: 18 })],
});
const FCAP = (n, text) => new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { before: 60, after: 220 },
  children: [new TextRun({ text: `Figure ${n}: `, bold: true, size: 18 }), new TextRun({ text, size: 18 })],
});

function imgSize(file) {
  const b = fs.readFileSync(file);
  if (b[0] === 0x89) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), type: "png" };
  let i = 2; // JPEG: find the SOF marker
  while (i < b.length) {
    const marker = b[i + 1], len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7), type: "jpg" };
    i += 2 + len;
  }
  throw new Error("unknown image " + file);
}
function IMG(file, widthPx = 600) {
  const { w, h, type } = imgSize(FIG(file));
  return new Paragraph({
    alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 160, after: 40 },
    children: [new ImageRun({ type, data: fs.readFileSync(FIG(file)), transformation: { width: widthPx, height: Math.round((widthPx * h) / w) } })],
  });
}

const line = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const allBorders = { top: line, bottom: line, left: line, right: line };
function TABLE(header, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const cols = widths.map((w) => Math.round((w / total) * CONTENT_W));
  cols[cols.length - 1] += CONTENT_W - cols.reduce((a, b) => a + b, 0);
  const cell = (t, i, head) => new TableCell({
    borders: allBorders, width: { size: cols[i], type: WidthType.DXA },
    shading: head ? { fill: "E7E6E6", type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    children: [new Paragraph({ children: runs(t, { size: 18, bold: head || undefined }) })],
  });
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: cols,
    rows: [new TableRow({ tableHeader: true, children: header.map((t, i) => cell(t, i, true)) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((t, i) => cell(t, i, false)) }))],
  });
}
const GAP = () => new Paragraph({ children: [], spacing: { after: 120 } });

// ---------- cover page (JIIT style, as in our minor project report) ----------
const C = (text, size, after = 40) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after }, children: [new TextRun({ text, size, bold: true })] });
const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: none, bottom: none, left: none, right: none };
const halfW = Math.round(CONTENT_W / 2);
const L = (text, bold = false) => new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text, bold, size: 24 })] });
const coverNames = new Table({
  width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [halfW, CONTENT_W - halfW],
  rows: [new TableRow({ children: [
    new TableCell({ borders: noBorders, width: { size: halfW, type: WidthType.DXA }, children: [
      L("Name of Students:", true),
      L("Aditya Bansal (23803009)", true), L("Sambhav Ghildiyal (23803005)", true), L("Mudit Maheshwari (23803017)", true),
    ] }),
    new TableCell({ borders: noBorders, width: { size: CONTENT_W - halfW, type: WidthType.DXA }, children: [
      L("Project Supervisor:", true), L("Dr. Pawan Upadhyay", true), L(""),
      L("Panel Members:", true), L("Dr. Alka Singhal", true), L("Ms. Poonam Singh", true),
    ] }),
  ] })],
});
const logo = imgSize(FIG("jiit_logo.jpg"));
const cover = [
  C("Jaypee Institute of Information Technology, Noida", 28),
  C("Department of Computer Science & Engineering", 28, 360),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new ImageRun({ type: "jpg", data: fs.readFileSync(FIG("jiit_logo.jpg")), transformation: { width: 190, height: Math.round((190 * logo.h) / logo.w) } })] }),
  C("Course Name: Major Project", 24),
  C("Program: INTGT M.Tech", 24),
  C("CSE 4th Year 7th Sem", 24),
  C("(2026-2027)", 24, 480),
  C("Project Synopsis", 32, 160),
  C("FairShareAI: Resource-Aware Cost Attribution and Fair Scheduling", 28, 20),
  C("for Shared LLM Inference Infrastructure", 28, 900),
  coverNames,
  new Paragraph({ children: [new PageBreak()] }),
];

// ---------- body ----------
const body = [
  new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "Table of Contents", bold: true, underline: {}, size: 28 })] }),
  "__TOC__",
  new Paragraph({ children: [new PageBreak()] }),

  // 1
  H1("1. Abstract"),
  P("Many organisations now run large language models (LLMs) on their own GPU servers and share them between several teams or customers, who we call tenants. The cost of these servers is usually divided by counting tokens. However, the real GPU cost of a request depends on which other requests it is processed together with, how long its data stays in GPU memory, and how much it slows down other tenants. In this project we are building FairShareAI, a system that measures these costs on the vLLM inference engine, divides them fairly between tenants and uses the measurements to schedule requests more fairly."),
  P("As a first step, we ran a small experiment on a laptop GPU (96 runs, three tenants that use the same number of tokens). Billing by token count put 15 to 21 percent of the GPU time on the wrong tenant, and it over-charged the tenant with long documents rather than under-charging it. A token price with three separately calibrated rates fixed most of this error. What no token price could capture was the effect tenants have on each other, which made one tenant's slowest responses up to 70 times slower. The rest of the project will focus on measuring and pricing this effect on larger models using an 8×A100 GPU cluster."),

  // 2
  H1("2. Introduction"),
  P("Companies that use generative AI heavily are starting to host their own models instead of paying for an external API. A central platform team runs the GPUs, and many teams send requests to the same model server: chat assistants, question answering over long documents, coding agents that make many calls in a row, batch summarisation jobs and so on."),
  P("Inference engines such as vLLM [5] make this sharing efficient in three ways. They process many requests together in each step (batching), they store each request's attention data, called the KV cache, in small blocks of GPU memory, and they reuse the KV cache when a new request starts with the same text as an earlier one (prefix caching). Because of this, the cost of a request is no longer independent of other requests. Two tenants served together use less GPU time than the same two served one after the other. One tenant's long prompt can delay another tenant's reply, and one tenant's memory use can push another tenant's cached data out of the GPU."),
  P("The team running the platform still needs to answer simple questions. Which team caused this month's GPU bill? Is one heavy workload slowing down everyone else? How many GPUs will we need next quarter? Existing monitoring tools show total GPU usage, response times and token counts, but they cannot split the cost of one shared model server between the tenants using it. This project tries to fill that gap."),

  // 3
  H1("3. Problem Statement"),
  P("When several tenants share an LLM server, the GPU time and memory used for each tenant are not proportional to the number of tokens it sends and receives, and tenants affect each other's speed and memory. Billing by token count can therefore make some tenants pay for others, and it hides the slowdown that heavy workloads cause for interactive users."),
  P("Our first experiment (Section 10) made the problem more specific. Plain token counting gives a large error, but a token price with separate rates for new input tokens, cached input tokens and output tokens removes most of it. The part that no token price can fix is the effect tenants have on each other, because it depends on who else is using the server at the same time. This is the main problem the project will work on."),

  // 4
  H1("4. Objectives"),
  P("The objectives of the project are:"),
  N("To record, for each tenant, how much GPU time and GPU memory its requests actually use on the vLLM engine, without storing any prompt text.", "obj"),
  N("To divide the total GPU cost between tenants in a fair and checkable way, and to compare this with billing by token count.", "obj"),
  N("To measure how much one tenant slows down another, and how often it forces another tenant's cached data to be recomputed.", "obj"),
  N("To use these measurements to decide the order in which requests are admitted, and to compare this with existing fair scheduling methods.", "obj"),
  N("To check whether the results from small models still hold for larger models (8B to 70B parameters) on the GPU cluster.", "obj"),
  P("Table 1 lists the research questions behind these objectives and how we will judge the answer to each."),
  TCAP(1, "Research questions"),
  TABLE(["No.", "Research question", "How we will judge it"], [
    ["RQ1", "How accurately can GPU cost be divided between tenants when their requests are batched together?", "Less than 5% of GPU time billed to the wrong tenant, on workloads not used for calibration"],
    ["RQ2", "Is a calibrated token price (three rates) already good enough on large models?", "If it stays under 5% error, we stop working on per-request cost and focus on RQ3"],
    ["RQ3", "How much do tenants slow each other down, and who pays for it under token billing?", "Measured slowdown and extra recomputation when a tenant is added or removed"],
    ["RQ4", "Can scheduling based on these measurements reduce slow responses without reducing throughput?", "Fewer requests missing their response-time target than with the VTC scheduler [6]"],
  ], [9, 50, 41]),
  GAP(),

  // 5
  H1("5. Literature Survey"),
  P("Our work builds mainly on four recent papers. Each of them studies one part of the problem, and none of them covers all of it. We describe them below and compare them in Table 2."),
  H2("5.1 JouleShare: energy attribution for batched LLM serving [1]"),
  P("Luo et al. asked how much GPU energy each request in a batch is really responsible for. To get a fair reference, they re-ran every possible subset of requests on real data-centre GPUs (A800, A40 and H100) and computed each request's Shapley value, a method from game theory that averages a request's extra cost over every order in which it could have been added. They found that dividing energy by token count charges about a quarter of each batch's energy to the wrong requests, and that long prompts are over-charged. Their study only covers energy and compares against plain token counts, not against prices with different rates for input and output tokens."),
  H2("5.2 ISJL: cost alignment in batched LLM serving [2]"),
  P("Yao and Zhou model the cost of a batch mathematically. In their model, each step of a batch costs as much as its largest request needs, so short requests that are batched with long ones effectively pay for the long ones. They propose a scheduling algorithm (Insert-Short-Jobs-with-Limit) with a proven performance guarantee. The work is purely theoretical and simulated; it includes no measurements on real GPUs and does not consider prefix caching."),
  H2("5.3 PrefixShield: responsibility in shared prefix caches [3]"),
  P("Wang and Buyya study what happens when tenants share the same pool of KV cache memory. Even when tenants cannot reuse each other's cached data, one tenant filling the cache can evict another tenant's useful data. PrefixShield keeps a per-tenant \"debt\" of newly created cache blocks and uses it to decide what to evict, which protects the victim's cache hit rate by about 9 percentage points. It is implemented in vLLM, but the debt is counted in blocks and never converted into a cost."),
  H2("5.4 TraceLab: real coding-agent workloads [4]"),
  P("Zhu et al. analysed about 4,300 real sessions of the Claude Code and Codex coding agents. The agents use very long contexts with short outputs, and about 95.7 to 95.8 percent of their input tokens are served from the prefix cache, all of it reused within the same session. Cache misses mostly happen after the user has been idle for more than five minutes and the cached data has been removed. We used their numbers to design the agent workload in our experiment."),
  TCAP(2, "What each paper covers compared with this project"),
  TABLE(["", "JouleShare [1]", "ISJL [2]", "PrefixShield [3]", "TraceLab [4]", "This project"], [
    ["Measures on real GPUs", "Yes", "No (simulation)", "Yes", "Real traces", "Yes"],
    ["Cost measured", "Energy", "Model of GPU time", "Cache blocks", "API price", "GPU time and energy"],
    ["Divides cost between tenants", "Per request", "No", "Blocks only", "No", "Yes"],
    ["Compares with calibrated token prices", "No", "No", "No", "No", "Yes"],
    ["Measures tenants slowing each other", "No", "In theory", "Cache evictions", "No", "Yes"],
  ], [26, 15, 15, 16, 13, 15]),
  GAP(),
  P("Two other ideas are used throughout this project. The vLLM engine [5] provides batching, block-based KV memory and prefix caching. The VTC scheduler [6] shares the server fairly between tenants based on weighted token counts, and we use it as the main baseline for scheduling. The research gap is that no existing work measures GPU time and memory per tenant on a real engine, compares the result with calibrated token prices, and also measures how tenants affect each other."),

  // 6
  H1("6. Scope of the Project"),
  P("The project will cover:"),
  B("a telemetry module for one fixed version of vLLM that records GPU time, memory use and cache events per tenant;"),
  B("a cost ledger that divides the measured GPU time and memory between tenants and adds up to the total cost;"),
  B("a replay tool that re-runs combinations of tenants to compute the fair reference cost;"),
  B("measurements of how much tenants slow each other down and evict each other's cached data;"),
  B("a simple fair scheduler for admitting requests, compared with first-come-first-served and VTC;"),
  B("a basic report and dashboard, tested with 8B, 30B and 70B models on up to 8 A100 GPUs."),
  P("The project will not build a new inference engine, train models, or include enterprise features such as single sign-on or billing integration. Prompt text is never stored. Each tenant's cache is kept separate from the others, because earlier work has shown that a shared prefix cache can leak other users' prompts through response timing [8]."),

  // 7
  H1("7. Tools and Technologies Used"),
  P("The main tools are listed in Table 3."),
  TCAP(3, "Tools and technologies"),
  TABLE(["Component", "Tools / technologies"], [
    ["Inference engine", "vLLM 0.30 with prefix caching and a separate cache per tenant"],
    ["Models", "Qwen2.5-0.5B for the first experiment; open 8B, 30B and 70B models on the cluster"],
    ["Programming", "Python 3.12; TypeScript for the dashboard"],
    ["GPU monitoring", "NVIDIA NVML and DCGM (power, energy, memory), vLLM metrics"],
    ["Data analysis", "NumPy, SciPy, pandas, Matplotlib"],
    ["Storage", "PostgreSQL for the cost ledger, Parquet files for experiment data, Grafana for charts"],
    ["Environment", "Git, Docker, Slurm or Kubernetes on the cluster"],
    ["Hardware", "RTX 3050 laptop GPU (4 GB) for the first experiment; 8 NVIDIA A100 GPUs on the cluster"],
  ], [24, 76]),
  GAP(),

  // 8
  H1("8. Design of the Project"),
  P("Figure 1 shows the planned design. Serving requests is kept separate from cost accounting, so users never have to wait for the accounting part."),
  IMG("architecture.png", 600),
  FCAP(1, "System design of FairShareAI"),
  B("Gateway: receives requests from applications, identifies the tenant from its API key and applies limits."),
  B("Admission control: decides which tenant's request goes to the engine next, based on how much each tenant has already used."),
  B("vLLM engine: runs the model. A small adapter records which requests were processed together, how long each step took, and when cache blocks were created, reused or removed."),
  B("Event collector: stores these records without any prompt text."),
  B("Cost ledger: divides the measured GPU time and memory between tenants and adds up to the total cost of the server."),
  B("Replay and calibration: re-runs combinations of tenants to find the fair reference cost and to calibrate the ledger."),
  B("Reports: show each tenant's cost and how much it was slowed down by others."),

  // 9
  H1("9. Implementation Details"),
  H2("9.1 Dividing GPU time between requests"),
  P("The engine works in steps, and each step processes a batch of requests. For each step we measure its GPU time. We then give every request in the step a weight based on how much work it needs (for example, how many new tokens it adds and how long its context is), and divide the step's time in proportion to these weights, as in equation (1):", true),
  EQ("share of request i = weight of i / total weight of the step", 1),
  P("Adding up these shares over all steps gives each request's GPU time, and adding up requests gives each tenant's GPU time."),
  H2("9.2 Measuring memory use"),
  P("Each request's KV cache occupies some GPU memory for some amount of time. We measure memory use as memory multiplied by time (in GiB-seconds), in the same way electricity is billed in kilowatt-hours. If several requests share the same cache block, the block is counted only once."),
  H2("9.3 The fair reference cost"),
  P("To know whether a billing method is right, we need a fair reference. We use the Shapley value, the same method used by JouleShare [1]. We run every combination of tenants separately (A alone, B alone, A with B, and so on) and measure the GPU time of each run. A tenant's Shapley value is the average extra GPU time it adds when it joins, taken over every possible order in which the tenants could have joined. For example, if A alone takes 10 seconds, B alone takes 10 seconds and both together take 14 seconds, each is charged 7 seconds and the 6 seconds saved by batching are shared equally. With three tenants this needs seven runs, which is practical. We also report two simpler references: each tenant's cost when running alone, and the extra cost when a tenant is added last (leave-one-out)."),
  H2("9.4 Measuring how tenants affect each other"),
  P("To measure the effect of tenant B on tenant A, we compare A's response times, and the amount of A's cached data that had to be recomputed, in runs with and without B. We report these effects in seconds and in recomputed tokens. Turning them into money is a separate decision that we will document."),
  H2("9.5 Fair scheduling"),
  P("The scheduler keeps a running total of the service each tenant has received, measured in GPU time and memory rather than in tokens. When several requests are waiting, it admits the next request from the tenant that has received the least service so far, and only when there is enough free GPU memory. This is similar to the VTC scheduler [6], but based on measured cost."),
  H2("9.6 Experiments on the cluster"),
  P("We will start with an 8B model on one A100 GPU for calibration and interference experiments, then use two GPUs to study routing between copies of the model, and four to eight GPUs for 30B and 70B models that have to be split across GPUs. The number of GPU-hours will be worked out from the final list of experiments."),

  // 10
  H1("10. Preliminary Work and Results"),
  P("Before getting access to the cluster, we ran a small experiment on a laptop to check whether the problem is real and how big it is. This was only an experiment; it does not include the gateway, ledger or scheduler. Figure 2 shows the steps and Table 4 gives the setup."),
  IMG("poc_workflow.png", 600),
  FCAP(2, "Steps followed in the experiment"),
  TCAP(4, "Experiment setup"),
  TABLE(["Item", "Setting"], [
    ["Hardware and engine", "RTX 3050 laptop GPU (4 GB); vLLM 0.30.0"],
    ["Model", "Qwen2.5-0.5B-Instruct"],
    ["Tenants", "Chat: about 127 short requests. Docs: about 10 requests with long documents (6,000 to 12,000 tokens). Agent: 4 sessions of 6 calls each, where the context grows and is reused from the cache. All three tenants use about 100,000 tokens each."],
    ["Cache", "Each tenant has its own cache; tenants cannot reuse each other's data"],
    ["GPU memory for the KV cache", "Three settings: roomy (about 104,000 tokens), tight (22,400 tokens) and very tight (13,600 tokens)"],
    ["Runs", "All 7 combinations of tenants, 4 different random workloads, 3 memory settings, plus repeated runs to check noise: 96 runs of about 60 seconds each"],
    ["Cost measured", "GPU busy time (main); GPU energy (checked separately and gave the same conclusions)"],
    ["Billing methods compared", "Plain token count; API-style price (output tokens cost 5 times input, cached input costs one tenth); three-rate price calibrated from single-tenant runs; each tenant's cost when running alone; leave-one-out; memory-time"],
  ], [24, 76]),
  GAP(),
  H2("10.1 How accurate is each billing method?"),
  P("For each billing method we calculated the percentage of GPU time that it bills to the wrong tenant, compared with the Shapley reference. Repeating a run changed the result by less than 0.2 percent, so the differences are real and not measurement noise. Figure 3 and Table 5 show the results; each value is the average over the four random workloads."),
  IMG("nl1_busy.png", 600),
  FCAP(3, "Percentage of GPU time billed to the wrong tenant by each method (average and spread over 4 workloads)"),
  TCAP(5, "Percentage of GPU time billed to the wrong tenant"),
  TABLE(["Billing method", "Roomy memory", "Tight memory", "Very tight memory"], [
    ["Plain token count", "21.0 ± 2.9", "19.9 ± 3.0", "15.3 ± 2.3"],
    ["API-style price", "15.2 ± 2.7", "11.4 ± 3.4", "8.1 ± 1.4"],
    ["Calibrated three-rate price", "4.9 ± 1.9", "3.5 ± 0.8", "2.7 ± 2.1"],
    ["Cost when running alone", "4.4 ± 1.2", "3.6 ± 0.6", "1.9 ± 1.0"],
    ["Leave-one-out", "14.3 ± 3.5", "9.9 ± 2.0", "7.4 ± 1.5"],
    ["Memory-time", "32.6 ± 3.2", "29.4 ± 1.9", "22.8 ± 2.3"],
  ], [40, 20, 20, 20]),
  GAP(),
  P("Figure 4 shows the split for each tenant at the tight memory setting. Each tenant uses about a third of the tokens, but the Shapley reference gives the chat tenant 53 percent of the GPU time, the docs tenant 18 percent and the agent 29 percent."),
  IMG("shares_tight.png", 600),
  FCAP(4, "Share of GPU time given to each tenant by each billing method at the tight memory setting (the dashed line is the Shapley reference)"),
  H2("10.2 How much do tenants affect each other?"),
  P("Figures 5 and 6 and Table 6 show the effects that token counts cannot capture. When the docs tenant runs alongside chat, its long prompts delay chat's replies. When memory is tight, the other tenants also push the agent's cached context out of memory, so the agent has to recompute it."),
  IMG("chat_ttft.png", 600),
  FCAP(5, "Time until the chat tenant's slowest 5 percent of replies start (95th percentile time to first token), alone and with other tenants (log scale)"),
  IMG("agent_bill.png", 520),
  FCAP(6, "Agent's bill under API-style pricing for exactly the same work, depending on which other tenants are running"),
  TCAP(6, "Effects when all three tenants run together"),
  TABLE(["Measurement", "Tenant alone", "Roomy / tight / very tight memory"], [
    ["Chat: 95th percentile time to first token", "0.11 s", "1.20 / 3.66 / 7.37 s"],
    ["Chat: median time to first token", "0.07 s", "0.09 / 0.25 / 1.88 s"],
    ["Agent: share of input read from cache", "77%", "77% / 41% / 23%"],
    ["Agent: bill under API-style pricing", "1.00×", "1.00× / 1.54× / 1.64×"],
  ], [42, 16, 42]),
  GAP(),
  H2("10.3 Discussion"),
  P("Billing by token count is clearly inaccurate: it puts 15 to 21 percent of the GPU time on the wrong tenant, which is similar to what JouleShare [1] found for energy. What surprised us was the direction. The docs tenant, with long prompts, was over-charged, and the chat tenant, with many short requests, was under-charged. The reason is that the model reads all the tokens of a prompt in one go, which is cheap per token, but writes its answer one token at a time, which is expensive per token. The chat tenant generates far more output tokens than the docs tenant."),
  P("A better token price fixes most of this. The usual API ratio, where output costs five times as much as input, removes only about a quarter to a half of the error. When we calibrated the three rates from single-tenant runs, an output token turned out to cost 14 to 16 times as much as an input token on our hardware, and the error dropped to between 3 and 5 percent. Charging by memory-time was the worst method, because the tenant holding the most memory (docs) was not the one using the most GPU time."),
  P("What pricing cannot fix is the effect tenants have on each other. The chat tenant's slowest replies were up to 70 times slower when it shared the GPU. The agent lost up to 70 percent of its cache hits because of other tenants and, under API-style pricing, paid up to 64 percent more for the same work, while the tenants that caused this paid nothing extra. This is why the main part of the project will focus on measuring and pricing these effects."),
  H2("10.4 Limitations"),
  P("These results come from a very small model (0.5 billion parameters) on a laptop GPU. On larger models the fixed overhead of each step is smaller, so the savings from batching and the exact numbers may change. The workloads are synthetic, there are only three tenants, and the calibrated price was tested on new random workloads of the same three types rather than on completely different workloads. The cluster experiments are planned to check these points."),

  // 11
  H1("11. Testing Details"),
  H2("11.1 Correctness testing"),
  B("Unit tests for the cost ledger: the shares must always add up to the total cost, and a memory block shared by two requests must not be counted twice."),
  B("Tests for unusual cases: duplicate events, the engine restarting in the middle of a request, and a user disconnecting before the reply is finished."),
  B("A privacy test to check that no prompt text leaves the event collector."),
  H2("11.2 Evaluation"),
  P("Table 7 lists what we will measure and what we will compare against."),
  TCAP(7, "Evaluation plan"),
  TABLE(["Area", "What we will measure", "Compared with"], [
    ["Cost accuracy", "Percentage of GPU time billed to the wrong tenant, compared with the Shapley reference", "Token count, API-style price, calibrated three-rate price"],
    ["Speed", "Time to first token, time per output token, 95th and 99th percentile response times, throughput", "vLLM default scheduling"],
    ["Fairness", "Service received by each tenant, number of requests that miss their response-time target", "First-come-first-served, VTC [6]"],
    ["Overhead", "Drop in throughput when our telemetry is switched on", "Telemetry switched off"],
  ], [18, 52, 30]),
  GAP(),
  H2("11.3 Acceptance criteria"),
  B("The cost ledger bills less than 5 percent of GPU time to the wrong tenant on workloads it was not calibrated on."),
  B("The scheduler reduces the number of requests that miss their response-time target compared with VTC, without leaving any tenant waiting indefinitely."),
  B("Telemetry reduces throughput by less than 2 percent."),

  // 12
  H1("12. Project Timeline"),
  P("Table 8 shows the planned schedule. The literature review and the first experiment are complete; the remaining work starts when cluster access is available."),
  TCAP(8, "Project timeline"),
  TABLE(["S.No.", "Work", "Weeks", "Status"], [
    ["1", "Literature review and study of the proposal", "1 to 3", "Completed"],
    ["2", "Laptop experiment (96 runs)", "3 to 4", "Completed"],
    ["3", "Cluster setup and vLLM telemetry adapter", "5 to 6", "Planned"],
    ["4", "Event format, cost ledger and cost checks", "6 to 8", "Planned"],
    ["5", "Calibration and fair reference runs on an 8B model", "8 to 11", "Planned"],
    ["6", "Experiments with 30B and 70B models on multiple GPUs", "11 to 14", "Planned"],
    ["7", "Measuring how tenants slow each other down and evict each other's cache", "12 to 15", "Planned"],
    ["8", "Fair scheduler and comparison with VTC", "15 to 18", "Planned"],
    ["9", "Reports and dashboard", "17 to 19", "Planned"],
    ["10", "Evaluation and final report", "19 to 22", "Planned"],
  ], [9, 59, 16, 16]),
  GAP(),

  // 13
  H1("13. Expected Outcomes"),
  N("A telemetry module for vLLM that records GPU time, memory and cache events per tenant without storing prompts.", "out"),
  N("A cost ledger that divides the cost of a shared LLM server fairly between tenants.", "out"),
  N("Measurements of how much tenants slow each other down and evict each other's cached data.", "out"),
  N("A fair scheduler compared with first-come-first-served and VTC.", "out"),
  N("A report and dashboard showing each tenant's cost, and a final project report.", "out"),

  // 14
  H1("14. References"),
  ...[
    "Q. Luo, K. Li, Z. Wang, D. Wang and Y. Chen, \"Request-Level Energy Attribution for Batched LLM Serving (JouleShare),\" arXiv:2608.00026, 2026.",
    "D. Yao and Z. Zhou, \"Efficiency and Cost Alignment in Batched LLM Serving via Resource-Fair Scheduling,\" arXiv:2608.02244, 2026.",
    "Z. Wang and R. Buyya, \"Preserving Admission Responsibility in Multi-Tenant Large Language Model Prefix Caches (PrefixShield),\" arXiv:2608.01657, 2026.",
    "K. Zhu, M. Jacob, C. Ma, Y. Pan, S. Wang, A. Krishnamurthy and B. Kasikci, \"TraceLab: Characterizing Coding Agent Workloads for LLM Serving,\" arXiv:2606.30560, 2026.",
    "W. Kwon et al., \"Efficient Memory Management for Large Language Model Serving with PagedAttention,\" in Proc. ACM SOSP, 2023.",
    "Y. Sheng et al., \"Fairness in Serving Large Language Models,\" in Proc. USENIX OSDI, 2024.",
    "L. S. Shapley, \"A Value for n-Person Games,\" in Contributions to the Theory of Games II, Princeton University Press, 1953.",
    "G. Wu et al., \"I Know What You Asked: Prompt Leakage via KV-Cache Sharing in Multi-Tenant LLM Serving,\" in Proc. NDSS, 2025.",
  ].map((t) => N(t, "refs")),
];

// contents table: S.No. | Topic | Page No. (main sections only)
function tocTable() {
  const cols = [1300, CONTENT_W - 1300 - 1500, 1500];
  const c = (t, i, head, align) => new TableCell({
    borders: allBorders, width: { size: cols[i], type: WidthType.DXA },
    shading: head ? { fill: "E7E6E6", type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 70, bottom: 70, left: 120, right: 120 },
    children: [new Paragraph({ alignment: align, children: [new TextRun({ text: t, size: 24, bold: head || undefined })] })],
  });
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: cols,
    rows: [
      new TableRow({ tableHeader: true, children: [c("S.No.", 0, true, AlignmentType.CENTER), c("Topic", 1, true, AlignmentType.LEFT), c("Page No.", 2, true, AlignmentType.CENTER)] }),
      ...SECTIONS.map((t) => {
        const m = t.match(/^(\d+)\.\s+(.*)$/);
        return new TableRow({ cantSplit: true, children: [c(m[1], 0, false, AlignmentType.CENTER), c(m[2], 1, false, AlignmentType.LEFT), c(String(TOC_PAGES[t] ?? ""), 2, false, AlignmentType.CENTER)] });
      }),
    ],
  });
}
body.splice(body.indexOf("__TOC__"), 1, tocTable());

// ---------- document ----------
const listCfg = (ref, text) => ({
  reference: ref, levels: [{ level: 0, format: LevelFormat.DECIMAL, text, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 425 } } } }],
});
const page = { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440, header: 700 } };
const doc = new Document({
  creator: "Aditya Bansal, Sambhav Ghildiyal, Mudit Maheshwari",
  title: "FairShareAI - Major Project Synopsis",
  styles: {
    default: { document: { run: { font: FONT, size: 24 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, font: FONT, color: "000000" }, paragraph: { spacing: { before: 360, after: 180 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true, font: FONT, color: "000000" }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "●", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 340 } }, run: { size: 16 } } }] },
      listCfg("obj", "%1."), listCfg("out", "%1."), listCfg("refs", "[%1]"),
    ],
  },
  sections: [
    { properties: { page }, children: cover },
    {
      properties: { page: { ...page, pageNumbers: { start: 1 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT], size: 20 })] })] }) },
      children: body,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(path.join(__dirname, "FairShareAI_Major_Project_Synopsis.docx"), buf);
  console.log("written");
});
