#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { RagAgentStack } from '../lib/rag-agent-stack';

const app = new cdk.App();

const basename = app.node.tryGetContext('basename') ?? 'rag-assistant';

new RagAgentStack(app, `${basename}-stack`, {
  description: 'RAG assistant on AWS Bedrock — Knowledge Base, Agent, Guardrails, chat UI.',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  basename,
  agentModelId: app.node.tryGetContext('agentModelId'),
  embeddingModelId: app.node.tryGetContext('embeddingModelId'),
  embeddingDimension: Number(app.node.tryGetContext('embeddingDimension')) || 1024,
  retrievalNumResults: Number(app.node.tryGetContext('retrievalNumResults')) || 5,
  agentInstruction: app.node.tryGetContext('agentInstruction'),
  enableGuardrail: app.node.tryGetContext('enableGuardrail') !== false,
  deployWeb: app.node.tryGetContext('deployWeb') !== false,
});

cdk.Tags.of(app).add('project', basename);
cdk.Tags.of(app).add('managed-by', 'cdk');
