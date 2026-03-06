# Hiring Criteria & Scoring Matrix
## Role: Senior AI Engineer — Agentic Systems
### INTERNAL — NOT FOR DISTRIBUTION

---

## Overview

Each interviewer scores their assigned dimensions independently before the debrief. Scores are **not averaged** — they are discussed holistically. A single **Strong No** in a critical dimension (marked ⚠️) is a veto regardless of other scores.

### Scoring Scale

| Score | Label | Meaning |
|-------|-------|---------|
| 4 | Strong Yes | Exceptional. Exceeds bar for this level. |
| 3 | Yes | Meets bar. Evidence is clear and concrete. |
| 2 | Lean No | Some signal but gaps remain. Would need significant growth. |
| 1 | Strong No | Clear miss. Do not hire. |

Avoid 2.5 / 3.5 — force a decision.

---

## Dimension 1 — Agentic Systems Architecture ⚠️ CRITICAL

**Assigned to:** Technical Interview 1 (60 min)

**What we're evaluating:** Can the candidate design and reason about complex, multi-step agentic systems? Do they understand the failure modes, not just the happy path?

### Signal Probes

- Walk me through a multi-agent system you built end-to-end. What was the orchestration model?
- How do you handle agent loops that go off the rails? What are your circuit breakers?
- Explain the tradeoff between a single large-context agent and a multi-agent pipeline for a complex task.
- How do you manage state across a long-horizon agent run that spans multiple sessions?
- Have you built hierarchical agent systems? How did you design the delegation boundaries?

### Green Flags 🟢

- Unprompted mentions of failure modes (hallucination, tool call errors, infinite loops, context exhaustion)
- Demonstrates awareness of latency/cost tradeoffs when choosing orchestration patterns
- Has a clear mental model of when NOT to use agents
- Can articulate why their design beat alternatives they considered

### Red Flags 🔴

- Only describes happy-path flows
- Cannot explain how they tested or validated agent behavior
- Treats LLM output as always reliable without sanity layers
- Confuses using a framework (LangChain) with understanding agentic design

### Scoring Rubric

| Score | Criteria |
|-------|----------|
| 4 | Deep architectural ownership. Reasons through novel multi-agent scenarios fluidly. Proactively identifies edge cases. |
| 3 | Solid experience. Can design a multi-agent system correctly with light prompting. Understands failure modes. |
| 2 | Has worked with agents but primarily as a user of frameworks. Limited original design thinking. |
| 1 | Surface-level. Cannot reason beyond tutorials or toy examples. |

---

## Dimension 2 — LLM & Prompt Engineering Depth ⚠️ CRITICAL

**Assigned to:** Technical Interview 1 (30 min) + Take-home review

**What we're evaluating:** Does the candidate understand how to reliably elicit behavior from frontier models? Do they treat prompting as engineering, not magic?

### Signal Probes

- How do you approach prompt architecture for a complex agentic task with 10+ steps?
- What's your strategy for context window management in a long agent run?
- How do you ensure structured outputs reliably, and what happens when the model defies your schema?
- Describe a case where a model update broke your prompts. How did you detect it and fix it?
- How do you think about model selection (speed vs. intelligence vs. cost) for different parts of an agent pipeline?

### Green Flags 🟢

- Treats prompts as versioned, testable artifacts
- Uses system prompts strategically (persona, constraints, output format) vs. cramming everything in user turn
- Has a process for prompt regression testing
- Understands per-model behavioral differences (e.g., Claude vs. GPT-4o vs. Gemini on tool use)

### Red Flags 🔴

- "I just describe what I want and it works"
- No experience with structured output enforcement (JSON mode, tool use, constrained decoding)
- Cannot discuss how they handle model non-compliance
- No awareness of how prompt caching or context compression affects cost

### Scoring Rubric

| Score | Criteria |
|-------|----------|
| 4 | Treats prompting as a first-class engineering discipline. Has developed novel techniques or prompt frameworks. |
| 3 | Solid prompt engineering practice. Has a system. Can debug prompt failures systematically. |
| 2 | Can write good prompts but no systematic approach. Mostly trial-and-error. |
| 1 | Views prompting as trivial or entirely intuition-based. No engineering rigor. |

---

## Dimension 3 — RAG & Knowledge Systems

**Assigned to:** Technical Interview 2 (45 min)

**What we're evaluating:** Can the candidate build retrieval systems that actually improve agent performance?

### Signal Probes

- Walk me through a RAG pipeline you built. What were the chunking and embedding choices and why?
- How did you measure retrieval quality? What metrics did you use?
- Describe a retrieval failure you encountered and how you fixed it.
- When would you use hybrid search (dense + sparse)? When is dense-only sufficient?
- How does your approach to RAG change when the knowledge base is updated frequently?

### Green Flags 🟢

- Has tuned chunk size/overlap empirically, not just accepted defaults
- Has implemented or evaluated re-ranking (cross-encoder, Cohere Rerank, etc.)
- Thinks about retrieval precision vs. recall tradeoffs in the context of downstream agent behavior
- Has experience with metadata filtering and structured retrieval alongside semantic search

### Red Flags 🔴

- Treats RAG as "just call the vector DB"
- Cannot explain embedding model tradeoffs
- Has never measured retrieval quality (no recall@k, MRR, or NDCG awareness)

### Scoring Rubric

| Score | Criteria |
|-------|----------|
| 4 | Has built and iterated RAG systems at scale with clear metric-driven improvements. |
| 3 | Solid RAG experience. Makes informed architectural choices. Has measured and improved retrieval quality. |
| 2 | Has implemented basic RAG but limited experience beyond defaults. |
| 1 | Only knows RAG conceptually or via tutorials. |

---

## Dimension 4 — Evaluation & Reliability Engineering ⚠️ CRITICAL

**Assigned to:** Technical Interview 2 (30 min)

**What we're evaluating:** Can the candidate build systems that can be trusted in production? Do they know how to measure and improve agentic behavior systematically?

### Signal Probes

- How do you eval an agent that does research and produces a written report?
- How do you detect regressions when you swap model versions?
- Describe your observability stack for a production agentic system.
- How do you build an eval dataset for a task with no ground truth?
- What's your approach to testing tool-use reliability?

### Green Flags 🟢

- Has built LLM-as-judge pipelines with calibration awareness (knows the biases)
- Uses traces (LangSmith, Langfuse, Helicone, or custom) for step-level debugging
- Has maintained eval datasets and updated them as product scope changed
- Thinks about eval coverage (happy path, edge cases, adversarial inputs)

### Red Flags 🔴

- "We check it manually before releasing"
- No structured approach to agent regression testing
- Cannot describe a metric they actually tracked in production
- Conflates unit testing code with evaluating LLM behavior

### Scoring Rubric

| Score | Criteria |
|-------|----------|
| 4 | Has built comprehensive eval harnesses for agentic systems. Has caught real production issues through evals before they reached users. |
| 3 | Has implemented evals systematically and used them to make architectural decisions. |
| 2 | Has done some eval work but it was ad hoc or borrowed from elsewhere. |
| 1 | No meaningful eval experience. Ships and hopes. |

---

## Dimension 5 — Coding & Systems Thinking

**Assigned to:** Take-home or Live Coding (90 min)

**What we're evaluating:** Is the code production-quality? Does the candidate structure systems that others can maintain?

### Signal Probes (Live Coding)

- Build a simple ReAct agent with tool use from scratch (no LangChain)
- Add retry logic and structured output validation to a tool-calling loop
- Refactor a messy agent prompt into a versioned, maintainable system

### Green Flags 🟢

- Writes async-first when appropriate (aiohttp, asyncio, concurrent tool execution)
- Separates prompt templates from business logic cleanly
- Adds logging/observability without being asked
- Asks clarifying questions about scope before coding

### Red Flags 🔴

- Writes synchronous code for inherently parallel tasks
- Hardcodes prompts inline
- Cannot reason about error handling at the tool interface boundary
- Produces code that works but is clearly unmaintainable

### Scoring Rubric

| Score | Criteria |
|-------|----------|
| 4 | Production-grade code. Proactively handles edge cases. Clean abstractions. Would pass our code review. |
| 3 | Solid code. Minor gaps but directionally correct. Understands tradeoffs. |
| 2 | Works but brittle or hard to maintain. Needs coaching on production standards. |
| 1 | Struggling code quality. Would require extensive rework. |

---

## Dimension 6 — Collaboration & Communication

**Assigned to:** Hiring Manager Interview (45 min) + Team Interview (30 min)

**What we're evaluating:** Can this person work effectively with product, research, and other engineers? Do they communicate technical tradeoffs clearly?

### Signal Probes

- Tell me about a time a product manager asked you to build an agentic feature you thought was technically infeasible. What happened?
- How do you communicate uncertainty about model behavior to non-technical stakeholders?
- Describe a technical decision you made that you later reversed. What drove the change?
- How do you stay current with the field? What's the last paper or project that changed how you work?

### Green Flags 🟢

- Pushes back constructively, not defensively
- Can explain agentic failure modes to a non-technical audience without dumbing down
- Shows intellectual humility — knows what they don't know
- Has opinions and defends them with evidence

### Red Flags 🔴

- Dismissive of non-technical stakeholders
- Cannot explain a technical concept without jargon
- Blames tools or models when systems fail
- No evidence of keeping up with a rapidly evolving field

### Scoring Rubric

| Score | Criteria |
|-------|----------|
| 4 | Exceptional communicator. Would raise the team's bar technically and culturally. |
| 3 | Clear communicator. Collaborative. Will integrate well. |
| 2 | Technically strong but may struggle to influence or collaborate cross-functionally. |
| 1 | Communication is a liability. Would slow the team down. |

---

## Interview Panel & Assignment

| Round | Format | Duration | Dimensions Covered | Interviewer |
|-------|--------|----------|--------------------|-------------|
| Recruiter Screen | Video call | 30 min | Culture fit, logistics, motivation | Recruiter |
| Technical 1 | Video + shared coding env | 90 min | Dim 1, Dim 2 | Senior Engineer |
| Technical 2 | Video + whiteboard | 75 min | Dim 3, Dim 4 | Staff Engineer |
| Take-home | Async (48hr window) | ~3 hr | Dim 5 | Engineering Lead |
| HM Interview | Video | 45 min | Dim 6 + offer discussion | Hiring Manager |
| Team Interview | Video | 30 min | Dim 6 + team vibe check | 2 Team Members |

---

## Debrief Protocol

1. All interviewers submit scores **before** the debrief call (no anchoring)
2. Debrief lead reads scores aloud — discuss outliers first
3. Any ⚠️ Critical dimension score of 1 = automatic no-hire; must be surfaced immediately
4. Hiring decision requires majority 3+ scores across all 6 dimensions
5. Hiring Manager makes final call; documents rationale in ATS

---

## Compensation Calibration

| Overall Signal | Offer Band |
|----------------|------------|
| Majority 4s, no score below 3 | Top of band + equity refresh |
| Mostly 3s, one or two 4s | Mid band |
| Mix of 3s and 2s (no critical gaps) | Low band; revisit level fit |
| Any 1 in critical dimension | No offer |

---

*Last updated: Q1 2026 · Owner: Engineering Recruiting · Review cycle: Quarterly*
