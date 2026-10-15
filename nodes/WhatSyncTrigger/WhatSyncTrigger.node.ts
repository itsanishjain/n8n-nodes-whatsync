import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { listFrom, verifyWebhookSignature, whatSyncApiRequest } from '../WhatSync/GenericFunctions';

type StaticData = { webhookId?: string; webhookSecret?: string; webhookUrl?: string; recentEventIds?: string[] };

export class WhatSyncTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WhatSync Trigger',
		name: 'whatSyncTrigger',
		icon: { light: 'file:../../icons/whatsync.svg', dark: 'file:../../icons/whatsync.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when a WhatsApp message arrives or a number connects or disconnects in WhatSync',
		defaults: { name: 'WhatSync Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'whatSyncApi', required: true }],
		webhooks: [{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' }],
		properties: [
			{
				displayName: 'n8n must be reachable from the internet over HTTPS for WhatSync to send events. Only chats WhatSync saves produce message events; choose them in the WhatSync dashboard under What\'s saved.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				options: [
					{ name: 'Message Received', value: 'message.received', description: 'Someone sent you a message' },
					{ name: 'Message Sent', value: 'message.sent', description: 'A message you sent was saved' },
					{ name: 'Message Status Changed', value: 'message.status', description: 'A Business API message was delivered, read or failed' },
					{ name: 'Number Connected', value: 'connection.connected', description: 'A WhatsApp number connected' },
					{ name: 'Number Needs Reconnecting', value: 'connection.disconnected', description: 'A WhatsApp number disconnected and needs attention' },
				],
				default: ['message.received'],
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				description: 'Applies to message events only',
				options: [
					{
						displayName: 'Channel',
						name: 'channel',
						type: 'options',
						options: [
							{ name: 'Any', value: 'any' },
							{ name: 'Personal WhatsApp', value: 'qr' },
							{ name: 'WhatsApp Business API', value: 'business' },
						],
						default: 'any',
					},
					{
						displayName: 'Chat Type',
						name: 'chatType',
						type: 'options',
						options: [
							{ name: 'Any', value: 'any' },
							{ name: 'Direct Chats Only', value: 'direct' },
							{ name: 'Groups Only', value: 'group' },
						],
						default: 'any',
					},
					{
						displayName: 'Group ID',
						name: 'groupId',
						type: 'string',
						default: '',
						placeholder: '120363012345678901@g.us',
						description: 'Only messages from this group',
					},
				],
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node') as StaticData;
				const url = this.getNodeWebhookUrl('default');
				const endpoints = listFrom(await whatSyncApiRequest.call(this, 'GET', '/api/v1/webhooks'));
				const ours = endpoints.find((endpoint) => endpoint.id === data.webhookId && endpoint.url === url);
				if (ours && data.webhookSecret && ours.status === 'active') return true;
				// Without the saved signing secret we cannot check events, so replace any
				// endpoint already pointing at this URL with a fresh one.
				for (const endpoint of endpoints.filter((endpoint) => endpoint.url === url)) {
					await whatSyncApiRequest.call(this, 'DELETE', `/api/v1/webhooks/${encodeURIComponent(String(endpoint.id))}`);
				}
				delete data.webhookId;
				delete data.webhookSecret;
				return false;
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const url = this.getNodeWebhookUrl('default');
				if (!url) throw new NodeOperationError(this.getNode(), 'n8n did not provide a webhook URL');
				if (!url.startsWith('https://')) {
					throw new NodeOperationError(this.getNode(), 'WhatSync can only send events to an HTTPS address', {
						description: `This n8n's webhook URL is ${url}. Set WEBHOOK_URL in n8n to a public HTTPS address, for example with a tunnel, then try again.`,
					});
				}
				const events = this.getNodeParameter('events') as string[];
				const response = await whatSyncApiRequest.call(this, 'POST', '/api/v1/webhooks', {
					url,
					event_types: events,
					description: `n8n: ${this.getWorkflow().name ?? 'workflow'}`.slice(0, 500),
				});
				if (!response.id || !response.secret) return false;
				const data = this.getWorkflowStaticData('node') as StaticData;
				data.webhookId = String(response.id);
				data.webhookSecret = String(response.secret);
				data.webhookUrl = url;
				data.recentEventIds = [];
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node') as StaticData;
				if (data.webhookId) {
					try {
						await whatSyncApiRequest.call(this, 'DELETE', `/api/v1/webhooks/${encodeURIComponent(data.webhookId)}`);
					} catch (error) {
						// Already removed in the WhatSync dashboard: nothing left to clean up.
						if ((error as { httpCode?: string }).httpCode !== '404') {
							throw new NodeApiError(this.getNode(), error as JsonObject);
						}
					}
				}
				delete data.webhookId;
				delete data.webhookSecret;
				delete data.webhookUrl;
				delete data.recentEventIds;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const data = this.getWorkflowStaticData('node') as StaticData;
		const request = this.getRequestObject();
		const response = this.getResponseObject();
		if (!request.rawBody && typeof request.readRawBody === 'function') await request.readRawBody();
		const rawBody = request.rawBody ?? JSON.stringify(this.getBodyData());

		if (!data.webhookSecret || !verifyWebhookSignature(data.webhookSecret, this.getHeaderData(), rawBody)) {
			response.status(401).json({ error: 'invalid_signature' });
			return { noWebhookResponse: true };
		}

		const event = this.getBodyData() as IDataObject;
		const events = this.getNodeParameter('events') as string[];
		const eventId = String(event.id ?? '');
		// WhatSync delivers at least once, so the same event can arrive twice.
		const recent = data.recentEventIds ?? [];
		if (!events.includes(String(event.type)) || (eventId && recent.includes(eventId))) return { webhookResponse: { received: true } };
		if (!matchesFilters(event, this.getNodeParameter('filters', {}) as IDataObject)) return { webhookResponse: { received: true } };
		if (eventId) data.recentEventIds = [...recent, eventId].slice(-200);

		return { workflowData: [this.helpers.returnJsonArray(event)] };
	}
}

function matchesFilters(event: IDataObject, filters: IDataObject): boolean {
	const message = ((event.data as IDataObject | undefined)?.message ?? null) as IDataObject | null;
	if (!message) return true;
	if (filters.channel && filters.channel !== 'any' && message.channel !== filters.channel) return false;
	if (filters.chatType && filters.chatType !== 'any' && message.chat_type !== filters.chatType) return false;
	const group = message.group as IDataObject | null | undefined;
	if (filters.groupId && group?.id !== filters.groupId) return false;
	return true;
}
