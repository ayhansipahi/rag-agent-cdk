import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as path from 'path';

export interface KnowledgeBaseProps {
  basename: string;
  embeddingModelId: string;
  collectionArn: string;
  vectorIndexName: string;
  indexReady: cdk.CustomResource;
}

export class KnowledgeBase extends Construct {
  public readonly documentsBucket: s3.Bucket;
  public readonly knowledgeBaseId: string;
  public readonly knowledgeBaseArn: string;
  public readonly dataSourceId: string;
  public readonly kbRole: iam.Role;

  constructor(scope: Construct, id: string, props: KnowledgeBaseProps) {
    super(scope, id);

    this.documentsBucket = new s3.Bucket(this, 'Documents', {
      bucketName: `${props.basename}-docs-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: true,
    });

    // Seed the bucket with a sample corpus so the KB has something to index
    // on first deploy.
    const seedDeployment = new s3deploy.BucketDeployment(this, 'SeedDocs', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '..', '..', 'docs-sample'))],
      destinationBucket: this.documentsBucket,
      retainOnDelete: false,
    });

    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;

    this.kbRole = new iam.Role(this, 'KbRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com', {
        conditions: {
          StringEquals: { 'aws:SourceAccount': account },
          ArnLike: { 'aws:SourceArn': `arn:aws:bedrock:${region}:${account}:knowledge-base/*` },
        },
      }),
      description: 'Role assumed by Bedrock Knowledge Base for S3 read + embedding model + OpenSearch.',
    });

    this.kbRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${region}::foundation-model/${props.embeddingModelId}`,
        ],
      }),
    );

    this.documentsBucket.grantRead(this.kbRole);

    this.kbRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['aoss:APIAccessAll'],
        resources: [props.collectionArn],
      }),
    );

    const kb = new bedrock.CfnKnowledgeBase(this, 'Kb', {
      name: `${props.basename}-kb`,
      description: 'RAG knowledge base seeded from S3.',
      roleArn: this.kbRole.roleArn,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:${region}::foundation-model/${props.embeddingModelId}`,
        },
      },
      storageConfiguration: {
        type: 'OPENSEARCH_SERVERLESS',
        opensearchServerlessConfiguration: {
          collectionArn: props.collectionArn,
          vectorIndexName: props.vectorIndexName,
          fieldMapping: {
            vectorField: 'bedrock-knowledge-base-default-vector',
            textField: 'AMAZON_BEDROCK_TEXT_CHUNK',
            metadataField: 'AMAZON_BEDROCK_METADATA',
          },
        },
      },
    });
    kb.node.addDependency(props.indexReady);

    const dataSource = new bedrock.CfnDataSource(this, 'S3DataSource', {
      knowledgeBaseId: kb.attrKnowledgeBaseId,
      name: `${props.basename}-s3-source`,
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: this.documentsBucket.bucketArn,
        },
      },
      vectorIngestionConfiguration: {
        chunkingConfiguration: {
          chunkingStrategy: 'FIXED_SIZE',
          fixedSizeChunkingConfiguration: {
            maxTokens: 512,
            overlapPercentage: 20,
          },
        },
      },
    });

    this.knowledgeBaseId = kb.attrKnowledgeBaseId;
    this.knowledgeBaseArn = kb.attrKnowledgeBaseArn;
    this.dataSourceId = dataSource.attrDataSourceId;

    // Auto-trigger the first ingestion job (and re-trigger on every deploy so
    // newly-uploaded docs are picked up without a manual `start-ingestion-job`
    // call). The job itself runs asynchronously — the custom resource returns
    // as soon as the job is queued; Bedrock indexes the docs in the
    // background. `cdk deploy` therefore stays fast and the KB is searchable
    // ~30-60s after deploy completes for the seed corpus.
    const ingestParams = {
      knowledgeBaseId: kb.attrKnowledgeBaseId,
      dataSourceId: dataSource.attrDataSourceId,
    };
    const physicalIdBase = `${cdk.Stack.of(this).stackName}-ingest`;
    const ingestionTrigger = new cr.AwsCustomResource(this, 'IngestionTrigger', {
      onCreate: {
        service: 'BedrockAgent',
        action: 'StartIngestionJob',
        parameters: ingestParams,
        physicalResourceId: cr.PhysicalResourceId.of(`${physicalIdBase}-create`),
      },
      onUpdate: {
        service: 'BedrockAgent',
        action: 'StartIngestionJob',
        parameters: ingestParams,
        // New PhysicalResourceId on every synth → CFN treats it as a real
        // change → triggers re-ingestion every deploy.
        physicalResourceId: cr.PhysicalResourceId.of(`${physicalIdBase}-${Date.now()}`),
      },
      // No onDelete: ingestion jobs are not deletable; nothing to clean up.
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['bedrock:StartIngestionJob'],
          resources: [kb.attrKnowledgeBaseArn],
        }),
      ]),
      installLatestAwsSdk: false,
    });
    ingestionTrigger.node.addDependency(seedDeployment);
    ingestionTrigger.node.addDependency(dataSource);
  }
}
