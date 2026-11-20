// Builds FairShareAI_Major_Project_Report.docx, the final major project report (JIIT capstone template).
// Run from report/:  ./build_report.sh   (node build_report.js, then LibreOffice fills in the contents lists and exports a PDF)
// Figures: make_report_figures.py (figures/report/) and make_diagrams.py (figures/architecture.png, poc_workflow.png).
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, LevelFormat, PageBreak, Footer, PageNumber, NumberFormat,
  TabStopType, Tab, TableOfContents, StyleLevel, VerticalAlign, HeightRule,
} = require("docx");

const FIG = (p) => path.join(__dirname, "figures", p);
const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1134; // A4, 2 cm margins (template)
const CONTENT_W = PAGE_W - 2 * MARGIN; // 9638 DXA
const FONT = "Times New Roman";
const LINE = 360; // 1.5 line spacing (template)

const TITLE = "FairShareAI: Resource-Aware Cost Attribution and Fair Scheduling for Shared LLM Inference Infrastructure";
const SUPERVISOR = "Dr. Pawan Upadhyay";
const SUP_DESIG = "Assistant Professor, Department of CSE & IT, JIIT Noida";
const STUDENTS = [["23803009", "Aditya Bansal"], ["23803005", "Sambhav Ghildiyal"], ["23803017", "Mudit Maheshwari"]];
const SESSION = "2026 - 2027";

// ---------- references: numbered in order of first citation (IEEE) ----------
const REFS = {
  orca: `G.-I. Yu, J. S. Jeong, G.-W. Kim, S. Kim and B.-G. Chun, "Orca: A Distributed Serving System for Transformer-Based Generative Models," in *Proc. 16th USENIX Symp. Operating Systems Design and Implementation (OSDI)*, 2022, pp. 521–538.`,
  vllm: `W. Kwon, Z. Li, S. Zhuang, Y. Sheng, L. Zheng, C. H. Yu, J. E. Gonzalez, H. Zhang and I. Stoica, "Efficient Memory Management for Large Language Model Serving with PagedAttention," in *Proc. 29th ACM Symp. Operating Systems Principles (SOSP)*, 2023, pp. 611–626.`,
  sglang: `L. Zheng et al., "SGLang: Efficient Execution of Structured Language Model Programs," in *Advances in Neural Information Processing Systems (NeurIPS)*, 2024.`,
  sarathi: `A. Agrawal et al., "Taming Throughput-Latency Tradeoff in LLM Inference with Sarathi-Serve," in *Proc. 18th USENIX Symp. Operating Systems Design and Implementation (OSDI)*, 2024.`,
  jouleshare: `Q. Luo, K. Li, Z. Wang, D. Wang and Y. Chen, "Request-Level Energy Attribution for Batched LLM Serving," arXiv:2608.00026, Jul. 2026.`,
  shapley: `L. S. Shapley, "A Value for n-Person Games," in *Contributions to the Theory of Games II*, H. W. Kuhn and A. W. Tucker, Eds. Princeton, NJ, USA: Princeton Univ. Press, 1953, pp. 307–317.`,
  vtc: `Y. Sheng, S. Cao, D. Li, B. Zhu, Z. Li, D. Zhuo, J. E. Gonzalez and I. Stoica, "Fairness in Serving Large Language Models," in *Proc. 18th USENIX Symp. Operating Systems Design and Implementation (OSDI)*, 2024.`,
  dlpm: `S. Cao, Y. Wang, Z. Mao, P.-L. Hsu, L. Yin, T. Xia, D. Li, S. Liu, Y. Zhang, Y. Zhou, Y. Sheng, J. Gonzalez and I. Stoica, "Locality-aware Fair Scheduling in LLM Serving," arXiv:2501.14312, Jan. 2025.`,
  justitia: `M. Yang, G. Wang, M. Luo, Y. Liu, C. Chen, H. Zhao, Y. Feng, Q. Chen and M. Guo, "Justitia: Fair and Efficient Scheduling of Task-parallel LLM Agents with Selective Pampering," arXiv:2510.17015, Oct. 2025.`,
  tlf: `D. Bali, S. Ponnapalli, Y. Wang, N. Crooks, S. Shenker and M. Zaharia, "Token Latency Fairness: Performance Isolation for Multi-Tenant LLM Serving," arXiv:2609.18112, Sep. 2026.`,
  isjl: `D. Yao and Z. Zhou, "Efficiency and Cost Alignment in Batched LLM Serving via Resource-Fair Scheduling," arXiv:2608.02244, Aug. 2026.`,
  stepsplit: `Q. Luo, Z. Wang, K. Li, C. Liu and Y. Chen, "Scaling Shapley Energy Attribution to Large LLM Batches," arXiv:2611.13802, Nov. 2026.`,
  llmvisor: `S. Jin, X. Liu, J. Shan, L. Xu, T. Zhang, L. Xie and Z. M. Mao, "LLMVisor: A Real-Time Latency Attribution Model for Multi-Tenant LLM Serving," arXiv:2608.08382, Aug. 2026.`,
  unalloc: `T. Urista, "Who Pays for the KV Cache? Attributing Shared AI Inference Spend Across Kubernetes and LLM Provider Bills," arXiv:2609.24991, Sep. 2026.`,
  patil: `C. Patil, "Beyond Per-Token Pricing: A Concurrency-Aware Methodology for LLM Infrastructure Cost Estimation," arXiv:2606.11690, Jun. 2026.`,
  prefixshield: `Z. Wang and R. Buyya, "Preserving Admission Responsibility in Multi-Tenant Large Language Model Prefix Caches," arXiv:2608.01657, Aug. 2026.`,
  tracelab: `K. Zhu, M. Jacob, C. Ma, Y. Pan, S. Wang, A. Krishnamurthy and B. Kasikci, "TraceLab: Characterizing Coding Agent Workloads for LLM Serving," arXiv:2606.30560, Jun. 2026.`,
  bursts: `W. Huang and J. Liu, "Bursts That Outlast Themselves: Persistent Degradation in Prefix-Cached Agent Serving," arXiv:2611.13412, Nov. 2026.`,
  leak: `G. Wu et al., "I Know What You Asked: Prompt Leakage via KV-Cache Sharing in Multi-Tenant LLM Serving," in *Proc. Network and Distributed System Security Symp. (NDSS)*, 2025.`,
  drf: `A. Ghodsi, M. Zaharia, B. Hindman, A. Konwinski, S. Shenker and I. Stoica, "Dominant Resource Fairness: Fair Allocation of Multiple Resource Types," in *Proc. 8th USENIX Symp. Networked Systems Design and Implementation (NSDI)*, 2011.`,
  patterson: `D. Patterson, J. Gonzalez, Q. Le, C. Liang, L.-M. Munguia, D. Rothchild, D. So, M. Texier and J. Dean, "Carbon Emissions and Large Neural Network Training," arXiv:2104.10350, Apr. 2021.`,
  luccioni: `A. S. Luccioni, Y. Jernite and E. Strubell, "Power Hungry Processing: Watts Driving the Cost of AI Deployment?," in *Proc. ACM Conf. Fairness, Accountability, and Transparency (FAccT)*, 2024.`,
  qwen: `Qwen Team, "Qwen2.5 Technical Report," arXiv:2412.15115, Dec. 2024.`,
  nnls: `C. L. Lawson and R. J. Hanson, *Solving Least Squares Problems*. Englewood Cliffs, NJ, USA: Prentice-Hall, 1974.`,
  nvml: `NVIDIA Corporation, "NVIDIA Management Library (NVML) API Reference Guide," NVIDIA Developer Documentation. [Online]. Available: https://docs.nvidia.com/deploy/nvml-api/`,
  focus: `FinOps Foundation, "FinOps Open Cost and Usage Specification (FOCUS), Version 1.0," 2024. [Online]. Available: https://focus.finops.org/`,
};
const ORDER = [];
// c() prints nothing (no in-text markers); it only records the order in which works are first mentioned, which orders
// the reference list
const c = (...keys) => {
  for (const k of keys) {
    if (!REFS[k]) throw new Error("unknown reference " + k);
    if (!ORDER.includes(k)) ORDER.push(k);
  }
  return "";
};

// ---------- text helpers ----------
// inline markup: **bold**, *italic*, _{sub}, ^{sup}; sub/superscripts may contain italics and braces
function runs(text, base = {}) {
  const out = [];
  let buf = "", bold = false, ital = false, depth = 0;
  const modes = []; // stack of "sub" / "sup"
  const flush = () => {
    if (!buf) return;
    const m = modes[modes.length - 1];
    out.push(new TextRun({ text: buf, ...base, bold: base.bold || bold || undefined, italics: base.italics || ital || undefined,
      subScript: m === "sub" || undefined, superScript: m === "sup" || undefined }));
    buf = "";
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], nx = text[i + 1];
    if (ch === "*" && nx === "*") { flush(); bold = !bold; i++; }
    else if (ch === "*") { flush(); ital = !ital; }
    else if ((ch === "_" || ch === "^") && nx === "{") { flush(); modes.push(ch === "_" ? "sub" : "sup"); i++; }
    else if (ch === "{" && modes.length) { depth++; buf += ch; }
    else if (ch === "}" && modes.length) { if (depth) { depth--; buf += ch; } else { flush(); modes.pop(); } }
    else buf += ch;
  }
  flush();
  return out;
}
const P = (text, opts = {}) => new Paragraph({ children: runs(text), spacing: { after: 120, line: LINE }, alignment: AlignmentType.JUSTIFIED, ...opts });
const PC = (text, opts = {}) => new Paragraph({ children: runs(text), spacing: { after: 120, line: LINE }, alignment: AlignmentType.CENTER, ...opts });
let firstInSection = false;
const H1 = (text) => {
  const p = new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: !firstInSection, children: [new TextRun(text)] });
  firstInSection = false;
  return p;
};
const H2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
const H3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] });
const B = (text, level = 0) => new Paragraph({ children: runs(text), numbering: { reference: "bullets", level }, spacing: { after: 60, line: LINE }, alignment: AlignmentType.JUSTIFIED });
let listNo = 0;
const NL = (items) => { const ref = `num${listNo++}`; NUM_REFS.push(ref); return items.map((t) => new Paragraph({ children: runs(t), numbering: { reference: ref, level: 0 }, spacing: { after: 60, line: LINE }, alignment: AlignmentType.JUSTIFIED })); };
const NUM_REFS = [];
const GAP = (after = 120) => new Paragraph({ children: [], spacing: { after, line: 240 } });

// numbered display equation: expression centred, number flush right
const EQ = (expr, num) => new Paragraph({
  tabStops: [{ type: TabStopType.CENTER, position: Math.round(CONTENT_W / 2) }, { type: TabStopType.RIGHT, position: CONTENT_W }],
  spacing: { before: 80, after: 160, line: LINE }, keepLines: true,
  children: [new TextRun({ children: [new Tab()] }), ...runs(expr), new TextRun({ children: [new Tab(), `(${num})`] })],
});

// captions: tables above, figures below; their styles feed the List of Figures / List of Tables
const TCAP = (n, text) => new Paragraph({ style: "TableCaption", keepNext: true, children: [new TextRun({ text: `Table ${n}: `, bold: true }), ...runs(text)] });
const FCAP = (n, text) => new Paragraph({ style: "FigureCaption", children: [new TextRun({ text: `Figure ${n}: `, bold: true }), ...runs(text)] });

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
const MAX_PX = 640; // content width at 96 px per inch
function IMG(file, widthPx = MAX_PX) {
  const { w, h, type } = imgSize(FIG(file));
  return new Paragraph({
    alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60 },
    children: [new ImageRun({ type, data: fs.readFileSync(FIG(file)), transformation: { width: widthPx, height: Math.round((widthPx * h) / w) } })],
  });
}
const FIGURE = (file, n, caption, widthPx) => [IMG(file, widthPx), FCAP(n, caption)];

const line = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const allBorders = { top: line, bottom: line, left: line, right: line };
const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: none, bottom: none, left: none, right: none };
function colWidths(widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const cols = widths.map((w) => Math.round((w / total) * CONTENT_W));
  cols[cols.length - 1] += CONTENT_W - cols.reduce((a, b) => a + b, 0);
  return cols;
}
function TABLE(header, rows, widths, { size = 20, center = [] } = {}) {
  const cols = colWidths(widths);
  const cell = (t, i, head) => new TableCell({
    borders: allBorders, width: { size: cols[i], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    shading: head ? { fill: "E7E6E6", type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: String(t).split("\n").map((ln) => new Paragraph({
      alignment: head || center.includes(i) ? AlignmentType.CENTER : AlignmentType.LEFT, spacing: { after: 0, line: 240 },
      children: runs(ln, { size, bold: head || undefined }),
    })),
  });
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: cols,
    rows: [new TableRow({ tableHeader: true, cantSplit: true, children: header.map((t, i) => cell(t, i, true)) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((t, i) => cell(t, i, false)) }))],
  });
}
// code listing in a light box
function CODE(text) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [CONTENT_W],
    rows: [new TableRow({ children: [new TableCell({
      borders: { top: line, bottom: line, left: line, right: line }, width: { size: CONTENT_W, type: WidthType.DXA },
      shading: { fill: "F4F4F2", type: ShadingType.CLEAR, color: "auto" }, margins: { top: 80, bottom: 80, left: 140, right: 100 },
      children: text.replace(/^\n/, "").replace(/\s+$/, "").split("\n").map((ln) => new Paragraph({
        spacing: { after: 0, line: 228 }, children: [new TextRun({ text: ln.length ? ln : " ", font: "Courier New", size: 17 })],
      })),
    })] })],
  });
}
const LCAP = (n, text) => new Paragraph({ style: "ListingCaption", keepNext: true, children: [new TextRun({ text: `Listing ${n}: `, bold: true }), ...runs(text)] });

// signature table used on the declaration pages
function signTable(third = "Signature") {
  const cols = colWidths([25, 45, 30]);
  const cell = (t, i, head) => new TableCell({
    borders: allBorders, width: { size: cols[i], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    shading: head ? { fill: "E7E6E6", type: ShadingType.CLEAR, color: "auto" } : undefined,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t, bold: head || undefined })] })],
  });
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: cols,
    rows: [new TableRow({ children: ["Student ID", "Student Name", third].map((t, i) => cell(t, i, true)) }),
      ...STUDENTS.map(([id, name]) => new TableRow({ height: { value: 640, rule: HeightRule.ATLEAST }, cantSplit: true, children: [cell(id, 0), cell(name, 1), cell("", 2)] }))],
  });
}

// ---------- cover page (the department's sample front page) ----------
const CV = (children, after = 0, size = 24) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after, line: 276 }, children: typeof children === "string" ? [new TextRun({ text: children, size })] : Array.isArray(children) ? children : [children] });
const logo = imgSize(FIG("jiit_logo.jpg"));
const coverStudents = (() => {
  const cols = [1800, 2900];
  const tw = cols[0] + cols[1];
  const cell = (t, i, bold) => new TableCell({
    borders: noBorders, width: { size: cols[i], type: WidthType.DXA },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: t, bold, size: 24 })] })],
  });
  return new Table({
    width: { size: tw, type: WidthType.DXA }, columnWidths: cols, alignment: AlignmentType.CENTER,
    rows: [new TableRow({ children: [cell("Enrol. No.", 0, true), cell("Name of Student", 1, true)] }),
      ...STUDENTS.map(([id, n]) => new TableRow({ children: [cell(id, 0, false), cell(n, 1, false)] }))],
  });
})();
const cover = [
  CV(new TextRun({ text: "Jaypee Institute of Information Technology, Noida", bold: true, size: 32 }), 160),
  CV("Department of Computer Science & Engineering and IT", 600, 26),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 900 }, children: [new ImageRun({ type: "jpg", data: fs.readFileSync(FIG("jiit_logo.jpg")), transformation: { width: 230, height: Math.round((230 * logo.h) / logo.w) } })] }),
  CV([new TextRun({ text: "Major Project Title: ", bold: true, size: 28 }), new TextRun({ text: TITLE, size: 28 })], 900),
  coverStudents,
  CV("", 1000),
  CV("Course Name: Major Project 1", 40),
  CV("Program: INTGT M.Tech (CSE)", 40),
  CV([new TextRun({ text: "7", size: 24 }), new TextRun({ text: "th", size: 24, superScript: true }), new TextRun({ text: " Sem", size: 24 })], 700),
  CV(new TextRun({ text: SESSION, bold: true, size: 24 }), 0),
  new Paragraph({ children: [new PageBreak()] }),
];

// ---------- preliminary pages ----------
const studentList = "Aditya Bansal (23803009), Sambhav Ghildiyal (23803005) and Mudit Maheshwari (23803017)";
const sigLine = (left, right) => new Table({
  width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [CONTENT_W / 2, CONTENT_W / 2],
  rows: [new TableRow({ children: [left, right].map((lines, i) => new TableCell({
    borders: noBorders, width: { size: CONTENT_W / 2, type: WidthType.DXA },
    children: lines.map((t, j) => new Paragraph({ alignment: i ? AlignmentType.RIGHT : AlignmentType.LEFT, spacing: { after: 20, line: 276 }, children: [new TextRun({ text: t, bold: j === 1 })] })),
  })) })],
});

firstInSection = true;
const prelims = [
  H1("CERTIFICATE"),
  P(`This is to certify that the project report titled "${TITLE}" is a record of bona fide work carried out by ${studentList} of INTGT M.Tech. (Computer Science and Engineering) during the academic session ${SESSION}, in partial fulfilment of the requirements for the award of the said degree.`),
  P("The work presented in this report has been carried out under my supervision and, to the best of my knowledge, has not been submitted elsewhere for the award of any degree or diploma."),
  GAP(1400),
  sigLine(["(Signature of Supervisor)", SUPERVISOR, "Assistant Professor", "Department of CSE & IT", "JIIT Noida"],
          ["(Signature of Head of Department)", "Head of Department", "Department of CSE & IT", "JIIT Noida"]),
  GAP(600),
  P("Date: ____________________"),
  P("Place: Noida"),

  H1("DECLARATION OF ORIGINALITY"),
  P(`We hereby declare that the work presented in this major project report titled "${TITLE}" is an authentic record of our own work carried out at the Department of Computer Science & Engineering and IT, Jaypee Institute of Information Technology, Noida, under the supervision of ${SUPERVISOR}.`),
  P("We further declare that the matter embodied in this report has not been submitted in part or in full for the award of any other degree or diploma of this institute or any other institute or university. All sources of information used have been duly acknowledged in the references."),
  GAP(300),
  P("Place: Jaypee Institute of Information Technology, Noida"),
  P("Date: ____________________"),
  GAP(200),
  signTable(),

  H1("STUDENTS' SELF DECLARATION"),
  P("We, the undersigned, hereby declare the following usage of open-source code and pre-built libraries in our major project carried out during the Seventh Semester, with the consent of our project supervisor. All libraries are used in compliance with their licences, through their public interfaces, and none of their source code was modified."),
  H3("A. Open-source libraries and tools used"),
  TABLE(["Library / tool", "Licence", "Purpose in the project"], [
    ["vLLM 0.30.0", "Apache 2.0", "LLM inference engine: continuous batching, paged KV cache, prefix caching"],
    ["PyTorch (installed with vLLM)", "BSD-3-Clause", "Tensor runtime used by vLLM on the GPU"],
    ["Qwen2.5-0.5B, 7B and 14B-Instruct", "Apache 2.0", "The language models served in the experiments"],
    ["nvidia-ml-py (pynvml)", "BSD-3-Clause", "GPU power, energy counter, utilisation and per-process readings"],
    ["psutil", "BSD-3-Clause", "Process and CPU-load information"],
    ["NumPy, SciPy", "BSD-3-Clause", "Numerical work; non-negative least squares (scipy.optimize.nnls)"],
    ["Matplotlib", "Matplotlib licence (BSD-style)", "Charts and diagrams"],
    ["uv", "Apache 2.0 / MIT", "Python environment management on the laptop and the cluster"],
    ["docx (npm)", "MIT", "Generating this report document only; not part of the system"],
  ], [27, 20, 53], { size: 18 }),
  H3("B. Pre-built methods reused"),
  P("The Shapley value from cooperative game theory as the fair reference cost; the normalised L1 distance between cost shares, as used in JouleShare, as the error metric; and the Lawson–Hanson non-negative least-squares algorithm, through SciPy."),
  H3("C. Percentage of pre-written source code"),
  P("Percentage of pre-written source code: ________ %"),
  P("Percentage of source code written by us: ________ %"),
  GAP(100),
  signTable("Student Signature"),

  H1("DECLARATION BY SUPERVISOR"),
  P(`I, ${SUPERVISOR}, ${SUP_DESIG}, declare that the project titled "${TITLE}" was carried out under my supervision. The project is original and has neither been copied from any external source nor submitted earlier at JIIT.`),
  GAP(300),
  P("Remarks (if any): ____________________________________________________________"),
  P("________________________________________________________________________________"),
  GAP(600),
  P("Signature (Supervisor): _______________________________"),
  P("Date: ____________________"),

  H1("ACKNOWLEDGEMENT"),
  P(`We express our sincere gratitude to our project supervisor, ${SUPERVISOR}, ${SUP_DESIG}, for continuous guidance, encouragement and critical feedback throughout this work. The suggestions on how to frame the research questions and how to evaluate the results shaped this project from the synopsis to the final report.`),
  P("We thank the members of our evaluation panel, Dr. Alka Singhal and Ms. Poonam Singh, for their questions and comments during the project reviews, which pushed us to test our claims more carefully."),
  P("We are grateful to the Department of Computer Science & Engineering and IT at JIIT Noida for the academic environment, and to the administrators of the institute's Ramanujan Universe (RU) high-performance computing facility for access to its NVIDIA A100 GPUs and for responding to our requests during the experiments."),
  P("Finally, we thank our families and friends for their support and patience during the course of this project."),
  GAP(400),
  signTable("Student Signature"),

  H1("ABSTRACT"),
  P("Organisations increasingly host large language models (LLMs) on their own GPU servers and divide the cost among internal teams or customers, called tenants, by counting tokens. On modern inference engines such as vLLM, however, the GPU cost of a request depends on which requests it is batched with, how long its key–value (KV) cache occupies memory, and whether other tenants push its cached context out of memory. This project measures how far token billing departs from a fair division of cost, and what a fair alternative requires."),
  P("We built a measurement harness that replays every combination of three tenants (an interactive chat service, a long-document service and a multi-turn coding agent, each sending about 100,000 tokens per minute) on a vLLM 0.30 engine and records GPU busy time and dynamic energy. The exact Shapley value of these costs is the fair reference, and seven billing methods are compared against it. We ran three setups (Qwen2.5-0.5B on a laptop GPU, and Qwen2.5-7B and 14B on an NVIDIA A100 of JIIT's Ramanujan Universe cluster) at three KV-cache memory levels: 288 replays, each guarded against other users' jobs on the shared cluster."),
  P("Token billing put 11–21% of the bill on the wrong tenant in every setup. The fair split itself moved with model size (chat's fair share fell from 53% on 7B to 35% on 14B), so no fixed token formula, including commercial API price ratios, can be fair across models. Memory pressure added 15%, 25% and 47% to the cost of serving all tenants on the three setups, a cost that benchmarks of each tenant alone cannot see, and the tenant whose cache was evicted paid 35–64% more for identical work. A three-rate token price fitted to measured Shapley values stayed within the project's error target in every condition, while prices fitted to cost totals did not."),
  P("The result is a practical recipe for platform teams: measure Shapley values periodically by replay and bill per token in between. It makes the hidden cost of memory contention visible and supports fairer and more efficient use of energy-intensive GPU infrastructure."),
  P("**Keywords:** LLM serving, multi-tenant GPU sharing, cost attribution, Shapley value, KV cache, vLLM, chargeback."),

  new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: "TABLE OF CONTENTS", bold: true, size: 32 })] }),
  new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }),

  H1("LIST OF FIGURES"),
  new TableOfContents("List of Figures", { hyperlink: true, stylesWithLevels: [new StyleLevel("FigureCaption", 1)] }),

  H1("LIST OF TABLES"),
  new TableOfContents("List of Tables", { hyperlink: true, stylesWithLevels: [new StyleLevel("TableCaption", 1)] }),

  H1("LIST OF ABBREVIATIONS"),
  TABLE(["Abbreviation", "Full form"], [
    ["A100", "NVIDIA A100 Tensor Core GPU (80 GB, SXM4 form factor in this project)"],
    ["API", "Application Programming Interface"],
    ["bf16 / fp16", "16-bit brain floating point / 16-bit IEEE floating point"],
    ["CPU", "Central Processing Unit"],
    ["CSE", "Computer Science and Engineering"],
    ["CUDA", "Compute Unified Device Architecture (NVIDIA's GPU programming platform)"],
    ["GiB", "Gibibyte (2^{30} bytes)"],
    ["GPU", "Graphics Processing Unit"],
    ["HPC", "High-Performance Computing"],
    ["JIIT", "Jaypee Institute of Information Technology"],
    ["JSONL", "JSON Lines (one JSON record per line)"],
    ["KV cache", "Key–value cache (the attention keys and values a transformer keeps for each token)"],
    ["LLM", "Large Language Model"],
    ["LOO", "Leave-one-out (marginal cost)"],
    ["nL1", "Normalised L1 distance between cost shares"],
    ["NNLS", "Non-negative least squares"],
    ["NVML", "NVIDIA Management Library"],
    ["PBS", "Portable Batch System (the cluster's job scheduler)"],
    ["PO / PSO", "Programme Outcome / Programme Specific Outcome"],
    ["PoC", "Proof of concept"],
    ["pp", "Percentage points"],
    ["RU", "Ramanujan Universe (JIIT's HPC cluster)"],
    ["SD", "Standard deviation"],
    ["SM", "Streaming multiprocessor (a GPU compute unit)"],
    ["TTFT", "Time to first token"],
    ["VPN", "Virtual Private Network"],
    ["VTC", "Virtual Token Counter (a fair scheduler for LLM serving)"],
  ], [25, 75], { size: 22 }),
];

// ---------- chapters ----------
firstInSection = true;
const chapters = [
  // ===================== CHAPTER 1 =====================
  H1("CHAPTER 1: INTRODUCTION"),
  H2("1.1 Background"),
  P(`Companies that use generative AI heavily are moving from paying for an external API to hosting open models on their own GPU servers. A central platform team runs the GPUs, and many internal teams or customers, which we call **tenants**, send requests to the same model server: chat assistants, question answering over long documents, coding agents that make many calls in a row, and batch jobs. The platform team then has to answer simple questions. How much of this month's GPU bill did each team cause? Is one heavy workload slowing down everyone else? Which team should pay for more capacity?`),
  P(`Modern inference engines make sharing efficient, but they also make these questions hard. Continuous batching processes many requests together in every step of the engine. vLLM stores each request's attention state, the KV cache, in small fixed-size blocks of GPU memory and can reuse cached blocks when a new request starts with the same tokens as an earlier one (prefix caching, also used by SGLang). Chunked prefill lets long prompts be processed alongside the token-by-token generation of other requests. As a result, the cost of a request is no longer independent of other requests. Two tenants served together use less GPU time than the same two served one after the other; one tenant's long prompt delays another tenant's reply; and when memory runs short, one tenant's requests push another tenant's cached context out of the GPU, so that it has to be computed again.`),
  P("The common practice is still to divide cost by counting tokens, often with the price ratios used by commercial APIs (output tokens priced several times higher than input tokens, and cached input tokens at a discount). Token counts are easy to collect and easy to explain, but nothing guarantees that they track the GPU time and energy that each tenant actually causes on a shared engine."),
  P(`Recent work has started to measure this. JouleShare replayed every subset of a batch of requests on data-centre GPUs and computed each request's Shapley value, the cost-sharing rule from cooperative game theory. It found that dividing energy by token count charges about a quarter of each batch's energy to the wrong requests. Our synopsis reported a similar result from a small laptop experiment. What remained open was whether the error survives on cluster-scale models and data-centre GPUs, how memory pressure and interference between tenants change it, and whether any practical token price can be made fair.`),

  H2("1.2 Problem Definition and Objectives"),
  P("**Problem statement.** When several tenants share an LLM inference server, the GPU time and energy used on behalf of each tenant are not proportional to the tokens it sends and receives, and tenants change each other's speed and memory use. Billing by token count can therefore make some tenants pay for others, and it hides the cost and slowdown that memory contention imposes. The project's technical challenge is to measure, on a real engine and real GPUs, how large this misallocation is, what causes it, and what information a fair price needs."),
  P("We use the exact Shapley value of the measured cost as the fair reference, and judge every billing method by its distance from it (Section 3.3). Following the synopsis, a method is acceptable if it puts less than 5% of the bill on the wrong tenant, which is an error of at most 0.1 in our metric. The objectives, each with a measurable target, are listed in Table 1.1."),
  TCAP("1.1", "Project objectives and measurable targets"),
  TABLE(["No.", "Objective", "Measurable target"], [
    ["O1", "Build a replay harness that measures GPU busy time and dynamic energy for every combination of tenants on vLLM", "Repeating a run changes busy time by less than 1% (median) and the fair shares by less than 0.005"],
    ["O2", "Quantify the error of token-based and other billing methods against exact Shapley attribution", "Seven methods evaluated on 3 setups × 3 memory levels × 4 random workloads; identify which methods meet the 0.1 target"],
    ["O3", "Measure how tenants affect each other under memory pressure", "Extra cost of sharing, tail latency and cache loss reported for every setup and memory level"],
    ["O4", "Validate on cluster-scale models on a shared university GPU cluster", "Qwen2.5-7B and 14B on an A100, 96 clean replays each, with contaminated replays detected and discarded"],
    ["O5", "Find what calibration data makes a token price fair", "A calibration method whose held-out error stays at or below about 0.1 in every condition"],
  ], [7, 50, 43]),
  GAP(),

  H2("1.3 Social and Environmental Relevance"),
  H3("Social impact"),
  P("Cost attribution decides who pays for shared infrastructure. Inside a company it drives budgets, and between a provider and its customers it is the price. If token billing over-charges long-document workloads and under-charges chat, as we found, teams receive wrong signals: they may avoid useful long-context applications or over-use cheap-looking interactive ones. A fair and auditable method also matters for trust. The Shapley value satisfies simple fairness rules (it adds up to the total, treats identical tenants identically and charges nothing to a tenant that adds no cost), which a finance team or a customer can check. Our results also show that the tenant whose cached data is evicted pays more for the same work, while the tenants that caused the eviction pay nothing extra; making this visible protects smaller or interactive users who share a server with heavy workloads."),
  H3("Environmental sustainability"),
  P(`Data-centre energy use by AI is growing quickly. Per-tenant energy accounting is a precondition for per-tenant carbon accounting, and our harness measures dynamic GPU energy alongside busy time, with the same conclusions. We found that memory pressure alone added up to 47% to the GPU time needed to serve the same work. A pricing method that exposes this waste gives operators a reason to schedule and provision memory better, and gives tenants a reason to use cache-friendly request patterns. The experiments themselves were sized to use as little GPU time as possible (Section 5.3) and ran on the institute's existing shared cluster rather than on newly purchased hardware.`),

  H2("1.4 Project Plan"),
  H3("1.4.1 Work breakdown structure"),
  P("The work was divided into five packages (Figure 1.1): research, the measurement harness, experiments, analysis and documentation. The laptop proof-of-concept was done first so that the harness and all analysis code were tested before cluster time became available."),
  ...FIGURE("report/wbs.png", "1.1", "Work breakdown structure of the project", 620),
  H3("1.4.2 Timeline"),
  P("Figure 1.2 shows the schedule that was followed. Access to the cluster arrived later than planned, in November, so the cluster experiments, the cross-model analysis and the calibration study were compressed into the last weeks; the earlier laptop work made this possible."),
  ...FIGURE("report/gantt.png", "1.2", "Project timeline (August to December 2026)", 620),
  TCAP("1.2", "Major milestones"),
  TABLE(["Milestone", "Date", "Outcome"], [
    ["Literature review and critical analysis of the proposal", "September 2026", "Research questions, metric and success criterion fixed"],
    ["Laptop proof-of-concept", "September 2026", "96 replays on Qwen2.5-0.5B; analysis pipeline working"],
    ["Synopsis submitted", "September 2026", "Plan for cluster-scale validation approved"],
    ["Cluster environment working", "13–15 November 2026", "vLLM 0.30 running on RU's A100s; smoke tests passed"],
    ["Qwen2.5-7B experiments", "15 November 2026", "96 clean replays"],
    ["Qwen2.5-14B experiments", "16–18 November 2026", "96 clean replays (8 contaminated attempts discarded)"],
    ["Cross-model analysis and calibration study", "18–19 November 2026", "Final results and recommendation"],
  ], [42, 22, 36]),
  GAP(),
  H3("1.4.3 Roles and responsibilities"),
  P("Each member owned specific parts of the work, while design decisions, code reviews and the report were shared (Table 1.3). Annexure IV lists the individual contributions in detail."),
  TCAP("1.3", "Roles and responsibilities"),
  TABLE(["Student", "Enrolment No.", "Primary responsibilities"], [
    ["Aditya Bansal", "23803009", "Cluster deployment on RU: VPN and SSH access, vLLM environment, PBS job scripts, GPU selection and contamination guard; running the 7B and 14B experiments"],
    ["Sambhav Ghildiyal", "23803005", "Literature survey and critical analysis; Shapley and billing analysis, calibration study, figures and report"],
    ["Mudit Maheshwari", "23803017", "Workload generator and replay driver, vLLM engine integration, busy-time and energy metering; laptop proof-of-concept"],
  ], [20, 16, 64]),
  GAP(),
  H3("1.4.4 Challenges and risk management"),
  P("Table 1.4 lists the main risks, how they were handled, and what happened. Most of them came from running precise measurements on a shared university cluster."),
  TCAP("1.4", "Risks, mitigations and outcomes"),
  TABLE(["Risk / challenge", "Impact", "Mitigation", "Outcome"], [
    ["Cluster GPUs are shared and not isolated: other users' processes run on the GPU assigned to a job", "Other users' work inflates measured busy time and energy", "Contamination guard: quiet check before, per-process monitoring during and a check after every replay; flagged replays are discarded and retried", "288 clean replays; a heavy neighbour was detected and all its replays rejected"],
    ["Idle GPUs had their memory full, and GPUs with free memory were busy", "Jobs could wait hours without starting", "GPU picker that waits for an idle GPU with enough memory; several chained jobs with a completion check; small fixed KV pool", "14B tight level finished on the fourth attempt"],
    ["GPU driver 525 supports CUDA 12.3, while new vLLM builds need CUDA 13", "Engine would not run", "Installed the vLLM 0.30.0 CUDA 12.9 wheel, the same version as the laptop", "Engine ran on the A100s"],
    ["The cluster's Python module lacks sqlite3; the GPU node lacks the compiler FlashInfer needs", "Engine failed to start", "uv-managed Python; FlashInfer sampler disabled (replays decode greedily, so results are unaffected)", "Fixed after two smoke tests"],
    ["Jobs killed by the walltime or resubmitted by mistake", "Lost or duplicated measurements", "Resumable runs: rows already measured cleanly are skipped; laptop copies of all data", "No data lost; 10 accidentally overwritten rows recovered from the laptop copy"],
    ["Cluster access later than planned", "Little time for experiments", "All code developed and tested on the laptop first", "Both cluster models completed in four days"],
  ], [27, 19, 32, 22], { size: 18 }),
  GAP(),

  H2("1.5 Scope and Limitations"),
  H3("In scope"),
  B("A measurement harness for vLLM 0.30 that replays tenant combinations and records busy time, dynamic energy, latency and cache behaviour per tenant, without storing any prompt text."),
  B("Three setups: Qwen2.5-0.5B on a laptop RTX 3050, and Qwen2.5-7B and Qwen2.5-14B on an NVIDIA A100 80 GB, each at three KV-cache memory levels."),
  B("Exact three-tenant Shapley attribution and a comparison of seven billing methods, on both busy time and energy."),
  B("Measurements of interference between tenants: tail latency, cache loss and the change in each tenant's bill."),
  B("A study of how a token price must be calibrated to be fair, using only the existing replays."),
  H3("Out of scope for this semester"),
  B("The request gateway, the online cost ledger and the fair admission scheduler described in the synopsis. These need the measurement results of this semester and are planned for the next phase (Section 6.4)."),
  B("Models split across several GPUs (30B and 70B parameters) and real production traces."),
  H3("Limitations"),
  P("The workload is synthetic (random token IDs with forced output lengths) and has three tenants and four random seeds per setup. The same request rates were used on every model, so the 7B GPU was lightly loaded and the 14B GPU heavily loaded; load and model size are therefore not separated. The memory levels did not all run on the same physical GPU, and some 14B replays ran next to a light neighbour process (Section 5.1.1). Section 6.3 discusses these limitations in more detail."),

  // ===================== CHAPTER 2 =====================
  H1("CHAPTER 2: LITERATURE SURVEY"),
  H2("2.1 Critical Review"),
  P("The work in this area falls into four groups: how serving engines share a GPU, how fairness between tenants is defined and enforced, how cost or energy is attributed to requests or tenants, and how prefix caches and agent workloads behave. We review each group and note what it leaves open for this project."),
  H3("2.1.1 LLM serving engines and memory management"),
  P(`Orca${c("orca")} introduced iteration-level scheduling, now called continuous batching: requests join and leave the running batch at every decoding step instead of waiting for a whole batch to finish. vLLM${c("vllm")} added PagedAttention, which stores the KV cache in fixed-size blocks so that memory is not wasted on fragmentation and blocks can be shared between requests with a common prefix. SGLang${c("sglang")} organises cached prefixes in a radix tree for automatic reuse, and Sarathi-Serve${c("sarathi")} splits long prompts into chunks so that they can be batched with decoding requests without stalling them. These techniques are what make the cost of one request depend on the others. None of these papers is concerned with dividing cost between tenants; we use vLLM, with prefix caching and chunked prefill enabled, as the engine under test.`),
  H3("2.1.2 Fairness between tenants"),
  P(`Sheng et al.${c("vtc")} defined fairness in LLM serving through a Virtual Token Counter (VTC) that tracks weighted input and output tokens served to each client and always serves the client with the least service so far. Cao et al.${c("dlpm")} extended fair scheduling to keep prefix-cache locality (DLPM and D²LPM). Justitia${c("justitia")} schedules task-parallel LLM agents with a memory-centric view of each agent's cost, and Token Latency Fairness${c("tlf")} isolates tenants' per-token latency and evicts KV-cache blocks fairly. Yao and Zhou${c("isjl")} model the cost of a batch as driven by its largest request, so that short requests batched with long ones effectively pay for them, and give a scheduling algorithm with a proven competitive ratio; their work is analytical and simulated, without GPU measurements or prefix caching. Dominant Resource Fairness${c("drf")} is the classic multi-resource fairness rule in cluster scheduling. A common thread is that fairness is defined in tokens or in modelled cost. Whether tokens track the real cost on a shared engine is exactly what this project measures.`),
  H3("2.1.3 Cost and energy attribution"),
  P(`JouleShare${c("jouleshare")} is the closest precedent. Luo et al. replayed every subset of requests on A800, A40 and H100 GPUs to compute exact Shapley values of energy, found that token-proportional attribution deviates by about 0.45 in normalised L1 distance, and proposed an online estimator. It compares only against plain token counts and does not study memory pressure or tenants. A follow-up by an overlapping group, StepSplit${c("stepsplit")}, splits each engine step's energy into a shared part, mostly reading the model weights, and a per-request part, giving a closed-form Shapley value calibrated once per model and GPU; against more than half a million exact replays its L1 error is 0.4–6.4%, against 13–72% for token-count splitting. LLMVisor${c("llmvisor")} attributes latency, rather than cost, to tenants in real time. Urista${c("unalloc")} built a ledger that merges Kubernetes and LLM provider bills and showed, on an H100 running vLLM, that a token meter charges a retrieval-heavy tenant 12–14 percentage points more than an equal time-share meter, while noting that neither meter is ground truth. Patil${c("patil")} showed that the cost per token on one GPU varies by more than an order of magnitude with concurrency, and studies of the energy and carbon cost of AI${c("patterson", "luccioni")} show why per-workload energy accounting matters. These works establish that token accounting can be wrong, but none measures how memory pressure and eviction change attribution, how the fair split moves with model size, or what a token price needs in order to be fair.`),
  H3("2.1.4 Prefix caches and agent workloads"),
  P(`PrefixShield${c("prefixshield")} studies tenants that share one KV-cache pool without sharing prefixes: one tenant filling the cache can still evict another's useful blocks. It keeps a per-tenant "debt" of newly admitted blocks to guide eviction and recovers about 9 percentage points of the victim's hit ratio, but counts blocks rather than cost. TraceLab${c("tracelab")} analysed about 4,300 real coding-agent sessions and found very long contexts, short outputs and 95.7–95.8% of input tokens served from the prefix cache, all reused within the same session; we used these shapes to design our agent tenant. Huang and Liu${c("bursts")} show that a burst of agent traffic can leave a prefix-cached server degraded long after the burst ends. Wu et al.${c("leak")} showed that sharing a prefix cache between users can leak prompts through response timing, which is why our replays keep each tenant's cache separate.`),
  H3("2.1.5 Cost allocation and the Shapley value"),
  P(`The Shapley value${c("shapley")} divides the total cost of a group among its members by averaging each member's added cost over every order in which members could join. It is the only rule that is efficient (shares add up to the total), symmetric, gives nothing to a member that adds no cost, and is additive over independent costs. Its drawback is cost: exact computation needs every subset, which is practical for a few tenants but not for many requests, hence the approximations in JouleShare and StepSplit. For industry practice, the FinOps Foundation's FOCUS specification${c("focus")} standardises how cloud cost and usage data are reported and allocated, but leaves the allocation rule for shared resources to the organisation.`),

  H2("2.2 Summary Table"),
  P("Table 2.1 compares the most relevant works with this project."),
  TCAP("2.1", "Summary of related work"),
  TABLE(["Work", "Year", "Approach", "Platform / data", "Cost measured", "Limitation for our question"], [
    [`JouleShare${c("jouleshare")}`, "2026", "Exact Shapley by subset replay", "A800, A40, H100", "Energy per request", "Plain tokens only; no memory pressure or tenants"],
    [`StepSplit${c("stepsplit")}`, "2026", "Closed-form step-sharing Shapley", "529,513 GPU runs", "Energy per request", "Memory pressure and eviction not part of the evaluation"],
    [`LLMVisor${c("llmvisor")}`, "2026", "Real-time latency attribution model", "Multi-tenant serving", "Latency", "Latency, not cost"],
    [`unalloc${c("unalloc")}`, "2026", "Ledger joining infrastructure and provider bills", "H100, vLLM; synthetic bills", "Spend per tenant", "No fair reference; 12–14 pp meter gap"],
    [`Patil${c("patil")}`, "2026", "Concurrency-aware cost per token", "H100, A100", "Server cost per token", "Whole server, not per tenant"],
    [`ISJL${c("isjl")}`, "2026", "Max-driven batch cost; fair scheduling", "Simulation", "Modelled GPU time", "No hardware; no prefix caching"],
    [`PrefixShield${c("prefixshield")}`, "2026", "Per-tenant block debt for eviction", "vLLM, L4 / A100, up to 7B", "Cache hit ratio", "Blocks, not money or time"],
    [`VTC${c("vtc")}`, "2024", "Fair scheduling by weighted tokens", "LLM serving system", "Tokens served", "Assumes tokens represent cost"],
    [`DLPM${c("dlpm")}`, "2025", "Locality-aware fair scheduling", "A100, A10G", "Tokens with shared prefixes", "Scheduling only"],
    [`Justitia${c("justitia")}`, "2025", "Memory-centric fair scheduling of agents", "GPU servers", "Agent memory cost", "Scheduling only; no attribution"],
    [`TraceLab${c("tracelab")}`, "2026", "Characterisation of coding-agent traces", "~4,300 real sessions", "Tokens, cache hits", "Workload study"],
    [`Bursts${c("bursts")}`, "2026", "Degradation after bursts in prefix-cached serving", "Agent serving", "Latency, cache", "Stability, not billing"],
    ["**This project**", "2026", "Exact tenant-level Shapley by coalition replay; 7 billing methods; calibration study", "RTX 3050; A100 with 7B and 14B", "Busy time and energy per tenant", "Synthetic workload; 3 tenants"],
  ], [14, 7, 22, 17, 15, 25], { size: 17 }),
  GAP(),

  H2("2.3 Identification of Research Gaps"),
  P("From the review we identified the following gaps, which this project addresses:"),
  ...NL([
    "**Attribution under memory pressure.** Existing attribution studies do not examine what happens when the KV cache is too small and requests are preempted or their cache evicted. We measure three memory levels on three setups.",
    "**The victim of eviction.** PrefixShield measures lost cache hits, but nobody had measured how much more the evicted tenant pays under a cache-discounted price.",
    "**Comparison with calibrated prices.** Previous work compares fair attribution only with plain token counts. Operators can easily fit separate prices for input, cached and output tokens, so the relevant question is whether such a calibrated price is good enough.",
    "**Dependence on model size.** No work checks whether the fair division of cost between the same tenants stays the same when the model changes.",
    "**What a fair price needs.** No work tells an operator which measurements a token price must be calibrated on to stay fair.",
    "**Measurement on shared clusters.** Precise GPU cost measurements usually assume an exclusive GPU. University clusters rarely provide one, and no method was available for detecting and rejecting contaminated measurements.",
  ]),

  // ===================== CHAPTER 3 =====================
  H1("CHAPTER 3: SYSTEM DESIGN AND METHODOLOGY"),
  H2("3.1 Design Considerations"),
  P("The design of the measurement system and of the experiments took the following aspects into account."),
  B("**Economic.** The purpose of the system is accurate chargeback of an expensive shared resource. The experiments themselves were designed to need few GPU-hours: each memory level of one model runs in a single job of about an hour or less, and runs that were already measured are never repeated (Section 5.3)."),
  B("**Environmental.** Dynamic GPU energy is measured alongside busy time, so the same method supports energy and carbon accounting. A small fixed KV-cache pool let our jobs fit next to other users' work instead of needing a whole GPU, and the contamination guard stopped a job early instead of wasting GPU time on measurements that would be thrown away."),
  B("**Social.** Fair division of cost between teams, and protecting interactive users from the slowdown caused by heavy tenants, are the social goals. We report latency harm separately from cost because no price can undo it."),
  B("**Political and organisational.** Chargeback decisions can cause disputes between departments. The Shapley value was chosen because its fairness properties can be stated and checked, and every number in this report can be regenerated from the raw data with the published scripts."),
  B("**Ethical.** No real user data is used: prompts are random token IDs and no prompt text is stored. Each tenant's prefix cache is kept separate, which avoids the cross-tenant prompt leakage reported in the literature. Discarded measurements are kept in the data with a flag and reported, not silently dropped."),
  B("**Health and safety.** The project involves no physical hardware work; all GPU access is remote. The relevant safety aspects are cyber security and responsible use of a shared facility (Section 4.4)."),
  B("**Sustainability.** The work reuses the institute's existing HPC facility. The code, data and analysis scripts are kept together so that the experiments can be repeated on other models without new development."),

  H2("3.2 Methodology"),
  H3("3.2.1 Overall approach"),
  P("Figure 3.1 summarises the method. We create a workload for three tenants that send the same number of tokens, replay every combination of tenants on the same engine with identical requests and arrival times, and measure the GPU cost of each replay. From the seven costs we compute each tenant's Shapley value, compare it with the share given by each billing method, and separately measure how much the tenants slow each other down."),
  ...FIGURE("poc_workflow.png", "3.1", "Steps of the measurement method", 640),
  H3("3.2.2 System architecture"),
  P("Figure 3.2 shows the system that was built. A PBS job on the cluster first checks which replays are still missing, then waits for a GPU that is idle and has enough free memory. The replay driver generates the workload, starts a vLLM engine with a fixed KV-cache size and replays each tenant combination while a monitoring thread reads the GPU through NVML. A contamination guard decides whether the replay was clean. Every replay becomes one row in a JSON Lines file, which the analysis scripts turn into Shapley values, billing errors, figures and the calibration study."),
  ...FIGURE("report/pipeline.png", "3.2", "Architecture of the measurement and analysis system", 640),
  P("Figure 3.3 places this work in the full FairShareAI platform from the synopsis. This semester built and validated the measurement, replay and calibration parts (lower left of the figure) and answered the research question that decides how the cost ledger should work. The gateway, the online ledger and the scheduler build on these results."),
  ...FIGURE("architecture.png", "3.3", "Planned FairShareAI platform (from the synopsis); this semester covers the engine measurements, replay and calibration", 600),
  H3("3.2.3 Tenants and workload"),
  P(`The three tenants represent common enterprise uses of a shared model (Table 3.1). They were designed so that each sends about the same number of tokens per minute (96,000–101,500 per seed in every setup), which makes the comparison with token billing as simple as possible: plain token billing gives each tenant one third of the cost. The agent's shape follows the coding-agent traces of TraceLab. Prompts are random token IDs, which makes prefix relationships exact, and output lengths are forced (generation ignores the end-of-sequence token and decoding is greedy), so every combination replays exactly the same token volume for each tenant.`),
  TCAP("3.1", "The three tenants (per random seed, 60-second traffic window)"),
  TABLE(["Tenant", "Requests", "Prompt length", "Output length", "Arrivals", "Character"], [
    ["chat", "125–128 independent requests", "256–1,024 tokens", "128 tokens", "Poisson over the window", "Many short interactive requests"],
    ["docs", "10–11 requests", "6,144–12,288 tokens", "128 tokens", "Uniform over the window", "Few very long prompts"],
    ["agent", "4 sessions × 6 calls = 24 requests", "1,024 tokens, growing by 700–1,000 tool tokens plus the previous output each call", "256 tokens", "Session start in the first half; 0.5–2 s tool delay between calls", "Multi-turn, context reused from the prefix cache"],
  ], [10, 18, 22, 11, 19, 20], { size: 18 }),
  GAP(),
  H3("3.2.4 Coalition replay design"),
  P("For one memory level and one random seed, the seven non-empty combinations of tenants (coalitions) are replayed on the same engine: chat, docs and agent alone, the three pairs, and all three together. The full coalition is replayed a second time to measure noise. With four seeds this gives 32 replays per memory level and 96 per setup. Each replay feeds requests to the engine at their arrival times and steps the engine until all requests are finished, so that the cost of requests that queue past the end of the window is included."),
  P("The three memory levels fix the number of KV-cache blocks of 16 tokens: 6,602 blocks (105,632 tokens, roomy), 1,400 blocks (22,400 tokens, tight) and 850 blocks (13,600 tokens, very tight). Because the capacity is fixed in tokens, the same level holds the same number of tokens on every model even though a token's KV cache takes 12 KiB on the 0.5B model, 56 KiB on 7B and 192 KiB on 14B. At the roomy level no request is ever preempted; at the tight levels requests are preempted and cached prefixes are evicted."),
  H3("3.2.5 Guarded replays on a shared cluster"),
  P("The cluster's GPUs are shared between users, and the scheduler does not prevent other users' processes from running on the GPU given to a job. Any such work inflates the measured busy time and energy. Every replay is therefore guarded, as shown in Figure 3.4: the GPU must be quiet before the replay, every other process's use of the GPU's compute units is sampled every 0.5 seconds during it, and the GPU is checked again after it. A replay that fails any check is written with a flag, discarded by the analysis and retried; after eight flagged replays in a row the job stops, because the GPU is evidently too busy. Exit codes tell the operator why a job stopped."),
  ...FIGURE("report/replay_flow.png", "3.4", "Flowchart of a guarded measurement job", 600),
  H3("3.2.6 Attribution algorithm"),
  P("The analysis follows the steps in Listing 3.1 for each setup."),
  LCAP("3.1", "Attribution and evaluation procedure"),
  CODE(`
for each memory level L and seed s:
    c(S) <- measured cost of the clean replay of coalition S, for all 7 coalitions
    phi  <- Shapley values of c                               # equation (3.4)
    shapley_share <- phi / c(chat+docs+agent)
    for each billing method m:                                # Table 3.2
        share_m <- method m's division of the full-coalition run
        error[m, L, s] <- sum over tenants |share_m - shapley_share|   # equation (3.6)
    for the calibrated prices:
        fit prices on the three other seeds of level L (NNLS)  # equation (3.8)
        share <- tenants' token counts in this seed x fitted prices
report mean and SD of the error over the 4 seeds for each (method, L)
`),
  GAP(),

  H2("3.3 Modelling"),
  H3("3.3.1 Cost of a replay"),
  P("Two cost measures are used. The **busy time** of a replay of coalition *S* is the sum of the wall-clock durations of all engine steps, so idle time between arrivals is not counted:"),
  EQ("*c*_{busy}(*S*) = Σ_{*k*} Δ*t*_{*k*}", "3.1"),
  P("where Δ*t*_{*k*} is the duration of engine step *k*. It includes GPU work and the engine's CPU overhead for that step. The **dynamic energy** is the GPU's energy counter difference minus the idle power times the replay's duration *T*(*S*):"),
  EQ("*E*_{dyn}(*S*) = [*E*_{ctr}(end) − *E*_{ctr}(start)] − *P*_{idle} · *T*(*S*)", "3.2"),
  P("Busy time is the primary measure; energy is used to check every conclusion."),
  H3("3.3.2 The Shapley value"),
  P("For a set *N* of *n* tenants and a cost function *c* over coalitions, tenant *i*'s Shapley value is its added cost averaged over all orders in which tenants could join:"),
  EQ("*φ*_{*i*} = Σ_{*S* ⊆ *N*\\{*i*}} [ |*S*|! (*n* − |*S*| − 1)! / *n*! ] · [ *c*(*S* ∪ {*i*}) − *c*(*S*) ]", "3.3"),
  P("With three tenants the weights are 1/3 for joining first or last and 1/6 for joining second, so for tenant *A* with others *B* and *C*:"),
  EQ("*φ*_{*A*} = (1/3) *c*(*A*) + (1/6) [*c*(*AB*) − *c*(*B*)] + (1/6) [*c*(*AC*) − *c*(*C*)] + (1/3) [*c*(*ABC*) − *c*(*BC*)]", "3.4"),
  P("The values add up to the cost of the full coalition, Σ_{*i*} *φ*_{*i*} = *c*(*N*), so each tenant's fair share is *s*_{*i*} = *φ*_{*i*} / *c*(*N*). For example, if *A* alone costs 10 s, *B* alone 10 s and both together 14 s, each is charged 7 s and the 6 s saved by batching are shared equally."),
  H3("3.3.3 Error metric"),
  P(`A billing method *m* gives shares *s*^{*m*}_{*i*}. Its error is the normalised L1 distance from the Shapley shares, as in JouleShare:`),
  EQ("nL1(*m*) = Σ_{*i* ∈ *N*} | *s*^{*m*}_{*i*} − *s*_{*i*} |", "3.5"),
  P("Half of nL1 is the fraction of the bill charged to the wrong tenant, because every share over-charged is matched by an equal share under-charged elsewhere:"),
  EQ("mis-billed fraction = nL1(*m*) / 2", "3.6"),
  P("An error of 0.42 therefore means 21% of the bill is on the wrong tenant. The project's target is nL1 ≤ 0.1 (at most 5% mis-billed)."),
  H3("3.3.4 Billing methods compared"),
  P("Each method divides the cost of the full-coalition run (Table 3.2). For tenant *i*, let *U*_{*i*}, *C*_{*i*} and *O*_{*i*} be its uncached input tokens, cached input tokens and output tokens in that run."),
  TCAP("3.2", "Billing methods compared with the Shapley reference"),
  TABLE(["Method", "Tenant i's weight", "What it represents"], [
    ["Plain token count", "*U*_{*i*} + *C*_{*i*} + *O*_{*i*}", "Common internal chargeback"],
    ["API-style price", "1·*U*_{*i*} + 0.1·*C*_{*i*} + 5·*O*_{*i*}", "Ratios typical of commercial LLM APIs"],
    ["Calibrated 3-rate price", "*p*_{*u*}*U*_{*i*} + *p*_{*c*}*C*_{*i*} + *p*_{*o*}*O*_{*i*}, prices fitted to each tenant's cost when running alone on the other seeds", "What an operator can do with benchmarks"],
    ["Best possible 3-rate price", "Same form, prices fitted to the Shapley values of the other seeds", "The best a token price can do; needs measured Shapley values"],
    ["Cost when running alone", "*c*({*i*})", "Standalone cost"],
    ["Leave-one-out", "*c*(*N*) − *c*(*N*\\{*i*})", "Marginal cost of adding the tenant last"],
    ["Memory × time", "*M*_{*i*} (equation 3.9)", "KV-cache GiB-seconds held"],
  ], [24, 42, 34], { size: 19 }),
  GAP(),
  H3("3.3.5 Calibrated prices"),
  P(`A three-rate price **p** = (*p*_{*u*}, *p*_{*c*}, *p*_{*o*}) is fitted by non-negative least squares. Each training example is a tenant in a training seed, with features **x** = (*U*, *C*, *O*) and target *y*, which is either its cost when running alone or its Shapley value:`),
  EQ("**p** = argmin_{**p** ≥ 0} Σ ( **x** · **p** − *y* )^{2}", "3.7"),
  P("Prices are always fitted on three seeds and tested on the fourth (leave-one-seed-out), so the reported errors are for data the prices have not seen. A tenant's bill is then **x**_{*i*} · **p** using its tokens in the shared run:"),
  EQ("bill_{*i*} = *p*_{*u*} *U*_{*i*} + *p*_{*c*} *C*_{*i*} + *p*_{*o*} *O*_{*i*}", "3.8"),
  H3("3.3.6 Memory use and interference"),
  P("Memory use is measured as KV-cache memory multiplied by time, in GiB-seconds. During each engine step of duration Δ*t*_{*k*}, a request holding a context of *L*_{*r*,*k*} tokens is charged *L*_{*r*,*k*} times the KV size per token *b*:"),
  EQ("*M*_{*i*} = Σ_{*r* ∈ *i*} Σ_{*k*} *L*_{*r*,*k*} · *b* · Δ*t*_{*k*},    *b* = 2 · layers · KV heads · head size · bytes per value", "3.9"),
  P("For Qwen2.5-0.5B, 7B and 14B, *b* is 12, 56 and 192 KiB per token. Two further quantities describe how tenants interact. The sharing ratio compares serving everyone together with serving each tenant alone, and the victim multiplier compares a tenant's cache-discounted bill when sharing with its bill for the same work alone:"),
  EQ("*ρ* = *c*(*N*) / Σ_{*i*} *c*({*i*}),        victim multiplier = bill_{*i*}^{shared} / bill_{*i*}^{alone}", "3.10"),
  P("A ratio *ρ* below 1 means sharing saves GPU time. A victim multiplier above 1 means the tenant pays more for identical work because others caused its cache to be lost."),

  H2("3.4 Tool and Technique Selection"),
  P("Table 3.3 lists the main choices and the reasons for them."),
  TCAP("3.3", "Tool and technique selection"),
  TABLE(["Component", "Choice", "Justification"], [
    ["Inference engine", "vLLM 0.30.0", "Widely used open engine with continuous batching, paged KV cache, prefix caching and chunked prefill; exposes the step loop needed to time steps; same version on laptop and cluster"],
    ["Models", "Qwen2.5-0.5B, 7B and 14B Instruct", `Open weights under Apache 2.0; one family at three sizes, so only size changes; 14B is the largest that fits one A100 with room for other users`],
    ["GPUs", "RTX 3050 Laptop (4 GB); A100-SXM4 80 GB", "Laptop for development and a first result; the institute's A100s for data-centre-class measurements at no cost to the project"],
    ["GPU readings", `NVML through pynvml`, "Energy counter, power, utilisation and per-process compute use, all needed by the contamination guard; works on the cluster's driver"],
    ["Fair reference", "Exact Shapley value", "Unique rule with the fairness properties listed in Section 2.1.5; exact computation is cheap for three tenants (7 replays)"],
    ["Cost measures", "Busy time and dynamic energy", "Busy time is directly what a tenant occupies; energy checks that conclusions do not depend on the measure"],
    ["Price fitting", "Non-negative least squares (SciPy)", "Prices must not be negative; simple and deterministic"],
    ["Workload", "Synthetic token IDs, forced lengths", "Exact control of prefixes and token volume, identical requests in every coalition, no private data"],
    ["Scheduler and environment", "PBS jobs; uv-managed Python", "PBS is the cluster's required scheduler; uv gave a Python with all modules vLLM needs"],
    ["Analysis and figures", "Python, NumPy, SciPy, Matplotlib", "Standard, scriptable, reproducible; colour-blind-safe palette checked with a validator"],
  ], [18, 24, 58], { size: 19 }),
  GAP(),

  // ===================== CHAPTER 4 =====================
  H1("CHAPTER 4: IMPLEMENTATION AND TESTING"),
  H2("4.1 Development Details"),
  P("The system is about 2,100 lines of Python and one PBS job script. The main files are workload.py (workload generator), run_experiments.py (replay driver, metering and contamination guard), pick_gpu.py (GPU selection), run.pbs (cluster job), analyze.py (Shapley values and billing methods), compare_models.py (cross-model figures) and calibration_check.py (calibration study). This section walks through the implementation in the order a measurement is made."),
  H3("4.1.1 Workload generator"),
  P("The workload for a seed is generated deterministically. The agent's token volume sets the target, and chat and docs requests are drawn until they reach it (Listing 4.1). Because the generator is seeded, every coalition receives byte-identical requests with identical arrival times."),
  LCAP("4.1", "Chat and docs requests are drawn until they match the agent's token volume (workload.py)"),
  CODE(`
# Chat: many short independent requests, Poisson arrivals over the window.
total, i = 0, 0
while total < target:
    p = rng.randint(*chat_prompt)                 # 256-1,024 tokens
    wl.chat.append(Request("chat", f"chat-{i}", 0.0, _toks(rng, p), chat_out))
    total += p + chat_out
    i += 1
rate = len(wl.chat) / window_s
t = 0.0
for r in wl.chat:
    t += rng.expovariate(rate)
    r.arrival = min(t, window_s)
`),
  GAP(),
  H3("4.1.2 Engine set-up and replay loop"),
  P("For each memory level the driver starts one vLLM engine with prefix caching on, blocks of 16 tokens and the KV-cache size forced to the level's block count (Listing 4.2). Each request is tagged with its tenant as a cache salt, so tenants never share cached blocks."),
  LCAP("4.2", "Engine creation with a fixed KV-cache capacity (run_experiments.py)"),
  CODE(`
llm = LLM(
    model=args.model, dtype=args.dtype,
    gpu_memory_utilization=args.gpu_mem_util,
    enable_prefix_caching=True,
    block_size=BLOCK_SIZE,                       # 16 tokens per block
    num_gpu_blocks_override=KV_LEVELS[level],    # 6602 / 1400 / 850 blocks
    seed=0,
)
`),
  GAP(),
  P("The replay loop (Listing 4.3) adds requests when their arrival time is reached, steps the engine, and adds the step's duration to the busy time. The engine is never stepped while it has no work, so waiting for arrivals is not counted. When an agent call finishes, its next call is scheduled after the tool delay with the previous context, the generated output and the new tool tokens, so the agent's growing context is reused from the cache whenever it has not been evicted."),
  LCAP("4.3", "Busy time is the sum of engine-step durations (run_experiments.py)"),
  CODE(`
while pending or engine.has_unfinished_requests():
    while pending and pending[0][0] <= now():
        arrival, rid, tenant, prompt, max_tokens, state = pending.pop(0)
        engine.add_request(rid, TokensPrompt(prompt_token_ids=prompt, cache_salt=tenant),
                           SamplingParams(max_tokens=max_tokens, ignore_eos=True, temperature=0.0))
    if not engine.has_unfinished_requests():
        time.sleep(max(0.0, min(pending[0][0] - now(), 0.05)))   # idle: not counted
        continue
    s0 = time.perf_counter()
    outs = engine.step()
    busy += time.perf_counter() - s0
`),
  GAP(),
  H3("4.1.3 GPU metering"),
  P("A monitoring thread reads the GPU through NVML for the whole replay. Every 10 ms it records the power, and every 0.5 s it lists the other processes on the GPU and their share of the compute units. The GPU's cumulative energy counter is read before and after the replay, and the idle power measured when the engine was started is subtracted to give dynamic energy (equation 3.2). Each row also records the GPU's identity, temperature, clock, the node's CPU load, the number of preemptions and, for every request, its arrival, first-token and finish times, cached tokens and KV GiB-seconds."),
  H3("4.1.4 Contamination guard"),
  P("Before each replay the driver waits until the GPU's mean utilisation over a sliding 3-second window is at or below a threshold (Listing 4.4). The threshold was 0% for the 7B runs. During the 14B runs no GPU with enough free memory was ever fully idle, so after a diagnostic job showed that a neighbour using 2–6% of the GPU did not change the measurements (Section 4.3), the 14B threshold was set to 10% on average before, during and after each replay."),
  LCAP("4.4", "Waiting for a quiet GPU with a sliding-window mean (run_experiments.py)"),
  CODE(`
def wait_for_quiet(handles, quiet_s, max_wait_s, threshold):
    t0 = time.perf_counter()
    window = deque()                  # (time, utilisation)
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
`),
  GAP(),
  H3("4.1.5 Cluster job"),
  P("Each memory level runs as one PBS job (Listing 4.5). The job first asks the driver whether anything is left to measure, so that several copies can be chained to keep trying for a free GPU and the later copies exit at once when an earlier one has finished. It then waits for a suitable GPU, sets the memory fraction measured for the model, and runs the driver. The model is downloaded beforehand and the job runs offline."),
  LCAP("4.5", "Core of the PBS job script (run.pbs)"),
  CODE(`
#PBS -q gpu
#PBS -l select=1:ncpus=4:ngpus=1:mem=64gb
#PBS -l walltime=04:00:00
export HF_HUB_OFFLINE=1               # model already in the shared cache
export VLLM_USE_FLASHINFER_SAMPLER=0  # node cannot compile it; decoding is greedy
if "$PY" run_experiments.py --check-done --model "$MODEL" --kv-levels "$KV" --out "$OUT"; then
  echo "nothing left to measure, exiting"; exit 0
fi
CUDA_VISIBLE_DEVICES=$("$PY" pick_gpu.py --n 1 --need-frac "$MEM_UTIL" \\
    --max-util "$PICK_MAX_UTIL" --wait-max-s "$PICK_WAIT") || exit 2
"$PY" run_experiments.py --model "$MODEL" --dtype bfloat16 --gpu-mem-util "$MEM_UTIL" \\
    --kv-levels "$KV" --quiet-util "$QUIET_UTIL" --out "$OUT"
`),
  GAP(),
  H3("4.1.6 Analysis"),
  P("analyze.py groups the clean rows by memory level and seed, computes the Shapley values with the three-player weights of equation (3.4) (Listing 4.6), and evaluates every billing method. compare_models.py combines the three setups and draws the figures in Chapter 5, and calibration_check.py refits the token price in five different ways for Section 5.1.6."),
  LCAP("4.6", "Exact three-tenant Shapley value (analyze.py)"),
  CODE(`
def shapley(v):
    n = len(TENANTS)
    w = {0: 1 / 3, 1: 1 / 6, 2: 1 / 3}     # weight by number of tenants already present
    phi = {}
    for i in TENANTS:
        others = [t for t in TENANTS if t != i]
        s = 0.0
        for k in range(n):
            for S in combinations(others, k):
                s += w[k] * (v[key(S + (i,))] - (v[key(S)] if S else 0.0))
        phi[i] = s
    return phi
`),
  GAP(),

  H2("4.2 Experimental Setup"),
  P("Table 4.1 gives the hardware and software of the three setups. Everything else (engine settings, workload, memory levels and replay design) was identical in all three."),
  TCAP("4.1", "Experimental setups"),
  TABLE(["", "Laptop proof-of-concept", "Cluster run 1", "Cluster run 2"], [
    ["Model", "Qwen2.5-0.5B-Instruct, fp16", "Qwen2.5-7B-Instruct, bf16", "Qwen2.5-14B-Instruct, bf16"],
    ["GPU", "RTX 3050 Laptop, 4 GB", "A100-SXM4 80 GB (RU node jiit-gpu01)", "A100-SXM4 80 GB (same node)"],
    ["Weights / KV cache per token", "about 1 GB / 12 KiB", "about 15 GB / 56 KiB", "about 29 GB / 192 KiB"],
    ["Clean replays", "96 of 96", "96 of 96", "96 (8 flagged attempts discarded)"],
    ["Dates", "September 2026", "15 November 2026", "16–18 November 2026"],
    ["Highest mean power in a replay (idle power)", "up to 75 W (14–16 W)", "up to 347 W (65–81 W)", "up to 364 W (65–85 W)"],
  ], [22, 26, 26, 26], { size: 19 }),
  GAP(),
  TCAP("4.2", "Common software and engine settings"),
  TABLE(["Item", "Setting"], [
    ["Engine", "vLLM 0.30.0 (CUDA 12.9 build on the cluster); prefix caching on; chunked prefill with 8,192 tokens per step; block size 16; greedy decoding; output length forced"],
    ["KV-cache levels", "Roomy 6,602 blocks (105,632 tokens); tight 1,400 (22,400); very tight 850 (13,600)"],
    ["Replays", "7 coalitions + 1 repeat of the full coalition, × 4 seeds, × 3 levels = 96 per setup; one job per level on the cluster"],
    ["Cluster", "JIIT Ramanujan Universe: PBS scheduler, gpu queue; node with 8 × A100 80 GB; NVIDIA driver 525 (CUDA 12.3); access over the institute VPN"],
    ["Cluster jobs used", "7B: 15467, 15488, 15489. 14B: 15751 (roomy), 15753 (very tight), 15956 (tight); diagnostic and smoke runs 15749, 15750"],
    ["Guard settings", "7B: GPU fully quiet (0%) before and after, no other compute during. 14B: mean utilisation at most 10% before, during and after"],
    ["Analysis environment", "Python with NumPy, SciPy and Matplotlib (uv); all figures and tables regenerated from the raw JSON Lines files"],
  ], [24, 76], { size: 19 }),
  GAP(),
  P("Over the three setups the experiments replayed 28,980 requests and 53.1 million tokens. The total GPU busy time was 1.26 h on the laptop, 1.38 h on 7B and 2.03 h on 14B, and the total dynamic energy was 0.08, 0.37 and 0.56 kWh."),

  H2("4.3 Test Cases"),
  P("Table 4.3 lists the checks used to verify that the harness measures what it should, with the expected and the observed result. Tests T3 to T7 were run on the cluster under real conditions."),
  TCAP("4.3", "Test cases: input, expected output and observed output"),
  TABLE(["ID", "Test", "Input", "Expected", "Observed", "Result"], [
    ["T1", "Balanced, identical workload", "make_workload(seed) for seeds 0–3", "Each tenant about the same tokens; same requests in all 7 coalitions", "96,172–101,531 tokens per tenant per seed; identical request sets and arrivals", "Pass"],
    ["T2", "Forced output length", "All requests of all 288 clean replays", "Every request finishes with exactly its requested number of output tokens", "0 requests differ", "Pass"],
    ["T3", "Repeatability", "Full coalition replayed twice per seed and level", "Busy time within about 1%; shares change by less than 0.005", "Median busy-time change 0.19% (7B), 0.56% (14B); share change at most 0.003", "Pass"],
    ["T4", "Tolerance of a light neighbour", "5 identical full replays beside a process using 2–6% of the GPU (14B)", "Results agree within about 1%", "Busy time within 0.54%, energy within 0.81%", "Pass"],
    ["T5", "Detection of a heavy neighbour", "14B replays beside a process using 20–38% of the GPU", "Replays flagged and discarded; job stops", "All 8 replays flagged (docs alone took 78 s instead of 35.5 s); job exited with code 3", "Pass"],
    ["T6", "No suitable GPU", "Job started while every GPU was busy or full", "Job waits up to the limit, then exits without measuring", "Jobs 15816 and 15873 exited with code 2 after about 2 h", "Pass"],
    ["T7", "Resume and completion check", "Chained job for a level already complete", "Exits immediately with code 0", "Jobs 15957–15959 finished in under a minute", "Pass"],
    ["T8", "Shapley efficiency", "Every (level, seed) of every setup", "Σ φ_{i} = c(chat+docs+agent)", "Equal to floating-point precision", "Pass"],
    ["T9", "Held-out evaluation", "Calibrated prices for each test seed", "Test seed never in the training data", "Leave-one-seed-out in analyze.py and calibration_check.py", "Pass"],
    ["T10", "Memory fit of 14B", "14B at roomy level with memory fraction 0.69", "Engine starts without running out of memory", "34.0 GiB fixed use + 19.3 GiB KV cache fitted", "Pass"],
  ], [6, 15, 20, 21, 30, 8], { size: 17 }),
  GAP(),

  H2("4.4 Safety Measures"),
  P("The project has no physical safety hazards. The safety measures concerned cyber security, data protection and responsible use of a shared facility:"),
  B("**Secure access.** The cluster is reachable only over the institute's VPN, and logins use SSH with personal accounts. The VPN configuration, its private key and the credentials were kept out of the code repository and out of any shared document, and the initial password was changed."),
  B("**Use of the scheduler.** All measurements ran as PBS jobs in the gpu queue with stated resource limits. Direct logins to the GPU node were used only for short read-only checks of GPU status, never to run experiments outside the scheduler."),
  B("**Respect for other users.** The KV-cache size and memory fraction were set from measurements so that our jobs used about 20–55 GB of an 80 GB GPU and never took memory that other users' processes were holding. The GPU picker never starts on a busy GPU."),
  B("**No personal data.** Prompts are random token IDs. No prompt text, generated text or personal information is stored; the result files contain only token counts, timings and GPU readings."),
  B("**Isolation between tenants.** Each tenant's requests carry its own cache salt, so no tenant can reuse or time another tenant's cached prefixes, which prevents the prompt-leakage attack reported by Wu et al."),
  B("**Offline jobs and fixed versions.** Jobs run with the model cache in offline mode and with pinned software versions, so nothing is downloaded or changed during a measurement."),
  B("**Data integrity.** Raw results are append-only; contaminated replays are kept with a flag rather than deleted, and copies of all results were kept on the laptop."),

  // ===================== CHAPTER 5 =====================
  H1("CHAPTER 5: RESULTS AND DISCUSSION"),
  H2("5.1 Result Analysis"),
  H3("5.1.1 Quality of the measurements"),
  P("Table 5.1 summarises the measurement quality. The 7B runs had no other compute on the GPU at all. During the 14B runs, no GPU with enough free memory stayed fully idle, so roomy and very tight ran next to a light neighbour averaging 1.3–4.5% of the GPU (median 2.9%); tight ran with no other compute. The noise floor matches between the two models, and the diagnostic and heavy-neighbour tests (T4 and T5) show that a light neighbour is harmless while a heavy one would more than double the measured cost and is caught by the guard."),
  TCAP("5.1", "Measurement quality"),
  TABLE(["", "Laptop", "7B A100", "14B A100"], [
    ["Clean replays used", "96", "96", "96"],
    ["Discarded attempts", "0", "0", "8 (heavy neighbour)"],
    ["Other compute on the GPU", "None", "None", "Roomy, very tight: 1.3–4.5% mean; tight: none"],
    ["Median busy-time change on repeat", "below 0.2%", "0.19%", "0.56%"],
    ["Largest change in shares on repeat (noise floor, nL1)", "0.001", "0.003", "0.003"],
    ["Physical GPUs used", "1", "2 (roomy and tight; very tight)", "2 (roomy and very tight; tight)"],
  ], [37, 17, 23, 23], { size: 19 }),
  GAP(),

  H3("5.1.2 Accuracy of the billing methods"),
  P("Table 5.2 and Figure 5.1 give the error of every billing method in every setup and memory level. The noise floor is at most 0.003, so all differences discussed here are far larger than measurement noise."),
  TCAP("5.2", "Error versus the Shapley reference (nL1, busy time, mean of 4 seeds): laptop / 7B / 14B"),
  TABLE(["Method", "Roomy", "Tight", "Very tight"], [
    ["Plain token count", "0.42 / 0.42 / 0.27", "0.40 / 0.39 / 0.22", "0.31 / 0.26 / 0.24"],
    ["API-style price", "0.30 / 0.37 / 0.53", "0.23 / 0.28 / 0.37", "0.16 / 0.17 / 0.33"],
    ["Calibrated 3-rate price", "0.10 / 0.10 / 0.09", "0.07 / 0.09 / 0.15", "0.05 / 0.14 / 0.21"],
    ["Best possible 3-rate price", "0.08 / 0.08 / 0.04", "0.08 / 0.11 / 0.04", "0.05 / 0.06 / 0.06"],
    ["Cost when running alone", "0.09 / 0.10 / 0.08", "0.07 / 0.07 / 0.10", "0.04 / 0.08 / 0.12"],
    ["Leave-one-out", "0.29 / 0.50 / 0.17", "0.20 / 0.39 / 0.19", "0.15 / 0.29 / 0.16"],
    ["Memory × time", "0.65 / 0.61 / 0.36", "0.59 / 0.55 / 0.14", "0.46 / 0.37 / 0.07"],
  ], [31, 23, 23, 23], { size: 20, center: [1, 2, 3] }),
  GAP(),
  ...FIGURE("report/r_3_error_by_model.png", "5.1", "Error of each billing method for the three setups and memory levels (busy time; mark = mean of 4 seeds, line = ±1 SD; the vertical line is the 0.1 target)", 640),
  P("**Token billing is wrong on every setup.** Plain token counts are off by 0.22–0.42, so 11–21% of the bill goes to the wrong tenant, and never come close to the 0.1 target. Long documents are over-charged everywhere: by 13–20 percentage points on the laptop and 7B and by 7–13 on 14B. This is the opposite of the intuition in the original proposal that long documents look cheap under token billing. The reason is that the model reads a prompt's tokens all at once, which is cheap per token, but writes its answer one token at a time, which is expensive per token. The under-charged tenant changes with the model: chat on the laptop and 7B (by 10–21 points), the agent on 14B (by 10–12 points)."),
  P("**Methods that use measurements from the actual model do much better.** The calibrated price, cost when running alone and the best possible price are all within about 0.1 at roomy memory on every setup (0.04–0.10). Figure 5.2 shows that every conclusion holds with dynamic energy as the cost measure."),
  ...FIGURE("report/r_3b_error_by_model_energy.png", "5.2", "Error of each billing method with dynamic energy as the cost measure", 640),

  H3("5.1.3 The fair split depends on the model"),
  P("Figure 5.3 shows each tenant's cost when running alone and the cost of all three together. Going from 7B to 14B, chat's busy time barely moves (55.2 to 58.2 s), while docs nearly doubles (18.1 to 33.7 s) and the agent rises by half (40.7 to 62.5 s). Chat's cost is set by time rather than computation: its 127 short requests are spread over the whole minute, so the engine keeps stepping for about the length of the traffic window whatever the model. On 14B each step takes twice as long (24.8 against 11.1 ms), but more requests share each step, so chat needs half as many steps. Docs and agent are set by computation, which grows with model size."),
  ...FIGURE("report/r_1_cost_by_model.png", "5.3", "GPU busy time and milliseconds per engine step for each tenant alone and all three together (roomy memory, mean of 4 seeds)", 640),
  P("As a result the fair split moves with the model (Figure 5.4). At roomy memory, chat / docs / agent is 53 / 14 / 33% on 7B and 35 / 20 / 45% on 14B. Every fixed formula gives essentially the same split on every model, because the token traffic is the same: plain tokens always give 33 / 34 / 33, and API-style prices about 50 / 32 / 18. The API-style split happens to suit chat on 7B, but on 14B it over-charges chat by 15 points and under-charges the agent by 26, and its error grows from 0.37 to 0.53. Fitted to each model's measurements, an output token costs 18 times an uncached input token on 7B but only 6 times on 14B. **No single price ratio can be fair on both models.**"),
  ...FIGURE("report/r_2_who_pays.png", "5.4", "Each tenant's fair (Shapley) share for the three setups, against plain token billing", 640),
  P("Memory × time is the worst method on 7B (0.37–0.61) but scores 0.07 on 14B at very tight memory. It did not become a better measure; the 14B's fair split simply moved towards the split it gives."),

  H3("5.1.4 Memory pressure adds a cost that benchmarks miss"),
  P("Squeezing the KV cache makes serving everyone more expensive, and more so on bigger models (Figure 5.5, Table 5.3). From roomy to very tight memory, the busy time of the full coalition grows by 15% on the laptop, 25% on 7B and 47% on 14B (88.9 s to 130.8 s); energy grows by 18%, 22% and 45%. The extra cost comes from preemptions (10–13 per full-coalition run at very tight) and from recomputing evicted cache, and sharing saves less: on 14B serving all three costs 77% of serving them separately at very tight, against 58% at roomy."),
  ...FIGURE("report/r_4_memory_pressure.png", "5.5", "Left: extra GPU busy time to serve all three tenants as memory shrinks. Right: error of the token price calibrated on each tenant running alone", 640),
  P("The calibrated price's error follows this extra cost on the A100s: 0.10 / 0.09 / 0.14 on 7B and 0.09 / 0.15 / 0.21 on 14B, above the target at both tight levels. A tenant running alone hardly experiences memory pressure, so benchmarks of single tenants have nothing to learn this cost from. The fault is in the calibration data, not the form of the price: the same three-rate price fitted to Shapley values stays at 0.04–0.06 on 14B at every level. The laptop is an exception whose calibrated price improves under pressure; the pattern holds on both A100 runs but remains an explanation that the data supports rather than a proven mechanism."),
  TCAP("5.3", "Memory pressure and interference with all three tenants sharing: laptop / 7B / 14B"),
  TABLE(["Measurement", "Roomy", "Tight", "Very tight"], [
    ["Busy time (s)", "58.1 / 58.9 / 88.9", "60.5 / 61.0 / 99.5", "66.7 / 73.5 / 130.8"],
    ["Extra busy time vs roomy", "–", "+4 / +3 / +12%", "+15 / +25 / +47%"],
    ["Extra dynamic energy vs roomy", "–", "+5 / +6 / +17%", "+18 / +22 / +45%"],
    ["Preemptions per run", "0 / 0 / 0", "5.5 / 3.0 / 8.5", "9.8 / 11.5 / 13.2"],
    ["All three ÷ sum of each alone", "0.58 / 0.52 / 0.58", "0.61 / 0.53 / 0.65", "0.66 / 0.62 / 0.77"],
    ["Chat p95 time to first token (alone 0.11 / 0.10 / 0.26 s)", "1.20 / 0.64 / 2.04 s", "3.66 / 3.12 / 14.67 s", "7.37 / 8.84 / 29.16 s"],
    ["Agent cache-hit rate (alone at very tight 73 / 70 / 54%)", "77 / 77 / 76%", "41 / 38 / 36%", "23 / 19 / 13%"],
    ["Agent's API-style bill vs alone", "1.00 / 1.00 / 1.01×", "1.54 / 1.59 / 1.49×", "1.64 / 1.61 / 1.35×"],
  ], [34, 22, 22, 22], { size: 19, center: [1, 2, 3] }),
  GAP(),

  H3("5.1.5 Tenants harm each other, and the evicted tenant pays"),
  P("No per-token price can represent these effects, because they depend on who else is running (Figure 5.6). On 14B, chat's slowest 5% of requests wait 0.26 s for their first token when chat runs alone; with all three sharing this grows to 2.0 s at roomy, 14.7 s at tight and 29.2 s at very tight, a 112-fold slowdown. When alone, the agent reuses 77% of its prompt tokens from the cache; sharing at tight memory pushes this down to 36%, and at very tight to 13%, so the GPU recomputes the evicted context. Under cache-discounted (API-style) pricing the agent's bill for identical work rises 1.49× at tight and 1.35× at very tight on 14B, 1.59× and 1.61× on 7B and 1.54× and 1.64× on the laptop. The tenants that caused the evictions pay nothing extra. The effect appears on all three setups, so it does not depend on model size or hardware."),
  ...FIGURE("report/r_5_interference.png", "5.6", "Left: chat's 95th-percentile time to first token with all three tenants sharing (log scale). Right: the agent's cache-discounted bill when sharing, relative to the same work alone", 640),
  P("Load also matters. On 7B the GPU had spare capacity and adding a tenant was nearly free (serving all three cost 52–62% of serving them separately), which made leave-one-out billing wrong by 0.29–0.50. On 14B the GPU was overloaded (all three needed 89 s of GPU time for 60 s of traffic), costs added up more (58–77%), and leave-one-out improved to 0.16–0.19. The two cluster runs therefore cover a lightly and a heavily loaded GPU, and the main conclusions hold under both."),

  H3("5.1.6 What makes a token price fair"),
  P("Since the replays contain every tenant combination, the three-rate price can be refitted in several ways without new GPU time, always fitting on three seeds and testing on the fourth. Five calibration sources were compared: each tenant alone (the calibrated price above), the three pairs, all combinations, each tenant alone with a fourth price per KV GiB-second, and the Shapley values measured on the other seeds. Table 5.4 and Figure 5.7 summarise the error over the nine setup and memory cells."),
  TCAP("5.4", "Error of five ways to calibrate a token price, over 9 cells (3 setups × 3 memory levels)"),
  TABLE(["Calibration data", "Busy time: mean / worst / cells above 0.1", "Energy: mean / worst / cells above 0.1"], [
    ["Each tenant alone (benchmarks)", "0.112 / 0.208 / 4", "0.100 / 0.171 / 3"],
    ["Pairs of tenants only", "0.230 / 0.319 / 9", "0.205 / 0.275 / 8"],
    ["All tenant combinations", "0.093 / 0.151 / 4", "0.075 / 0.115 / 3"],
    ["Each tenant alone plus a memory-time price", "0.103 / 0.154 / 5", "0.092 / 0.126 / 3"],
    ["**Measured Shapley values (other seeds)**", "**0.066 / 0.109 / 1**", "**0.059 / 0.088 / 0**"],
  ], [40, 30, 30], { size: 20, center: [1, 2] }),
  GAP(),
  ...FIGURE("report/calibration.png", "5.7", "Held-out error of five ways to calibrate a three-rate token price; one mark per setup and memory level, bar = mean of the nine cells", 640),
  P("Fitting to cost totals is not enough. Calibrating on all combinations improves the average and fixes two cells (7B very tight 0.14 to 0.07, 14B tight 0.15 to 0.07), but 14B very tight stays at 0.15. Pairs alone are worse than useless, because a pair's total cost cannot tell which tenant's tokens caused it. The memory-time price helps exactly where memory pressure is worst (14B very tight 0.21 to 0.12) but hurts elsewhere (7B tight 0.09 to 0.14). **A token price fitted to measured Shapley values works everywhere:** the worst cell is 0.11 on busy time and every cell is within 0.09 on energy. Its prices differ by model and memory level, as Section 5.1.3 says they must."),
  P("A token price can therefore be fair, but only if it is periodically recalibrated against Shapley values measured on the same model under the same memory conditions. This is exactly the measurement that replay-based attribution provides, and it gives FairShareAI a concrete design: replay tenant combinations periodically to measure Shapley values, and bill per token in between with model- and condition-specific prices. The held-out seeds use the same three tenants and traffic mix, so whether such prices carry over to a different mix of tenants remains to be tested."),

  H2("5.2 Comparison with the Objectives"),
  P("Table 5.5 compares the results with the objectives set in Chapter 1, and Table 5.6 compares them with the expectations stated before the cluster runs."),
  TCAP("5.5", "Results against the objectives"),
  TABLE(["Objective", "Target", "Achieved", "Status"], [
    ["O1 Replay harness", "Repeat change below 1%; share noise below 0.005", "Median 0.19% (7B) and 0.56% (14B); noise floor at most 0.003", "Met"],
    ["O2 Billing error", "7 methods × 3 setups × 3 levels × 4 seeds", "All evaluated on busy time and energy; plain tokens 0.22–0.42; API-style up to 0.53; measurement-based methods 0.04–0.10 at roomy", "Met"],
    ["O3 Interference", "Extra cost, tail latency and cache loss per setup and level", "Memory pressure +15 / +25 / +47%; chat p95 up to 29.2 s; victim pays 35–64% more", "Met"],
    ["O4 Cluster scale", "7B and 14B on an A100, 96 clean replays each", "96 + 96 clean; 8 contaminated attempts detected and discarded", "Met"],
    ["O5 Fair token price", "A calibration within about 0.1 everywhere", "Shapley-calibrated price: worst 0.11 (busy), 0.09 (energy); benchmark calibration fails at 0.21", "Met, with a new design consequence"],
    ["Synopsis: fair scheduler compared with VTC", "Fewer requests missing their latency target", "Not attempted this semester; interference results now quantify what it must fix", "Deferred to next phase"],
  ], [20, 25, 43, 12], { size: 18 }),
  GAP(),
  TCAP("5.6", "Expectations before the cluster runs and what was found"),
  TABLE(["Expectation", "Finding"], [
    ["Token billing error replicates on bigger models", "Yes: still 0.22–0.27 on 14B, far above 0.1; the under-charged tenant changed from chat to the agent"],
    ["Near full load, costs become more additive", "Yes: all three cost 58–77% of the separate total on 14B; leave-one-out improves; main conclusions unchanged"],
    ["Benchmark-calibrated prices slip under memory pressure", "Stronger than expected: memory pressure adds 47% on 14B and the calibrated price reaches 0.21"],
    ["Memory × time may become a good proxy on bigger models", "Only by coincidence: 0.07 on 14B very tight, but 0.37 on 7B with a similar split"],
    ["Calibrating on pairs or adding a memory price fixes the slip", "Only partly; fitting to measured Shapley values fixes every cell"],
    ["(Not predicted)", "API-style prices get worse on the bigger model (0.37 to 0.53), and the fair split moves with model size"],
  ], [40, 60], { size: 19 }),
  GAP(),

  H2("5.3 Economic Analysis"),
  H3("5.3.1 Bill of materials and resource use"),
  P("All software was open source and the GPUs were provided by the institute, so the project had no direct expenses. Table 5.7 lists the resources used, with an indicative market value for the GPU time."),
  TCAP("5.7", "Bill of materials and resources used"),
  TABLE(["Item", "Quantity", "Cost to the project", "Indicative market value"], [
    ["Laptop with RTX 3050 4 GB (existing)", "1, for development and the first experiment", "₹0", "–"],
    ["A100 80 GB GPU time on RU", "About 7–8 GPU-hours including smoke tests and diagnostics (3.4 h of measured busy time across both models)", "₹0 (institute facility)", "About ₹1,200–1,400 at about US$2 per A100-hour"],
    ["GPU dynamic energy", "0.08 + 0.37 + 0.56 kWh of measured replays", "₹0", "Under ₹10"],
    ["Software (vLLM, PyTorch, Python libraries)", "Open source", "₹0", "₹0"],
    ["Storage", "Models 1 + 15 + 29 GB; results about 8 MB", "₹0 (cluster storage)", "Negligible"],
    ["Total", "", "₹0", "About ₹1,500"],
  ], [27, 33, 18, 22], { size: 19 }),
  GAP(),
  H3("5.3.2 Cost–benefit for an operator"),
  P("Consider an organisation running one 8-GPU A100 server shared by several teams. At about US$2 per GPU-hour, the server costs about US$11,500 (roughly ₹10 lakh) per month. Our results suggest that billing it by token count would put 11–21% of that cost, about ₹1–2 lakh every month, on the wrong teams, and benchmark-calibrated prices would still misplace up to about 10% under memory pressure."),
  P("The fix we propose is cheap. Recalibrating against measured Shapley values needs the seven tenant combinations replayed for a few seeds at each memory condition of interest. Our replays took about one to two minutes each, so a recalibration of one model at one condition with four seeds is roughly 32 replays, or under an hour on one GPU. Done weekly for three conditions, this is a few GPU-hours out of the 1,344 GPU-hours the server provides each week, well under 1% of its capacity, in exchange for reducing mis-billing from 11–21% to about 5% or less."),
  H3("5.3.3 Resource utilisation"),
  P("The experiment design kept resource use low. Each memory level of a model ran in a single job of about an hour of GPU time or less; resumable runs meant that no replay was ever repeated after a failure; and the fixed KV pool kept our memory footprint at about 20–55 GB, which let the jobs run next to other users' work on a busy shared cluster."),

  H2("5.4 Comparison with Existing Solutions and Standards"),
  P("Table 5.8 compares this project with existing approaches and with common industry practice."),
  TCAP("5.8", "Comparison with existing solutions and practice"),
  TABLE(["Solution", "What it provides", "How this project differs"], [
    ["Token-based chargeback and commercial API ratios", "Simple per-token prices, often output 4–5× input and cached input discounted", "Measured to put 11–21% of the bill on the wrong tenant; API ratios get worse on the bigger model (0.53)"],
    [`JouleShare`, "Exact Shapley energy attribution per request", "Tenant level, busy time and energy, three memory levels, calibrated prices as baselines; reaches similar token-billing error (0.13–0.41 on energy, against about 0.45)"],
    [`StepSplit`, "Cheap closed-form Shapley energy per request", "We replay exactly; our main new results (memory pressure, eviction victims) are not part of its evaluation; its approach could make our recalibration cheaper"],
    [`unalloc`, "Ledger of shared AI spend; token vs time-share meter gap of 12–14 pp", "We add a fair reference, memory pressure and model-size dependence; our 11–21% is a similar size of gap"],
    [`PrefixShield`, "Protects victims' cache hits through eviction policy", "We put a price on the victim's loss (35–64% higher bill) and show who should pay"],
    [`VTC`, "Fair scheduling by weighted token counts", "Shows that token counts are not cost, so token-based fairness is not cost fairness"],
    [`FinOps FOCUS`, "Standard format for cost and usage data and its allocation", "Our per-tenant busy time and energy could be reported as FOCUS cost-allocation data; FOCUS leaves the allocation rule open, which our results inform"],
  ], [22, 32, 46], { size: 18 }),
  GAP(),
  P("As far as our literature check (November 2026) found, five results are new: attribution under KV-cache memory pressure and its growth with model size; the measured victim-pays effect; the fair split moving with model size, so that no fixed token formula can be fair across models; exact tenant-level Shapley attribution on a real engine at three model sizes; and a calibration recipe that keeps token prices within the target where benchmark calibration does not."),

  // ===================== CHAPTER 6 =====================
  H1("CHAPTER 6: CONCLUSION AND FUTURE SCOPE"),
  H2("6.1 Summary of Achievements"),
  P("This project set out to measure whether token billing divides the cost of a shared LLM server fairly, and what a fair alternative needs. The main achievements are:"),
  B("A measurement harness for vLLM that replays every tenant combination with identical requests and records busy time, dynamic energy, latency and cache behaviour per tenant, with a measurement noise floor of 0.003."),
  B("A contamination guard that makes precise GPU measurements possible on a shared university cluster without GPU isolation, validated by repeat, diagnostic and heavy-neighbour tests."),
  B("288 clean replays across three setups, from a 0.5B model on a laptop to a 14B model on an A100, at three memory levels."),
  B("Evidence that token billing puts 11–21% of the bill on the wrong tenant on every setup, that the fair split moves with model size so that no fixed formula can be fair across models, that memory pressure adds a sharing-only cost of up to 47% which benchmarks cannot see, and that evicted tenants pay 35–64% more for identical work."),
  B("A calibration recipe: a three-rate token price fitted to measured Shapley values stays within about 0.1 in every condition, which gives the FairShareAI platform its design (periodic replay-based calibration plus per-token billing)."),

  H2("6.2 Impact on Society, Environmental Sustainability, Ethical Issues and Compliance"),
  P("**Society.** Fair and auditable cost attribution supports trust between the teams and customers that share AI infrastructure, and stops the cost of heavy workloads from falling silently on others. The measured victim-pays effect and the up to 112-fold slowdown of interactive requests show that shared servers need both fair prices and protective scheduling."),
  P("**Environmental sustainability.** Measuring energy per tenant is a step towards per-tenant carbon accounting. By showing that memory contention alone can add nearly half to the GPU time needed for the same work, the project gives operators a measurable reason to reduce it through scheduling and provisioning."),
  P("**Ethics and compliance.** No personal data was used or stored, tenants' caches were isolated to prevent prompt leakage, the shared cluster was used through its scheduler within its rules, and every discarded measurement is reported. All software is used under its open-source licence, and the results can be reproduced from the published scripts and raw data."),

  H2("6.3 Limitations"),
  ...NL([
    "**Synthetic workload.** Prompts are random token IDs, output lengths are forced and every tenant sends the same token volume. This is good for a controlled comparison but is not real traffic.",
    "**Small experiment.** Three tenants and four seeds per setup; leave-one-out in particular varies across seeds.",
    "**Load not controlled.** The same request rates were used on every model, so the 7B GPU was lightly loaded and the 14B GPU heavily loaded. The runs cover both regimes but do not separate the effect of load from that of model size.",
    "**Several physical GPUs.** Each memory level ran on one GPU, but levels were spread over three A100s. The 14B roomy to very tight comparison (+47%) is on a single GPU; the 7B comparison spans two.",
    "**Shared cluster.** Some 14B replays ran next to a light neighbour (at most 4.5% average use), shown not to matter, and CPU load from other users on the node was recorded but not controlled.",
    "**Generalisation of the recipe.** Shapley-calibrated prices were tested on new seeds of the same three tenants, not on a different tenant mix.",
    "**Busy time includes engine overhead** and counts a step the same however full the batch is; dynamic energy is reported as a second measure for this reason and gives the same conclusions.",
  ]),

  H2("6.4 Future Work"),
  ...NL([
    "**Generalisation to new tenant mixes.** Calibrate prices with three tenants and test them on a mix with one tenant removed, a new tenant added, or different request rates. This is the main open question for the proposed design.",
    "**A controlled load sweep** of the same tenants at increasing request rates on one model, to separate load from model size.",
    "**Real traces and more seeds,** including agent traces shaped like those in TraceLab, and larger models split across several GPUs (30B to 70B parameters).",
    "**Cheaper recalibration** using approximate Shapley methods such as StepSplit, so that prices can be refreshed often without replaying every combination.",
    "**Eviction-aware pricing** that charges the tenant causing an eviction rather than the victim, and the **fair admission scheduler** from the synopsis, compared with VTC, to reduce the interference that no price can undo.",
    "**The FairShareAI platform:** the gateway, the online cost ledger and reports, built on the calibration recipe established here.",
    "**Publication.** The model-size and memory-pressure results, the victim-pays measurement and the calibration recipe are suitable for a workshop paper or preprint after the generalisation test.",
  ]),
];

// references
const refsSection = () => [
  H1("REFERENCES"),
  ...[...ORDER, ...Object.keys(REFS).filter((k) => !ORDER.includes(k))].map((k, i) => new Paragraph({
    tabStops: [{ type: TabStopType.LEFT, position: 680 }], indent: { left: 680, hanging: 680 }, spacing: { after: 100, line: 300 },
    alignment: AlignmentType.LEFT, children: [new TextRun(`[${i + 1}]`), new TextRun({ children: [new Tab()] }), ...runs(REFS[k])],
  })),
];

// appendices and annexures
const appendices = [
  H1("APPENDIX A: DETAILED RESULTS"),
  P("The tables below give the full numbers behind the figures in Chapter 5. They are printed by compare_models.py and calibration_check.py from the raw data."),
  TCAP("A.1", "Error versus Shapley, busy time (mean ± SD over 4 seeds): laptop / 7B / 14B"),
  TABLE(["Method", "Roomy", "Tight", "Very tight"], [
    ["Plain token count", "0.42±0.06 / 0.42±0.06 / 0.27±0.03", "0.40±0.06 / 0.39±0.06 / 0.22±0.03", "0.31±0.05 / 0.26±0.01 / 0.24±0.02"],
    ["API-style price", "0.30±0.05 / 0.37±0.04 / 0.53±0.05", "0.23±0.07 / 0.28±0.04 / 0.37±0.05", "0.16±0.03 / 0.17±0.04 / 0.33±0.01"],
    ["Calibrated 3-rate price", "0.10±0.04 / 0.10±0.05 / 0.09±0.05", "0.07±0.02 / 0.09±0.02 / 0.15±0.03", "0.05±0.04 / 0.14±0.05 / 0.21±0.03"],
    ["Best possible 3-rate price", "0.08±0.01 / 0.08±0.03 / 0.04±0.04", "0.08±0.02 / 0.11±0.03 / 0.04±0.03", "0.05±0.02 / 0.06±0.03 / 0.06±0.05"],
    ["Cost when running alone", "0.09±0.02 / 0.10±0.04 / 0.08±0.01", "0.07±0.01 / 0.07±0.05 / 0.10±0.03", "0.04±0.02 / 0.08±0.01 / 0.12±0.02"],
    ["Leave-one-out", "0.29±0.07 / 0.50±0.17 / 0.17±0.06", "0.20±0.04 / 0.39±0.17 / 0.19±0.03", "0.15±0.03 / 0.29±0.03 / 0.16±0.03"],
    ["Memory × time", "0.65±0.06 / 0.61±0.07 / 0.36±0.09", "0.59±0.04 / 0.55±0.08 / 0.14±0.02", "0.46±0.05 / 0.37±0.04 / 0.07±0.01"],
  ], [22, 26, 26, 26], { size: 17, center: [1, 2, 3] }),
  GAP(),
  TCAP("A.2", "Error versus Shapley, dynamic energy (roomy / tight / very tight)"),
  TABLE(["Method", "Laptop", "7B", "14B"], [
    ["Plain token count", "0.41 / 0.38 / 0.29", "0.36 / 0.31 / 0.21", "0.16 / 0.13 / 0.19"],
    ["API-style price", "0.31 / 0.23 / 0.15", "0.28 / 0.17 / 0.13", "0.42 / 0.29 / 0.29"],
    ["Calibrated 3-rate price", "0.10 / 0.08 / 0.06", "0.10 / 0.07 / 0.14", "0.07 / 0.13 / 0.17"],
    ["Best possible 3-rate price", "0.09 / 0.08 / 0.05", "0.08 / 0.08 / 0.03", "0.05 / 0.03 / 0.05"],
    ["Cost when running alone", "0.08 / 0.07 / 0.04", "0.08 / 0.07 / 0.10", "0.06 / 0.10 / 0.11"],
    ["Leave-one-out", "0.35 / 0.24 / 0.17", "0.40 / 0.28 / 0.26", "0.15 / 0.17 / 0.15"],
    ["Memory × time", "0.63 / 0.57 / 0.43", "0.57 / 0.50 / 0.35", "0.25 / 0.13 / 0.11"],
  ], [31, 23, 23, 23], { size: 19, center: [1, 2, 3] }),
  GAP(),
  TCAP("A.3", "Each tenant's share of the bill, chat / docs / agent (%), busy time"),
  TABLE(["", "Roomy", "Tight", "Very tight"], [
    ["Plain token count (any model)", "33 / 34 / 33", "33 / 34 / 33", "33 / 34 / 33"],
    ["Shapley, laptop 0.5B", "54 / 17 / 29", "53 / 18 / 29", "48 / 21 / 31"],
    ["Shapley, 7B", "53 / 14 / 33", "51 / 15 / 34", "43 / 21 / 36"],
    ["Shapley, 14B", "35 / 20 / 45", "33 / 24 / 43", "28 / 26 / 45"],
    ["API-style price, 14B", "50 / 32 / 18", "46 / 30 / 25", "43 / 28 / 29"],
    ["Calibrated price, 14B", "38 / 22 / 40", "40 / 24 / 36", "38 / 27 / 35"],
  ], [31, 23, 23, 23], { size: 19, center: [1, 2, 3] }),
  GAP(),
  TCAP("A.4", "Roomy memory, mean of 4 seeds: busy time / engine steps / milliseconds per step"),
  TABLE(["", "Laptop", "7B", "14B"], [
    ["chat alone", "50.2 s / 6,600 / 7.6", "55.2 s / 4,963 / 11.1", "58.2 s / 2,345 / 24.8"],
    ["docs alone", "17.6 s / 1,113 / 15.9", "18.1 s / 1,114 / 16.3", "33.7 s / 954 / 35.3"],
    ["agent alone", "32.1 s / 4,320 / 7.4", "40.7 s / 3,762 / 10.8", "62.5 s / 2,787 / 22.4"],
    ["all three together", "58.1 s / 4,790 / 12.1", "58.9 s / 4,270 / 13.8", "88.9 s / 2,494 / 35.6"],
  ], [25, 25, 25, 25], { size: 19, center: [1, 2, 3] }),
  GAP(),
  P("Fitted calibrated prices put an output token at 16.0 / 15.6 / 14.1 (laptop), 18.0 / 17.0 / 14.6 (7B) and 6.4 / 6.0 / 4.1 (14B) times an uncached input token, for roomy / tight / very tight memory."),

  H1("APPENDIX B: SOURCE FILES AND REPRODUCTION"),
  P("All code, raw data and analysis scripts are kept together in the project repository. Table B.1 lists the files and how to regenerate every result."),
  TCAP("B.1", "Project files"),
  TABLE(["File", "Purpose"], [
    ["poc/workload.py", "Synthetic three-tenant workload generator"],
    ["poc/run_experiments.py", "Replay driver, busy-time and energy metering, contamination guard, completion check"],
    ["poc/pick_gpu.py", "Chooses an idle GPU with enough free memory, waiting up to a limit"],
    ["poc/run.pbs", "PBS job for one model and memory level on the cluster"],
    ["poc/analyze.py", "Shapley values, billing methods, latency and cache statistics for one setup"],
    ["poc/compare_models.py", "Cross-model comparison and the result figures"],
    ["poc/calibration_check.py", "The five calibration methods of Section 5.1.6"],
    ["poc/results/…/runs.jsonl", "Raw data: one JSON row per replay for the laptop, 7B and 14B"],
    ["report/make_report_figures.py, build_report.js", "Figures and this report"],
  ], [35, 65], { size: 20 }),
  GAP(),
  P("To regenerate the analysis on any computer with Python: run python compare_models.py and python calibration_check.py from the poc folder (they need only NumPy, SciPy and Matplotlib). To repeat a cluster measurement: qsub -v KV=roomy,MODEL=Qwen/Qwen2.5-14B-Instruct run.pbs, once for each memory level."),

  H1("ANNEXURE I: PO / PSO MAPPING"),
  P("Table I.1 maps the project's technical work to the programme outcomes (3 = strong, 2 = medium, 1 = low)."),
  TCAP("I.1", "Mapping of project work to programme outcomes"),
  TABLE(["Outcome", "Level", "How the project addresses it"], [
    ["PO1 Engineering knowledge", "3", "Applies operating-systems, GPU-architecture, probability and game-theory knowledge (Shapley value) to LLM serving"],
    ["PO2 Problem analysis", "3", "Critical analysis of the proposal and literature; identification of six research gaps; research questions with a measurable target"],
    ["PO3 Design / development of solutions", "3", "Design of the replay harness, contamination guard and calibration method"],
    ["PO4 Investigation of complex problems", "3", "Controlled experiments on three setups and three memory levels, with noise floors, held-out evaluation and validation tests"],
    ["PO5 Modern tool usage", "3", "vLLM, NVML, PBS on an A100 HPC cluster, Python scientific stack"],
    ["PO6 The engineer and society", "2", "Fair chargeback between teams; protecting interactive users from heavy workloads"],
    ["PO7 Environment and sustainability", "2", "Per-tenant energy measurement; quantifying the energy cost of memory contention"],
    ["PO8 Ethics", "2", "No personal data; tenant cache isolation; honest reporting of discarded measurements; licence compliance"],
    ["PO9 Individual and team work", "3", "Work divided across three members with shared design and review (Annexure IV)"],
    ["PO10 Communication", "3", "Synopsis, results summaries, this report and figures designed for readability"],
    ["PO11 Project management and finance", "2", "Work breakdown, timeline, risk management and the economic analysis of Section 5.3"],
    ["PO12 Life-long learning", "3", "Learning HPC job scheduling, GPU metering and recent LLM-serving research beyond the curriculum"],
    ["PSO1 [department statement]", "–", "[Map to the department's PSO1]"],
    ["PSO2 [department statement]", "–", "[Map to the department's PSO2]"],
  ], [30, 8, 62], { size: 19, center: [1] }),
  GAP(),

  H1("ANNEXURE II: OUTCOME OF THE REPORT"),
  P("The outcome of this project is an application: the FairShareAI measurement and attribution toolkit described in Chapters 3 and 4. It replays every combination of tenants on a vLLM inference server, measures GPU busy time and energy with a contamination guard for shared clusters, and computes each tenant's fair (Shapley) share of the cost, the error of each billing method and calibrated token prices. It has been run on a laptop GPU and on the institute's A100 cluster, and every result in this report was produced with it."),
  P("Source code repository: https://github.com/mudit06mah/FairShareAI"),
  P("We also plan to submit the results as a research paper to a conference or workshop. The strongest contributions for publication are: no fixed token price is fair across model sizes; memory pressure adds a sharing-only cost that grows with model size and defeats benchmark-calibrated prices; the measured victim-pays effect; and a calibration recipe that stays within the error target in every measured condition."),
  P("[Attach proof of submission or acceptance here when available.]"),

  H1("ANNEXURE III: SUSTAINABILITY STATEMENT"),
  P("Large language models are among the most energy-intensive workloads in today's data centres, and shared GPU servers are becoming the normal way to run them inside organisations. This project contributes to more sustainable AI infrastructure in three ways."),
  P("First, it measures energy, not only time. The harness records each replay's dynamic GPU energy from the GPU's own counter, and every conclusion was checked with energy as the cost measure. A fair division of energy between tenants is a prerequisite for per-tenant carbon accounting, so that each team or customer can see and reduce the emissions it causes."),
  P("Second, it makes waste visible. We found that running the same work with too little KV-cache memory added 15–47% to the GPU time and 18–45% to the energy needed, purely because tenants evict and recompute each other's data. Token billing hides this cost; the attribution method developed here exposes it, giving operators an incentive to provision memory and schedule requests to avoid it, and giving tenants an incentive to use cache-friendly request patterns."),
  P("Third, the project itself used resources sparingly. It ran on the institute's existing HPC cluster rather than on new hardware; the whole cluster study used about 7–8 A100-hours and under 1 kWh of measured dynamic GPU energy; resumable jobs never repeated a measurement; and a small, fixed memory footprint let our jobs share GPUs with other users instead of occupying them."),

  H1("ANNEXURE IV: TEAM ROLES"),
  P("The work was divided as follows. Each member took primary ownership of specific parts, while design decisions, code reviews, analysis of the results and the report were done jointly."),
  TCAP("IV.1", "Contributions of each team member"),
  TABLE(["Student", "Enrolment No.", "Specific contributions"], [
    ["Aditya Bansal", "23803009", "Set up access to the RU cluster (VPN, SSH, accounts); built the Python and vLLM environment on the cluster and solved the driver, sqlite3 and FlashInfer problems; wrote the PBS job script, GPU picker and completion check; designed and validated the contamination guard (diagnostic and heavy-neighbour tests); ran all 7B and 14B experiments"],
    ["Sambhav Ghildiyal", "23803005", "Led the literature survey and the critical analysis of the proposal; implemented the Shapley and billing-method analysis, the cross-model comparison and the calibration study; produced the figures; led the writing of the synopsis and this report"],
    ["Mudit Maheshwari", "23803017", "Designed the three-tenant workload and wrote the generator; wrote the replay driver and its integration with the vLLM engine; implemented busy-time, energy, latency, cache and KV-memory metering; ran the laptop proof-of-concept"],
  ], [18, 14, 68], { size: 20 }),
];

// ---------- document ----------
const page = { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, header: 567, footer: 567 } };
const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 22 })] })] });
const bulletLevels = [
  { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 340 } } } },
  { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1134, hanging: 340 } } } },
];
const backMatter = [...refsSection().map((p, i) => p), ...appendices];

const doc = new Document({
  creator: STUDENTS.map(([, n]) => n).join(", "),
  title: "FairShareAI - Major Project Report",
  styles: {
    default: { document: { run: { font: FONT, size: 24 }, paragraph: { spacing: { line: LINE } } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, font: FONT, color: "000000" }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 360, line: LINE }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 28, bold: true, font: FONT, color: "000000" }, paragraph: { spacing: { before: 280, after: 120, line: LINE }, keepNext: true, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 24, bold: true, font: FONT, color: "000000" }, paragraph: { spacing: { before: 200, after: 80, line: LINE }, keepNext: true, outlineLevel: 2 } },
      { id: "FigureCaption", name: "FigureCaption", basedOn: "Normal", next: "Normal", run: { size: 22, font: FONT }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 40, after: 240, line: 276 } } },
      { id: "ListingCaption", name: "ListingCaption", basedOn: "Normal", next: "Normal", run: { size: 22, font: FONT }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 200, after: 100, line: 276 }, keepNext: true } },
      { id: "TableCaption", name: "TableCaption", basedOn: "Normal", next: "Normal", run: { size: 22, font: FONT }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 200, after: 100, line: 276 }, keepNext: true } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: bulletLevels },
      ...NUM_REFS.map((ref) => ({ reference: ref, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 425 } } } }] })),
    ],
  },
  sections: [
    { properties: { titlePage: true, page: { ...page, pageNumbers: { start: 1, formatType: NumberFormat.LOWER_ROMAN } } }, footers: { default: footer, first: new Footer({ children: [new Paragraph({ children: [] })] }) }, children: [...cover, ...prelims] },
    { properties: { page: { ...page, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } }, footers: { default: footer }, children: [...chapters, ...backMatter] },
  ],
});

const unused = Object.keys(REFS).filter((k) => !ORDER.includes(k));
if (unused.length) console.log("listed without an in-text marker:", unused.join(", "));
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(path.join(__dirname, "FairShareAI_Major_Project_Report.docx"), buf);
  console.log(`written: ${Object.keys(REFS).length} references`);
});
