import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';

export interface ChatApiProps {
  basename: string;
  agentId: string;
  agentAliasId: string;
}

export class ChatApi extends Construct {
  public readonly functionUrl: string;
  public readonly fnUrl: lambda.IFunctionUrl;

  constructor(scope: Construct, id: string, props: ChatApiProps) {
    super(scope, id);

    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;

    const fn = new NodejsFunction(this, 'Fn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '..', '..', 'lambda', 'chat', 'index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        AGENT_ID: props.agentId,
        AGENT_ALIAS_ID: props.agentAliasId,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        target: 'node20',
      },
    });

    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeAgent'],
        resources: [`arn:aws:bedrock:${region}:${account}:agent-alias/${props.agentId}/${props.agentAliasId}`],
      }),
    );

    const url = fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      // RESPONSE_STREAM lets the handler write chunks via
      // awslambda.streamifyResponse instead of buffering a single JSON body.
      // The chat handler streams NDJSON events: {t:"text",v:"..."} per token
      // and one terminal {t:"done",citations,sessionId}.
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.POST],
        allowedHeaders: ['content-type'],
      },
    });

    this.fnUrl = url;
    this.functionUrl = url.url;
  }
}
