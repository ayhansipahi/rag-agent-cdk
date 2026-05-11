# rag-agent-cdk

A self-contained RAG assistant on AWS, provisioned end-to-end with the AWS CDK in TypeScript.

The stack mirrors the DigitalOcean [`rag-assistant`](https://github.com/digitalocean/marketplace-blueprints/tree/master/blueprints/rag-assistant) blueprint, but rebuilt on AWS-native managed services.

## What this gets you

- **Amazon Bedrock Knowledge Base** — vector search over an S3 corpus
- **Amazon OpenSearch Serverless** — vector store (VECTORSEARCH collection)
- **Amazon Titan Text Embeddings v2** — 1024-dim embedding model
- **Amazon Bedrock Agent** — orchestrator wired to the KB
- **Amazon Bedrock Guardrails** — input/output content filters and PII handling
- **Anthropic Claude on Bedrock** — foundation model (Sonnet 4.5 by default, configurable)
- **AWS Lambda + Function URL** — backend that calls `InvokeAgent` and serves a tiny chat page
- A seed corpus and a one-page chat UI so you can talk to the agent the moment the stack finishes deploying

## Architecture

```
User ──> Lambda Function URL
            │
            ├── GET /         →  static chat page
            └── POST /chat    →  Bedrock Agent (InvokeAgent)
                                  │
                                  ├── Guardrail (input)
                                  ├── Knowledge Base
                                  │     ├── OpenSearch Serverless (vector index)
                                  │     ├── Titan Embed v2
                                  │     └── S3 (documents bucket)
                                  ├── Claude Sonnet 4.5
                                  └── Guardrail (output)
```

## Prerequisites

- An AWS account with Bedrock enabled in your region.
- Model access granted for **Claude Sonnet 4.5** and **Titan Text Embeddings v2** in the Bedrock console.
- Node.js 20 or newer and the AWS CLI configured.
- A bootstrapped CDK environment (`npx cdk bootstrap`).

## Deploy

```bash
npm install
npm run bootstrap         # once per account/region
npm run deploy
```

The deploy creates four logical groups behind one stack:

1. OpenSearch Serverless collection + security/network/access policies + vector index
2. S3 documents bucket + Bedrock Knowledge Base + S3 data source + sample corpus
3. Bedrock Agent + alias + Guardrail (KB attached at create-time)
4. Lambda Function URL + IAM permissions to call `bedrock:InvokeAgent`

The seed documents are uploaded by `BucketDeployment`; the first ingestion job is started automatically by the Bedrock Agent when the alias is prepared. If you upload new files later, run the `start-ingestion-job` command printed in the stack outputs.

## Open the chat

After `cdk deploy` prints the outputs, open `ChatUrl` in a browser and ask a question.

## Configure

CDK context values (set via `cdk.json` or `cdk deploy -c key=value`):

| Key | Default | Description |
|---|---|---|
| `basename` | `rag-assistant` | Prefix for every resource name |
| `agentModelId` | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | Foundation model or cross-region inference profile |
| `embeddingModelId` | `amazon.titan-embed-text-v2:0` | Embedding model |
| `embeddingDimension` | `1024` | Vector dimension. Must match the embedding model. |
| `retrievalNumResults` | `5` | Top-k chunks per query |
| `agentInstruction` | (see `cdk.json`) | System prompt for the agent |
| `enableGuardrail` | `true` | Set to `false` to deploy without a Guardrail |

To deploy in a different region: `CDK_DEFAULT_REGION=us-west-2 npm run deploy`.

## Costs

The dominant cost is **OpenSearch Serverless** — it has a 2-OCU minimum and bills hourly, roughly **\$345/month** at the default OCU price even when idle. Everything else is per-request:

- Bedrock model invocations (per token, varies by model)
- Titan embedding calls (per token, only at ingestion and query time)
- Lambda + S3 + CloudWatch (negligible at demo scale)

Destroy with `npm run destroy` when you are done. The documents bucket is configured with `autoDeleteObjects` so the destroy is clean.

## Project layout

```
.
├── bin/rag-agent.ts              # CDK app entry
├── lib/
│   ├── rag-agent-stack.ts        # Composite root stack
│   └── constructs/
│       ├── vector-store.ts       # OpenSearch Serverless + policies + index
│       ├── knowledge-base.ts     # S3 + Bedrock KB + data source
│       ├── agent.ts              # Bedrock Agent + alias + Guardrail
│       └── chat-api.ts           # Lambda + Function URL
├── lambda/
│   ├── chat/                     # InvokeAgent handler + static UI server
│   └── opensearch-index/         # Custom resource: create vector index
├── docs-sample/                  # Seed corpus
├── web/index.html                # Chat page
├── cdk.json                      # Defaults + context
├── package.json
├── tsconfig.json
└── LICENSE
```

## Mapping vs. the DigitalOcean blueprint

| DigitalOcean blueprint | AWS equivalent in this repo |
|---|---|
| GenAI Platform Agent (Nemotron) | Bedrock Agent + Claude Sonnet 4.5 |
| Knowledge Base (Qwen3 0.6B embed) | Bedrock Knowledge Base + Titan Embed v2 |
| KBaaS managed vector store | OpenSearch Serverless (VECTORSEARCH) |
| Guardrails (jailbreak / content / PII) | Bedrock Guardrails (content + PII policy) |
| App Platform FastAPI chat UI | Lambda Function URL serving HTML + `/chat` |
| `tor1`-only GenAI region | Any Bedrock-enabled region |
| Terraform | AWS CDK (TypeScript) |

## License

[MIT](./LICENSE)
