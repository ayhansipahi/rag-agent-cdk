# Architecture cheat-sheet

```
User ──> Lambda (Function URL)
            │
            ├── GET /        →  serves the static chat page
            └── POST /chat   →  Bedrock Agent
                                  │
                                  ├── Guardrail (input)
                                  ├── Knowledge Base
                                  │     └── OpenSearch Serverless (vectors)
                                  │     └── Titan Embed v2
                                  │     └── S3 (raw documents)
                                  ├── Claude Sonnet (foundation model)
                                  └── Guardrail (output)
```

Costs to keep in mind:

- OpenSearch Serverless has a 2-OCU minimum, roughly $345 per month at the default OCU price. This dominates the bill for low-traffic workloads.
- Bedrock model invocations and Titan embeddings are billed per token. Claude Sonnet 4.5 is the default; switch to Haiku via the `agentModelId` context value for a cheaper baseline.
- S3, Lambda, and CloudWatch costs are negligible at the scale of this demo.

Destroy the stack when you stop using it. The auto-delete bucket flag removes S3 contents on `cdk destroy`.
