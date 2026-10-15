import { createHash, createHmac, timingSafeEqual } from 'crypto';
import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

type WhatSyncContext = IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions | IWebhookFunctions;

/** Calls the WhatSync API and turns its JSON errors into readable n8n errors. */
export async function whatSyncApiRequest(
	this: WhatSyncContext,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	headers: IDataObject = {},
	itemIndex?: number,
): Promise<IDataObject> {
	const credentials = await this.getCredentials('whatSyncApi');
	const baseUrl = String(credentials.baseUrl || 'https://whatsync.app').replace(/\/+$/, '');
	const response = await this.helpers.httpRequestWithAuthentication.call(this, 'whatSyncApi', {
		method,
		url: `${baseUrl}${path}`,
		headers: { Accept: 'application/json', ...headers },
		...(body === undefined ? {} : { body }),
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	});
	const status = Number(response.statusCode);
	const data = (typeof response.body === 'string' ? safeJson(response.body) : response.body) as IDataObject;
	if (status >= 200 && status < 300) return data ?? {};
	const error = (data?.error ?? {}) as IDataObject;
	const message = readableMessage(String(error.message || `WhatSync returned HTTP ${status}`));
	const retryAfter = error.retry_after ? ` Try again in ${error.retry_after} seconds.` : '';
	throw new NodeApiError(this.getNode(), (data ?? {}) as JsonObject, {
		message,
		description: `${error.code ? `Error code: ${String(error.code)}.` : ''}${retryAfter}${response.headers?.['x-request-id'] ? ` Request ID: ${String(response.headers['x-request-id'])}.` : ''}`.trim(),
		httpCode: String(status),
		...(itemIndex === undefined ? {} : { itemIndex }),
	});
}

/** Runs one WhatSync tool: POST /api/v1/tools/{name}. */
export async function runTool(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	name: string,
	input: IDataObject,
	itemIndex?: number,
): Promise<IDataObject> {
	return whatSyncApiRequest.call(this, 'POST', `/api/v1/tools/${encodeURIComponent(name)}`, input, {}, itemIndex);
}

/** Older WhatSync servers put a failed send's whole result in the message; show its reason instead. */
function readableMessage(message: string): string {
	if (!message.trim().startsWith('{')) return message;
	const parsed = safeJson(message) as IDataObject;
	return typeof parsed.error === 'string' && parsed.error ? parsed.error : message;
}

function safeJson(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return { error: { message: value.slice(0, 500) } };
	}
}

/**
 * A stable key per execution, node and item. A retry inside the same execution
 * reuses it, so WhatSync sends the message once even if the request is repeated.
 */
export function defaultIdempotencyKey(context: IExecuteFunctions, itemIndex: number): string {
	const source = `${context.getExecutionId()}:${context.getNode().id}:${itemIndex}`;
	return `n8n-${createHash('sha256').update(source).digest('hex').slice(0, 40)}`;
}

/** The first array in a WhatSync list response, such as conversations, messages or templates. */
export function listFrom(response: IDataObject): IDataObject[] {
	for (const value of Object.values(response)) {
		if (Array.isArray(value)) return value as IDataObject[];
	}
	return [];
}

/**
 * Checks a Standard Webhooks signature, as WhatSync sends it: HMAC-SHA256 of
 * "id.timestamp.body" with the endpoint secret, in the webhook-signature header.
 */
export function verifyWebhookSignature(
	secret: string,
	headers: Record<string, string | string[] | undefined>,
	rawBody: Buffer | string,
	nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
	const id = String(headers['webhook-id'] ?? '');
	const timestamp = String(headers['webhook-timestamp'] ?? '');
	const signatures = String(headers['webhook-signature'] ?? '');
	if (!id || !/^\d+$/.test(timestamp) || !signatures) return false;
	// Reject old or future-dated requests so a captured event cannot be replayed later.
	if (Math.abs(nowSeconds - Number(timestamp)) > 300) return false;
	const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
	const expected = createHmac('sha256', key)
		.update(`${id}.${timestamp}.`)
		.update(rawBody)
		.digest();
	return signatures.split(' ').some((entry) => {
		const [version, encoded] = entry.split(',');
		const actual = Buffer.from(encoded ?? '', 'base64');
		return version === 'v1' && actual.length === expected.length && timingSafeEqual(actual, expected);
	});
}
