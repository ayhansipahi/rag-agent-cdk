# Asking questions

Open the chat URL from the stack outputs in a browser. Type a question, hit send, and the agent will:

1. Run the query through input guardrails.
2. Embed the query with Titan and pull the top-k chunks from OpenSearch Serverless.
3. Pass the chunks and the question to Claude Sonnet through Bedrock Agents.
4. Run the answer through output guardrails before returning it.

Citations are returned alongside the answer when the Bedrock Agent attributes the response to specific retrieved chunks. Each citation includes the source S3 URI and the matched quote, capped at 240 characters in the demo UI.

To extend the knowledge base, upload more files to the documents bucket and run the `aws bedrock-agent start-ingestion-job` command printed in the stack outputs. New ingestion jobs are incremental — they only re-process added or changed objects.
