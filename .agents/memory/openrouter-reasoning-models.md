---
name: OpenRouter reasoning models leak chain-of-thought
description: Reasoning-capable models on OpenRouter (e.g. nvidia/nemotron-3-ultra) put their internal reasoning in message.content unless explicitly suppressed.
---

By default, calling a reasoning-capable model through OpenRouter's chat completions endpoint can return the model's full internal chain-of-thought inside `message.content`, instead of just the final answer. This silently breaks any code that expects `content` to be a short, clean final answer (e.g. claim extraction, JSON-only ranking prompts).

**Why:** Observed with `nvidia/nemotron-3-ultra-550b-a55b:free` — a prompt asking for "one short sentence" returned multiple paragraphs of visible reasoning ("The user is asking me to extract... Perhaps I should...").

**How to apply:** Pass `reasoning: { exclude: true }` in the request body when calling reasoning models through OpenRouter and you only want the final answer. Verify with a raw curl/fetch test against the actual model id before trusting a wrapper — don't assume based on model name alone.
