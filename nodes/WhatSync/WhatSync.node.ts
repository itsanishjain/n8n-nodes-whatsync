import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { defaultIdempotencyKey, listFrom, runTool, whatSyncApiRequest } from './GenericFunctions';
import { nodeProperties } from './WhatSyncDescription';

/** Pages through a WhatSync list tool until the limit or the last page. */
async function paginate(
	context: IExecuteFunctions,
	tool: string,
	input: IDataObject,
	cursorField: 'cursor' | 'after',
	returnAll: boolean,
	limit: number,
	pageSize: number,
	itemIndex: number,
): Promise<IDataObject[]> {
	const results: IDataObject[] = [];
	let cursor: string | undefined;
	// A hard ceiling keeps one node run from walking an entire mailbox by accident.
	const ceiling = returnAll ? 5000 : limit;
	do {
		const page = await runTool.call(
			context,
			tool,
			{ ...input, limit: Math.min(pageSize, ceiling - results.length), ...(cursor ? { [cursorField]: cursor } : {}) },
			itemIndex,
		);
		results.push(...listFrom(page));
		cursor = typeof page.next_cursor === 'string' && page.next_cursor ? page.next_cursor : undefined;
	} while (cursor && results.length < ceiling);
	return results.slice(0, ceiling);
}

/** Drops empty fields and turns n8n date pickers into the UTC timestamps WhatSync expects. */
function clean(values: IDataObject): IDataObject {
	return Object.fromEntries(
		Object.entries(values)
			.filter(([, value]) => value !== '' && value !== undefined && value !== null)
			.map(([key, value]) => (['after', 'before'].includes(key) ? [key, new Date(String(value)).toISOString()] : [key, value])),
	);
}

export class WhatSync implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WhatSync',
		name: 'whatSync',
		icon: { light: 'file:../../icons/whatsync.svg', dark: 'file:../../icons/whatsync.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Send and read WhatsApp messages with WhatSync, on your personal WhatsApp or the official Business API',
		defaults: { name: 'WhatSync' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'whatSyncApi', required: true }],
		properties: nodeProperties,
	};

	methods = {
		loadOptions: {
			async getTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const response = await runTool.call(this, 'list_business_templates', { status: 'APPROVED', limit: 50 });
				const seen = new Set<string>();
				return listFrom(response)
					.filter((template) => {
						const name = String(template.name);
						if (seen.has(name)) return false;
						seen.add(name);
						return true;
					})
					.map((template) => ({ name: String(template.name), value: String(template.name), description: String(template.language ?? '') }));
			},
			async getGroups(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const response = await runTool.call(this, 'list_groups', { limit: 100 });
				return listFrom(response).map((group) => ({ name: String(group.name || group.jid), value: String(group.jid) }));
			},
			async getTools(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const response = await whatSyncApiRequest.call(this, 'GET', '/api/v1/tools');
				return listFrom(response)
					.map((tool) => ({ name: String(tool.title || tool.name), value: String(tool.name), description: String(tool.description ?? '').slice(0, 200) }))
					.sort((a, b) => a.name.localeCompare(b.name));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const options = this.getNodeParameter('options', i, {}) as IDataObject;
				const idempotencyKey = String(options.idempotencyKey || defaultIdempotencyKey(this, i));
				let result: IDataObject | IDataObject[] = {};

				if (resource === 'message' && operation === 'send') {
					const target = this.getNodeParameter('sendTo', i) as string;
					const channel = this.getNodeParameter('channel', i) as string;
					result = await runTool.call(this, 'send_message', clean({
						idempotencyKey,
						channel: channel === 'auto' ? undefined : channel,
						phoneNumber: target === 'phoneNumber' ? (this.getNodeParameter('phoneNumber', i) as string) : undefined,
						conversationId: target === 'conversationId' ? (this.getNodeParameter('conversationId', i) as string) : undefined,
						text: this.getNodeParameter('text', i) as string,
					}), i);
				} else if (resource === 'message' && operation === 'sendTemplate') {
					if (!this.getNodeParameter('recipientOptIn', i)) {
						throw new NodeOperationError(this.getNode(), 'Confirm that the recipient agreed to receive WhatsApp messages from your business', {
							itemIndex: i,
							description: 'WhatsApp requires opt-in for template messages. Turn on "Recipient Agreed to Messages" once you have it.',
						});
					}
					const parameters = (this.getNodeParameter('templateParameters', i, {}) as IDataObject).parameter as IDataObject[] | undefined;
					result = await runTool.call(this, 'send_message', {
						idempotencyKey,
						channel: 'business',
						phoneNumber: this.getNodeParameter('phoneNumber', i) as string,
						templateName: this.getNodeParameter('templateName', i) as string,
						templateLanguage: this.getNodeParameter('templateLanguage', i) as string,
						templateParameters: (parameters ?? []).map((parameter) => String(parameter.value ?? '')),
						recipientOptInConfirmed: true,
					}, i);
				} else if (resource === 'message' && operation === 'sendToGroup') {
					result = await runTool.call(this, 'send_group_message', {
						idempotencyKey,
						jid: this.getNodeParameter('groupId', i) as string,
						text: this.getNodeParameter('text', i) as string,
					}, i);
				} else if (resource === 'message' && operation === 'getStatus') {
					result = await runTool.call(this, 'get_send_status', { intentId: this.getNodeParameter('intentId', i) as string }, i);
				} else if (resource === 'message' && operation === 'search') {
					const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
					result = await paginate(this, 'search_messages', clean({ query: this.getNodeParameter('query', i) as string, ...filters }), 'cursor',
						this.getNodeParameter('returnAll', i) as boolean, this.getNodeParameter('limit', i, 50) as number, 50, i);
				} else if (resource === 'chat' && operation === 'getAll') {
					const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
					result = await paginate(this, 'list_conversations', clean(filters), 'cursor',
						this.getNodeParameter('returnAll', i) as boolean, this.getNodeParameter('limit', i, 50) as number, 50, i);
				} else if (resource === 'chat' && operation === 'getMessages') {
					result = await paginate(this, 'get_conversation', { conversationId: this.getNodeParameter('conversationId', i) as string }, 'cursor',
						this.getNodeParameter('returnAll', i) as boolean, this.getNodeParameter('limit', i, 50) as number, 50, i);
				} else if (resource === 'chat' && operation === 'getUnanswered') {
					const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
					const response = await runTool.call(this, 'list_unanswered_conversations', clean({ ...filters, limit: this.getNodeParameter('limit', i, 50) as number }), i);
					result = listFrom(response);
				} else if (resource === 'group' && operation === 'getAll') {
					result = await paginate(this, 'list_groups', {}, 'after',
						this.getNodeParameter('returnAll', i) as boolean, this.getNodeParameter('limit', i, 50) as number, 100, i);
				} else if (resource === 'template' && operation === 'getAll') {
					const status = this.getNodeParameter('status', i) as string;
					result = await paginate(this, 'list_business_templates', clean({ status: status === 'any' ? undefined : status }), 'after',
						this.getNodeParameter('returnAll', i) as boolean, this.getNodeParameter('limit', i, 50) as number, 50, i);
				} else if (resource === 'account' && operation === 'get') {
					result = await whatSyncApiRequest.call(this, 'GET', '/api/v1/me', undefined, {}, i);
				} else if (resource === 'tool' && operation === 'run') {
					const raw = this.getNodeParameter('input', i) as string | IDataObject;
					let input: IDataObject;
					try {
						input = typeof raw === 'string' ? (JSON.parse(raw || '{}') as IDataObject) : raw;
					} catch {
						throw new NodeOperationError(this.getNode(), 'Input must be valid JSON', { itemIndex: i });
					}
					// Write tools need a stable key; the header is ignored by read tools.
					result = await whatSyncApiRequest.call(this, 'POST', `/api/v1/tools/${encodeURIComponent(this.getNodeParameter('toolName', i) as string)}`,
						input, { 'Idempotency-Key': idempotencyKey }, i);
				} else {
					throw new NodeOperationError(this.getNode(), `Unsupported operation "${operation}" for "${resource}"`, { itemIndex: i });
				}

				const rows = Array.isArray(result) ? result : [result];
				for (const row of rows) returnData.push({ json: row, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				// WhatSync API errors arrive already wrapped with their message and code.
				const failure =
					error instanceof NodeApiError || error instanceof NodeOperationError
						? error
						: new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
				throw failure;
			}
		}

		return [returnData];
	}
}
