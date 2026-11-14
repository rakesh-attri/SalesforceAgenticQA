# Gemini chat and embeddings

The integration uses the Gemini Developer API REST endpoints from TypeScript; it does not require Python, Docker, Vertex credentials or another SDK. `StructuredChat` is provider-neutral, and the existing callable `Embed` and OpenAI-compatible HTTP adapter remain supported. No provider is enabled by the example configuration.

## Chat configuration

In the ignored local `.env`, set:

```dotenv
SFQA_MODEL_PROVIDER=gemini
SFQA_MODEL_NAME=YOUR_APPROVED_STRUCTURED_OUTPUT_MODEL
SFQA_MODEL_API_KEY=YOUR_LOCAL_GEMINI_KEY
SFQA_GEMINI_TIMEOUT_MS=30000
SFQA_GEMINI_RETRIES=2
SFQA_GEMINI_MIN_INTERVAL_MS=0
```

Choose a model that is available to your Google project and supports JSON-schema structured output; no hardcoded model or availability is assumed. Model identifiers accept an optional `models/` prefix and reject path/query injection. `GEMINI_MODEL` aliases the chat model. `GEMINI_API_KEY` or `GOOGLE_API_KEY` may supply a shared key instead of the purpose-specific key. Conflicting nonempty aliases are rejected without printing values. Separate purpose-specific keys are supported when shared aliases are unset. Empty/`none` provider retains deterministic offline behavior. Unsupported providers and missing/invalid model/key/numeric settings fail safely.

The Spec Analyst, Test Planner, Generator and Investigator graph phases call the optional reasoning service at their respective stages. Risk Analyzer, Reviewer, Explorer and Learning roles are available through the same service and CLI. Advice has `status:proposed`, required evidence citations and a Zod schema. Evidence IDs sent to the model are opaque; returned citations must resolve to supplied facts. Workflow proposals must reference an existing workflow/criterion and preserve its original expected text. They cannot replace execution inputs, approve mutations, weaken assertions or mark hypotheses verified. The deterministic generator still renders the reviewed workflow. Model-call failures are listed by role in the report; they do not turn an unexecuted test into a pass.

## Separate embeddings configuration

```dotenv
SFQA_EMBEDDING_PROVIDER=gemini
SFQA_EMBEDDING_MODEL=YOUR_APPROVED_EMBEDDING_MODEL
SFQA_EMBEDDING_KEY=YOUR_LOCAL_EMBEDDING_KEY
SFQA_EMBEDDING_URL=
SFQA_EMBEDDING_DIMENSIONS=
```

Use an embedding model, not a chat model. `GEMINI_EMBEDDING_MODEL` aliases its name, and shared key aliases work as above. Optional dimensions must be an integer from 1 to 3072 and be supported by the chosen model. Returned count, finite vector values and dimensions are checked locally. Requests are chunked into batches of at most 100, preserving order. This adapter uses `SEMANTIC_SIMILARITY` because the preserved `Embed(texts)` interface does not distinguish documents from queries; it does not silently apply a document-only task to query text. Asymmetric retrieval tasks would require an explicit interface extension. Do not mix old vectors from different models/dimensions: use a separate collection/catalog or explicitly re-index reviewed sources before changing embedding models.

To preserve the existing external adapter, set `SFQA_EMBEDDING_PROVIDER=openai-compatible` plus `SFQA_EMBEDDING_URL`, key and model. Existing environments with a URL and no provider still select that adapter. The new example explicitly sets `none`; change that when enabling either provider. Gemini rejects a conflicting legacy URL rather than sending a Google key to it. `rag-index`, `rag-query`, `knowledge-index` and spec planning use the configured embedding factory; Chroma remains separately configured. Gemini connectivity does not establish external Chroma availability.

## Safe connectivity and reasoning checks

```powershell
npm.cmd run model:check
npm.cmd run platform -- ai-reason spec-analyst .state/reviewed-input.json
npm.cmd run platform -- ai-reason test-planner .state/reviewed-input.json
npm.cmd run platform -- ai-reason generator .state/reviewed-input.json
npm.cmd run platform -- ai-reason investigator .state/reviewed-input.json
npm.cmd run discover:live
```

The connectivity command sends only fixed synthetic text and requires an actual schema-valid response for success. It checks chat and embeddings independently, prints fixed success/failure/configuration categories, never prints API keys, model text or vectors, and exits nonzero for any failed/unconfigured component. A successful connectivity check is not a model-quality evaluation or live Salesforce workflow test. A role call writes proposed advice under ignored artifacts; it never executes model-generated actions. The spec graph enables optional chat only when explicitly configured. Offline demos inject no live model provider and remain deterministic.

## Privacy, errors and budgets

Gemini requests are pinned to `https://generativelanguage.googleapis.com/v1beta`, authenticate through `x-goog-api-key` headers and reject redirects. API keys are not query parameters. Inputs and parsed outputs redact known configured secrets, credential-named fields, private-key blocks, JWTs, bearer values, Google-key patterns, email addresses and Salesforce ID-like strings. The existing HTTP embedding path also receives input redaction and bounded diagnostic handling. This is defense in depth, not complete DLP: manually approve source content before sending organizational data externally. Redaction can remove IDs required for reasoning; never reconstruct hidden facts or invent replacements.

Raw provider bodies, HTTP error descriptions, transport causes and Zod issue payloads are not logged. Configuration diagnostics expose only fixed field labels. Structured output is requested using JSON Schema and independently validated with Zod. Blocked, truncated, malformed, schema-invalid or invented-citation responses fail; no plain-text fallback relaxes validation.

Per-instance requests are serialized and optionally paced. HTTP 429 and selected transient 5xx statuses use bounded exponential retry and Retry-After seconds/date handling; nonretryable auth/config failures stop. Retry-After longer than 30 seconds returns a safe rate-limit failure instead of ignoring the server's interval. Per-attempt timeout is 1–60000 ms, retries 0–3, and prompt+system input is limited to 120000 characters. These are per-call limits, not an org-wide quota manager. Abort/transport failures may incur provider billing even if retried; no Salesforce tools are invoked by this adapter.

Request/response contracts follow Google's [generateContent](https://ai.google.dev/api/generate-content), [structured output](https://ai.google.dev/gemini-api/docs/structured-output) and [embedding API](https://ai.google.dev/api/embeddings) documentation.

## Actual integration verification — 2026-11-14

- Offline Gemini chat/embedding/reasoning tests executed, including retries, pacing, timeout, redaction and graph assertion preservation.
- Final checks: typecheck, 64 unit/integration tests, offline demo and all 3 headless browser tests passed. Ten tests specifically exercise the Gemini integration; their HTTP responses are mocked.
- `npm.cmd run model:check` executed using local configuration: chat failed validation at the **model** setting; embeddings were **not configured**. No successful live Gemini chat or embedding response was obtained; no Gemini request was attempted after that configuration failure.
- `npm.cmd run discover:live` executed successfully: JWT authentication and read-only Describe for two configured objects completed. Local metadata remains under ignored `.state`.
- No Salesforce write setting or operation was enabled, and no browser Salesforce workflow, external Chroma service or live model reasoning result is claimed.

Next operator step: set a valid approved chat model (`SFQA_MODEL_NAME`/`GEMINI_MODEL`), configure the separate embedding provider/model if desired, then rerun `model:check`. Do not infer that a configured key is working.
