import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as aoss from 'aws-cdk-lib/aws-opensearchserverless';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as logs from 'aws-cdk-lib/aws-logs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';

export interface VectorStoreProps {
  basename: string;
  embeddingDimension: number;
}

/**
 * OpenSearch Serverless collection (VECTORSEARCH type) plus the three policies
 * required to make it usable, plus a custom resource that creates the vector
 * index. Bedrock Knowledge Base requires the index to exist before the KB is
 * created — CfnCollection does not create indices.
 */
export class VectorStore extends Construct {
  public readonly collectionArn: string;
  public readonly collectionEndpoint: string;
  public readonly indexName: string;
  public readonly indexResource: cdk.CustomResource;
  private readonly accessPolicy: aoss.CfnAccessPolicy;
  private readonly collectionName: string;

  constructor(scope: Construct, id: string, props: VectorStoreProps) {
    super(scope, id);

    this.collectionName = `${props.basename}-${cdk.Names.uniqueResourceName(this, { maxLength: 12 }).toLowerCase().replace(/[^a-z0-9-]/g, '')}`.slice(0, 32);
    this.indexName = `${props.basename}-index`.replace(/[^a-z0-9-]/g, '').slice(0, 32);

    const encryptionPolicy = new aoss.CfnSecurityPolicy(this, 'EncryptionPolicy', {
      name: `${this.collectionName}-enc`.slice(0, 32),
      type: 'encryption',
      policy: JSON.stringify({
        Rules: [{ Resource: [`collection/${this.collectionName}`], ResourceType: 'collection' }],
        AWSOwnedKey: true,
      }),
    });

    const networkPolicy = new aoss.CfnSecurityPolicy(this, 'NetworkPolicy', {
      name: `${this.collectionName}-net`.slice(0, 32),
      type: 'network',
      policy: JSON.stringify([
        {
          Rules: [
            { Resource: [`collection/${this.collectionName}`], ResourceType: 'collection' },
            { Resource: [`collection/${this.collectionName}`], ResourceType: 'dashboard' },
          ],
          AllowFromPublic: true,
        },
      ]),
    });

    const collection = new aoss.CfnCollection(this, 'Collection', {
      name: this.collectionName,
      type: 'VECTORSEARCH',
      description: 'Vector store for the Bedrock Knowledge Base.',
    });
    collection.addDependency(encryptionPolicy);
    collection.addDependency(networkPolicy);

    this.collectionArn = collection.attrArn;
    this.collectionEndpoint = collection.attrCollectionEndpoint;

    // Lambda that creates the vector index inside the collection.
    const indexFn = new NodejsFunction(this, 'IndexFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '..', '..', 'lambda', 'opensearch-index', 'index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        target: 'node20',
      },
    });

    indexFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['aoss:APIAccessAll'],
        resources: [collection.attrArn],
      }),
    );

    // Data-access policy: grants the index Lambda full data permissions on the
    // collection so it can create indices. KB role principals are appended via
    // grantDataAccess() before synth.
    this.accessPolicy = new aoss.CfnAccessPolicy(this, 'AccessPolicy', {
      name: `${this.collectionName}-data`.slice(0, 32),
      type: 'data',
      policy: cdk.Lazy.string({
        produce: () =>
          JSON.stringify([
            {
              Rules: [
                {
                  Resource: [`collection/${this.collectionName}`],
                  Permission: [
                    'aoss:CreateCollectionItems',
                    'aoss:DeleteCollectionItems',
                    'aoss:UpdateCollectionItems',
                    'aoss:DescribeCollectionItems',
                  ],
                  ResourceType: 'collection',
                },
                {
                  Resource: [`index/${this.collectionName}/*`],
                  Permission: [
                    'aoss:CreateIndex',
                    'aoss:DeleteIndex',
                    'aoss:UpdateIndex',
                    'aoss:DescribeIndex',
                    'aoss:ReadDocument',
                    'aoss:WriteDocument',
                  ],
                  ResourceType: 'index',
                },
              ],
              Principal: this.accessPrincipals,
              Description: 'Vector store data access',
            },
          ]),
      }),
    });
    this.accessPolicy.addDependency(collection);
    this.accessPrincipals.push(indexFn.role!.roleArn);

    const provider = new cr.Provider(this, 'IndexProvider', {
      onEventHandler: indexFn,
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    this.indexResource = new cdk.CustomResource(this, 'Index', {
      serviceToken: provider.serviceToken,
      properties: {
        Endpoint: collection.attrCollectionEndpoint,
        IndexName: this.indexName,
        Dimension: props.embeddingDimension,
        Region: cdk.Stack.of(this).region,
      },
    });
    this.indexResource.node.addDependency(this.accessPolicy);
    this.indexResource.node.addDependency(collection);
  }

  private readonly accessPrincipals: string[] = [];

  /**
   * Append a principal ARN to the data-access policy so it can read/write the
   * vector index. Used by the KB construct to authorize the KB service role.
   */
  public grantDataAccess(role: iam.IRole): void {
    this.accessPrincipals.push(role.roleArn);
  }
}
