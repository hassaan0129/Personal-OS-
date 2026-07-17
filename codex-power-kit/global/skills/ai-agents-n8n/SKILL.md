---
name: ai-agents-n8n
description: Design AI agents, workflows, and n8n automations; use for tool calling, orchestration, approvals, memory, retries, idempotency, evaluation, and safe deployment.
---

# AI agents and n8n workflow

- Start with the business outcome and deterministic workflow; use an LLM only where judgment or unstructured interpretation is needed.
- Define inputs, outputs, schemas, tools, permissions, state, failure modes, cost limits, and human approval points.
- Treat model and external content as untrusted. Validate structured outputs and tool arguments.
- Make side effects idempotent. Add retries with backoff, deduplication, timeouts, dead-letter handling, and observable execution IDs.
- Store credentials in n8n credentials/environment configuration, never workflow text or source control.
- Use development workflows and test data. Keep publishing, sending, deleting, billing, and production writes behind human approval.
- Create test fixtures and evaluation cases for normal, ambiguous, malicious, and failure inputs.
- Document architecture, integrations, data retention, costs, and recovery steps.
