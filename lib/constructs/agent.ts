import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';

export interface AgentProps {
  basename: string;
  modelId: string;
  instruction: string;
  knowledgeBaseId: string;
  knowledgeBaseArn: string;
  enableGuardrail: boolean;
}

export class Agent extends Construct {
  public readonly agentId: string;
  public readonly agentAliasId: string;
  public readonly guardrailId?: string;

  constructor(scope: Construct, id: string, props: AgentProps) {
    super(scope, id);

    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;

    const agentRole = new iam.Role(this, 'AgentRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com', {
        conditions: {
          StringEquals: { 'aws:SourceAccount': account },
          ArnLike: { 'aws:SourceArn': `arn:aws:bedrock:${region}:${account}:agent/*` },
        },
      }),
      description: 'Role assumed by the Bedrock Agent to call the foundation model and the KB.',
    });

    // Foundation model — agentModelId is typically a cross-region inference
    // profile ID (e.g. "us.anthropic.claude-sonnet-4-5-...") so we grant the
    // profile AND the underlying foundation model in any region the profile
    // can route to. Foundation-model ARNs have no account segment and live in
    // each region the profile spans (us-east-1, us-east-2, us-west-2 for the
    // `us.*` profile family). Without the region wildcard on foundation-model,
    // Bedrock returns AccessDenied for in-region routes other than us-east-1.
    agentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [
          `arn:aws:bedrock:*::foundation-model/*`,
          `arn:aws:bedrock:*:${account}:inference-profile/*`,
        ],
      }),
    );

    agentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:Retrieve', 'bedrock:RetrieveAndGenerate'],
        resources: [props.knowledgeBaseArn],
      }),
    );

    let guardrail: bedrock.CfnGuardrail | undefined;
    if (props.enableGuardrail) {
      guardrail = new bedrock.CfnGuardrail(this, 'Guardrail', {
        name: `${props.basename}-guardrail`,
        description: 'Default guardrail: blocks prompt-attacks, hate, violence, sexual, and insults.',
        blockedInputMessaging: 'I cannot process that request.',
        blockedOutputsMessaging: 'I cannot share that response.',
        contentPolicyConfig: {
          filtersConfig: [
            { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
            { type: 'VIOLENCE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
            { type: 'HATE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
            { type: 'INSULTS', inputStrength: 'MEDIUM', outputStrength: 'MEDIUM' },
            { type: 'MISCONDUCT', inputStrength: 'MEDIUM', outputStrength: 'MEDIUM' },
            { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
          ],
        },
        sensitiveInformationPolicyConfig: {
          piiEntitiesConfig: [
            { type: 'EMAIL', action: 'ANONYMIZE' },
            { type: 'PHONE', action: 'ANONYMIZE' },
            { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
            { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'BLOCK' },
          ],
        },
      });
      this.guardrailId = guardrail.attrGuardrailId;

      agentRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ['bedrock:ApplyGuardrail'],
          resources: [guardrail.attrGuardrailArn],
        }),
      );
    }

    const agent = new bedrock.CfnAgent(this, 'Agent', {
      agentName: `${props.basename}-agent`,
      description: 'RAG assistant grounded on the seeded knowledge base.',
      agentResourceRoleArn: agentRole.roleArn,
      foundationModel: props.modelId,
      instruction: props.instruction,
      idleSessionTtlInSeconds: 600,
      autoPrepare: true,
      knowledgeBases: [
        {
          description:
            'Primary knowledge base. Use it to answer any question the user asks about indexed content.',
          knowledgeBaseId: props.knowledgeBaseId,
          knowledgeBaseState: 'ENABLED',
        },
      ],
      ...(guardrail && {
        guardrailConfiguration: {
          guardrailIdentifier: guardrail.attrGuardrailId,
          guardrailVersion: 'DRAFT',
        },
      }),
    });

    const alias = new bedrock.CfnAgentAlias(this, 'Alias', {
      agentId: agent.attrAgentId,
      agentAliasName: 'live',
      description: 'Live alias for the chat backend.',
    });
    alias.addDependency(agent);

    this.agentId = agent.attrAgentId;
    this.agentAliasId = alias.attrAgentAliasId;
  }
}
