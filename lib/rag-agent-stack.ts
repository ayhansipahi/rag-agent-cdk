import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';
import * as fs from 'fs';
import { VectorStore } from './constructs/vector-store';
import { KnowledgeBase } from './constructs/knowledge-base';
import { Agent } from './constructs/agent';
import { ChatApi } from './constructs/chat-api';
import { WebHosting } from './constructs/web-hosting';

export interface RagAgentStackProps extends cdk.StackProps {
  basename: string;
  agentModelId: string;
  embeddingModelId: string;
  embeddingDimension: number;
  retrievalNumResults: number;
  agentInstruction: string;
  enableGuardrail: boolean;
  /** When false, skip the CloudFront/S3 hosting (useful before `web/dist` exists). */
  deployWeb: boolean;
}

export class RagAgentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RagAgentStackProps) {
    super(scope, id, props);

    const vectorStore = new VectorStore(this, 'VectorStore', {
      basename: props.basename,
      embeddingDimension: props.embeddingDimension,
    });

    const knowledgeBase = new KnowledgeBase(this, 'KnowledgeBase', {
      basename: props.basename,
      embeddingModelId: props.embeddingModelId,
      collectionArn: vectorStore.collectionArn,
      vectorIndexName: vectorStore.indexName,
      indexReady: vectorStore.indexResource,
    });

    vectorStore.grantDataAccess(knowledgeBase.kbRole);

    const agent = new Agent(this, 'Agent', {
      basename: props.basename,
      modelId: props.agentModelId,
      instruction: props.agentInstruction,
      knowledgeBaseId: knowledgeBase.knowledgeBaseId,
      knowledgeBaseArn: knowledgeBase.knowledgeBaseArn,
      enableGuardrail: props.enableGuardrail,
    });

    const chatApi = new ChatApi(this, 'ChatApi', {
      basename: props.basename,
      agentId: agent.agentId,
      agentAliasId: agent.agentAliasId,
    });

    const distPath = path.join(__dirname, '..', 'web', 'dist');
    let webDomain: string | undefined;
    if (props.deployWeb && fs.existsSync(distPath)) {
      const hosting = new WebHosting(this, 'WebHosting', {
        basename: props.basename,
        chatFunctionUrl: chatApi.fnUrl,
        distPath,
      });
      webDomain = hosting.distributionDomain;
    }

    new cdk.CfnOutput(this, 'DocumentsBucketName', {
      value: knowledgeBase.documentsBucket.bucketName,
      description: 'S3 bucket. Upload more documents here, then run a sync.',
    });
    new cdk.CfnOutput(this, 'KnowledgeBaseId', { value: knowledgeBase.knowledgeBaseId });
    new cdk.CfnOutput(this, 'DataSourceId', { value: knowledgeBase.dataSourceId });
    new cdk.CfnOutput(this, 'AgentId', { value: agent.agentId });
    new cdk.CfnOutput(this, 'AgentAliasId', { value: agent.agentAliasId });
    new cdk.CfnOutput(this, 'ChatApiUrl', {
      value: chatApi.functionUrl,
      description: 'Lambda Function URL for the chat API. Use for local development.',
    });
    if (webDomain) {
      new cdk.CfnOutput(this, 'WebUrl', {
        value: `https://${webDomain}`,
        description: 'Open in a browser to use the chat UI.',
      });
    }
    new cdk.CfnOutput(this, 'SyncCommand', {
      value: `aws bedrock-agent start-ingestion-job --knowledge-base-id ${knowledgeBase.knowledgeBaseId} --data-source-id ${knowledgeBase.dataSourceId}`,
      description: 'Run after uploading new documents to sync the knowledge base.',
    });
  }
}
