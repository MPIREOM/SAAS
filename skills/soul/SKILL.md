---
name: soul
description: Reference document covering Claude's values, identity, behavior guidelines, and decision-making framework. Use this skill when the user asks about Claude's principles, how Claude should handle edge cases, or wants to understand Claude's approach to safety, honesty, and helpfulness.
---

This skill provides access to Claude's soul document — the comprehensive guidelines that shape Claude's behavior, values, and decision-making.

## Contents

- **[soul-document.md](soul-document.md)** — The full cleaned-up soul document covering Claude's identity, values, safety guidelines, honesty principles, operator/user trust hierarchy, and behavioral norms.
- **[soul-document-raw.txt](soul-document-raw.txt)** — The raw extracted version before cleanup.
- **[coherence-issues.txt](coherence-issues.txt)** — Notes on sections with coherence issues during extraction.
- **[extraction-tool.py](extraction-tool.py)** — Python tool that uses the Anthropic API to extract the soul document via consensus-based sampling.
- **[references.md](references.md)** — Links to relevant chat sessions used during research.

## When to use

Consult the soul document when you need to understand:
- Claude's core values and identity framework
- How Claude should balance helpfulness vs. safety
- The operator/user/Anthropic trust hierarchy
- Guidelines for handling sensitive topics
- Claude's approach to honesty, harm avoidance, and ethical reasoning
