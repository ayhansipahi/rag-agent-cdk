# About this RAG assistant

This assistant runs entirely on AWS managed services:

- **Amazon Bedrock Agents** orchestrate the conversation and the retrieval.
- **Amazon Bedrock Knowledge Bases** turn this S3 bucket into searchable vectors.
- **Amazon Titan Text Embeddings v2** converts each chunk into a 1024-dimensional vector.
- **Amazon OpenSearch Serverless** stores and searches those vectors.
- **Amazon Bedrock Guardrails** filter prompt-attacks, hate, violence, and PII.
- **Anthropic Claude on Bedrock** writes the final answer, grounded on the retrieved chunks.

You can replace these files with your own corpus — drop PDFs, plaintext, Markdown, or HTML into the documents bucket and run the sync command printed in the stack outputs.

The default chunking strategy is fixed-size 512 tokens with 20% overlap. For dense reference material this works well; for narrative documents you may want larger chunks or a semantic chunker.
