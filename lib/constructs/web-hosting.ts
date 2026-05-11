import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as fs from 'fs';

export interface WebHostingProps {
  basename: string;
  /** Lambda Function URL serving POST /chat — proxied through CloudFront. */
  chatFunctionUrl: lambda.IFunctionUrl;
  /** Path to the Vite build output (web/dist). */
  distPath: string;
}

/**
 * Static site hosting for the Vite + React + AI Elements chat UI.
 * Single CloudFront distribution serves the SPA from S3 (default behavior)
 * and proxies /chat* to the Lambda Function URL — so the browser sees a
 * single origin and the AI SDK can `fetch('/chat')` without CORS hassle.
 */
export class WebHosting extends Construct {
  public readonly distributionDomain: string;
  public readonly siteBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: WebHostingProps) {
    super(scope, id);

    if (!fs.existsSync(props.distPath)) {
      throw new Error(
        `Web build not found at ${props.distPath}. Run \`npm run build:web\` before \`cdk deploy\`.`,
      );
    }

    this.siteBucket = new s3.Bucket(this, 'Site', {
      bucketName: `${props.basename}-web-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'Dist', {
      comment: `${props.basename} chat UI`,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/chat*': {
          origin: new origins.FunctionUrlOrigin(props.chatFunctionUrl),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      errorResponses: [
        // SPA fallback — any unknown path returns the React app shell.
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    new s3deploy.BucketDeployment(this, 'Deploy', {
      sources: [s3deploy.Source.asset(props.distPath)],
      destinationBucket: this.siteBucket,
      distribution,
      distributionPaths: ['/*'],
      retainOnDelete: false,
    });

    this.distributionDomain = distribution.distributionDomainName;
  }
}
