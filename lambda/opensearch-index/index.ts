/**
 * Custom Resource handler — creates / deletes the vector index inside an
 * OpenSearch Serverless collection. Bedrock Knowledge Base needs the index to
 * exist before it can be created, and CfnCollection alone does not create it.
 *
 * Uses SigV4 to sign HTTPS requests against the collection's data-plane
 * endpoint. Service name for OSS data-plane is "aoss".
 */

import { SignatureV4 } from '@aws-sdk/signature-v4';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { HttpRequest } from '@aws-sdk/protocol-http';
import { Sha256 } from '@aws-crypto/sha256-js';
import { request as httpsRequest } from 'https';
import type { CloudFormationCustomResourceEvent } from 'aws-lambda';

interface ResourceProps {
  Endpoint: string;
  IndexName: string;
  Dimension: string;
  Region: string;
}

const send = async (req: HttpRequest): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    const r = httpsRequest(
      {
        host: req.hostname,
        path: req.path,
        method: req.method,
        headers: req.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    r.on('error', reject);
    if (req.body) r.write(req.body);
    r.end();
  });

const signedFetch = async (
  region: string,
  method: 'GET' | 'PUT' | 'DELETE',
  endpoint: string,
  path: string,
  body?: object,
) => {
  const url = new URL(endpoint.startsWith('http') ? endpoint : `https://${endpoint}`);
  const payload = body ? JSON.stringify(body) : undefined;

  const req = new HttpRequest({
    method,
    protocol: 'https:',
    hostname: url.hostname,
    path,
    headers: {
      host: url.hostname,
      'content-type': 'application/json',
    },
    body: payload,
  });

  const signer = new SignatureV4({
    credentials: defaultProvider(),
    region,
    service: 'aoss',
    sha256: Sha256,
  });

  const signed = (await signer.sign(req)) as HttpRequest;
  return send(signed);
};

const waitForCollection = async (region: string, endpoint: string) => {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await signedFetch(region, 'GET', endpoint, '/');
      if (res.status < 500) return;
    } catch {
      // collection not yet reachable
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error('Timed out waiting for OpenSearch Serverless collection to become reachable.');
};

export const handler = async (event: CloudFormationCustomResourceEvent) => {
  const props = event.ResourceProperties as unknown as ResourceProps;
  const { Endpoint, IndexName, Dimension, Region } = props;

  if (event.RequestType === 'Delete') {
    try {
      await signedFetch(Region, 'DELETE', Endpoint, `/${IndexName}`);
    } catch (err) {
      console.warn('Index delete failed (ignored):', err);
    }
    return { PhysicalResourceId: IndexName };
  }

  await waitForCollection(Region, Endpoint);

  const indexBody = {
    settings: { index: { knn: true } },
    mappings: {
      properties: {
        'bedrock-knowledge-base-default-vector': {
          type: 'knn_vector',
          dimension: Number(Dimension),
          method: {
            engine: 'faiss',
            name: 'hnsw',
            space_type: 'l2',
          },
        },
        AMAZON_BEDROCK_TEXT_CHUNK: { type: 'text' },
        AMAZON_BEDROCK_METADATA: { type: 'text', index: false },
      },
    },
  };

  // Idempotent create. If the index already exists we treat it as success.
  const res = await signedFetch(Region, 'PUT', Endpoint, `/${IndexName}`, indexBody);
  if (res.status >= 400 && !res.body.includes('resource_already_exists_exception')) {
    throw new Error(`OpenSearch index create failed: ${res.status} ${res.body}`);
  }

  // Newly-created indices need a moment before Bedrock can discover them.
  await new Promise((r) => setTimeout(r, 30_000));

  return { PhysicalResourceId: IndexName, Data: { IndexName } };
};
