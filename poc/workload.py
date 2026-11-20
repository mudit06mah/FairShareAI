"""Synthetic three-tenant workload for the FairShare PoC.

Prompts are random token IDs (not text) so prefix relationships are exact and
controlled. Output lengths are forced with ignore_eos so every coalition replays
exactly the same token volume per tenant.

Shapes are loosely anchored to TraceLab (arXiv 2606.30560) for the agent tenant:
median append ~860 tokens, median output ~250 tokens, short tool gaps.
"""

from dataclasses import dataclass, field
import random

VOCAB_LOW, VOCAB_HIGH = 1000, 150000  # stay clear of Qwen2.5 special tokens
TENANTS = ("chat", "docs", "agent")


@dataclass
class Request:
    tenant: str
    rid: str
    arrival: float  # seconds after run start (agent turns > 0 are dependent, see below)
    prompt: list[int]
    max_tokens: int


@dataclass
class AgentSession:
    sid: str
    start: float
    base_prompt: list[int]
    appends: list[list[int]]  # tool-result tokens appended before turns 1..T-1
    tool_delays: list[float]  # delay between turn k finishing and turn k+1 arriving
    max_tokens: int


@dataclass
class Workload:
    seed: int
    window_s: float
    chat: list[Request] = field(default_factory=list)
    docs: list[Request] = field(default_factory=list)
    agent: list[AgentSession] = field(default_factory=list)


def _toks(rng: random.Random, n: int) -> list[int]:
    return [rng.randrange(VOCAB_LOW, VOCAB_HIGH) for _ in range(n)]


def agent_session_tokens(base: int, turns: int, append: int, out: int) -> int:
    total = 0
    ctx = base
    for _ in range(turns):
        total += ctx + out
        ctx += out + append
    return total


def make_workload(
    seed: int,
    window_s: float = 60.0,
    agent_sessions: int = 4,
    agent_turns: int = 6,
    agent_base: int = 1024,
    agent_append: tuple[int, int] = (700, 1000),
    agent_out: int = 256,
    agent_tool_delay: tuple[float, float] = (0.5, 2.0),
    chat_prompt: tuple[int, int] = (256, 1024),
    chat_out: int = 128,
    docs_prompt: tuple[int, int] = (6144, 12288),
    docs_out: int = 128,
) -> Workload:
    """Build a workload where each tenant has approximately the same total tokens.

    The agent tenant's token volume sets the target; chat and docs requests are
    drawn until they reach it.
    """
    rng = random.Random(seed)
    wl = Workload(seed=seed, window_s=window_s)

    # Agent: dependent multi-turn sessions with a growing, fully reused prefix.
    target = 0
    for s in range(agent_sessions):
        appends = [_toks(rng, rng.randint(*agent_append)) for _ in range(agent_turns - 1)]
        delays = [rng.uniform(*agent_tool_delay) for _ in range(agent_turns - 1)]
        sess = AgentSession(
            sid=f"agent-s{s}",
            start=rng.uniform(0, window_s * 0.5),
            base_prompt=_toks(rng, agent_base),
            appends=appends,
            tool_delays=delays,
            max_tokens=agent_out,
        )
        wl.agent.append(sess)
        ctx = agent_base
        for k in range(agent_turns):
            target += ctx + agent_out
            if k < agent_turns - 1:
                ctx += agent_out + len(appends[k])

    # Chat: many short independent requests, Poisson arrivals over the window.
    total, i = 0, 0
    while total < target:
        p = rng.randint(*chat_prompt)
        wl.chat.append(Request("chat", f"chat-{i}", 0.0, _toks(rng, p), chat_out))
        total += p + chat_out
        i += 1
    rate = len(wl.chat) / window_s
    t = 0.0
    for r in wl.chat:
        t += rng.expovariate(rate)
        r.arrival = min(t, window_s)

    # Docs: few long-context requests, uniform arrivals over the window.
    total, i = 0, 0
    while total < target:
        p = rng.randint(*docs_prompt)
        wl.docs.append(Request("docs", f"docs-{i}", rng.uniform(0, window_s), _toks(rng, p), docs_out))
        total += p + docs_out
        i += 1

    return wl


def tenant_token_totals(wl: Workload) -> dict[str, int]:
    out = {
        "chat": sum(len(r.prompt) + r.max_tokens for r in wl.chat),
        "docs": sum(len(r.prompt) + r.max_tokens for r in wl.docs),
    }
    tot = 0
    for s in wl.agent:
        ctx = len(s.base_prompt)
        for k in range(len(s.appends) + 1):
            tot += ctx + s.max_tokens
            if k < len(s.appends):
                ctx += s.max_tokens + len(s.appends[k])
    out["agent"] = tot
    return out


if __name__ == "__main__":
    for seed in range(3):
        wl = make_workload(seed)
        print(seed, tenant_token_totals(wl), len(wl.chat), len(wl.docs), len(wl.agent))
