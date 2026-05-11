import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { VectorStore } from './constructs/vector-store';
import { KnowledgeBase } from './constructs/knowledge-base';
import { Agent } from './constructs/agent';
import { ChatApi } from './constructs/chat-api';

export interface RagAgentStackProps extends cdk.StackProps {
  basename: string;
  agentModelId: string;
  embeddingModelId: string;
  embeddingDimension: number;
  retrievalNumResults: number;
  agentInstruction: string;
  enableGuardrail: boolean;
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

    // KB role must be allowed by the data-access policy. The policy is created
    // up-front in VectorStore with a placeholder; here we wire it.
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

    new cdk.CfnOutput(this, 'DocumentsBucketName', {
      value: knowledgeBase.documentsBucket.bucketName,
      description: 'S3 bucket. Upload more documents here, then run a sync.',
    });
    new cdk.CfnOutput(this, 'KnowledgeBaseId', {
      value: knowledgeBase.knowledgeBaseId,
    });
    new cdk.CfnOutput(this, 'DataSourceId', {
      value: knowledgeBase.dataSourceId,
    });
    new cdk.CfnOutput(this, 'AgentId', { value: agent.agentId });
    new cdk.CfnOutput(this, 'AgentAliasId', { value: agent.agentAliasId });
    new cdk.CfnOutput(this, 'ChatUrl', {
      value: chatApi.functionUrl,
      description: 'Open in a browser to use the chat UI.',
    });
    new cdk.CfnOutput(this, 'SyncCommand', {
      value: `aws bedrock-agent start-ingestion-job --knowledge-base-id ${knowledgeBase.knowledgeBaseId} --data-source-id ${knowledgeBase.dataSourceId}`,
      description: 'Run after uploading new documents to sync the knowledge base.',
    });
  }
}
