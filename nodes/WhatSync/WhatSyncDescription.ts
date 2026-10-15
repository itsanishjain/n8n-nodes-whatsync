import type { INodeProperties } from 'n8n-workflow';

const show = (resource: string, operation: string[]) => ({ show: { resource: [resource], operation } });

const returnAllAndLimit = (resource: string, operation: string, max: number): INodeProperties[] => [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		displayOptions: show(resource, [operation]),
		default: false,
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		displayOptions: { show: { resource: [resource], operation: [operation], returnAll: [false] } },
		typeOptions: { minValue: 1, maxValue: max },
		default: 50,
		description: 'Max number of results to return',
	},
];

const idempotencyOption = (resource: string, operation: string[]): INodeProperties => ({
	displayName: 'Options',
	name: 'options',
	type: 'collection',
	placeholder: 'Add Option',
	displayOptions: show(resource, operation),
	default: {},
	options: [
		{
			displayName: 'Idempotency Key',
			name: 'idempotencyKey',
			type: 'string',
			default: '',
			description:
				'Same key, same action: WhatSync performs it only once. Map the trigger event ID here to avoid double sends when an event is delivered twice. Leave empty to use one key per execution and item.',
		},
	],
});

export const nodeProperties: INodeProperties[] = [
	{
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Account', value: 'account' },
			{ name: 'Chat', value: 'chat' },
			{ name: 'Group', value: 'group' },
			{ name: 'Message', value: 'message' },
			{ name: 'Template', value: 'template' },
			{ name: 'Tool', value: 'tool' },
		],
		default: 'message',
	},

	// Operations
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['message'] } },
		options: [
			{ name: 'Get Send Status', value: 'getStatus', description: 'Check whether a sent message was accepted and delivered', action: 'Get send status' },
			{ name: 'Search', value: 'search', description: 'Search saved messages by text, file name or contact', action: 'Search messages' },
			{ name: 'Send Template', value: 'sendTemplate', description: 'Send an approved template from a WhatsApp Business API number', action: 'Send a template message' },
			{ name: 'Send Text', value: 'send', description: 'Send a text message to a person', action: 'Send a text message' },
			{ name: 'Send to Group', value: 'sendToGroup', description: 'Send a text message to a group on your personal WhatsApp', action: 'Send a message to a group' },
		],
		default: 'send',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['chat'] } },
		options: [
			{ name: 'Get Many', value: 'getAll', description: 'List recent chats', action: 'Get many chats' },
			{ name: 'Get Messages', value: 'getMessages', description: 'Read the messages in one chat', action: 'Get messages in a chat' },
			{ name: 'Get Unanswered', value: 'getUnanswered', description: 'List chats where the last message is from the other person', action: 'Get unanswered chats' },
		],
		default: 'getAll',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['group'] } },
		options: [{ name: 'Get Many', value: 'getAll', description: 'List the groups your personal WhatsApp is in', action: 'Get many groups' }],
		default: 'getAll',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['template'] } },
		options: [{ name: 'Get Many', value: 'getAll', description: 'List message templates on your WhatsApp Business account', action: 'Get many templates' }],
		default: 'getAll',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['account'] } },
		options: [{ name: 'Get', value: 'get', description: 'Show the connected numbers and what this API key may do', action: 'Get account' }],
		default: 'get',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['tool'] } },
		options: [{ name: 'Run', value: 'run', description: 'Run any WhatSync tool by name with a JSON input', action: 'Run a tool' }],
		default: 'run',
	},

	// Message: Send Text
	{
		displayName: 'Channel',
		name: 'channel',
		type: 'options',
		displayOptions: show('message', ['send']),
		options: [
			{ name: 'Automatic', value: 'auto', description: 'Use the only connected number, or the number the chat is on' },
			{ name: 'Personal WhatsApp', value: 'qr', description: 'Your linked personal WhatsApp. Limited to 50 API messages a day.' },
			{ name: 'WhatsApp Business API', value: 'business', description: 'Your official Business number. Free text only within 24 hours of their last message.' },
		],
		default: 'auto',
	},
	{
		displayName: 'Send To',
		name: 'sendTo',
		type: 'options',
		displayOptions: show('message', ['send']),
		options: [
			{ name: 'Phone Number', value: 'phoneNumber' },
			{ name: 'Existing Chat', value: 'conversationId', description: 'Reply in a chat, using its conversation_id from the trigger or another operation' },
		],
		default: 'phoneNumber',
	},
	{
		displayName: 'Phone Number',
		name: 'phoneNumber',
		type: 'string',
		required: true,
		displayOptions: { show: { resource: ['message'], operation: ['send'], sendTo: ['phoneNumber'] } },
		default: '',
		placeholder: '15550000001',
		description: 'Full number with country code, digits only',
	},
	{
		displayName: 'Conversation ID',
		name: 'conversationId',
		type: 'string',
		required: true,
		displayOptions: { show: { resource: ['message'], operation: ['send'], sendTo: ['conversationId'] } },
		default: '',
		description: 'The conversation_id of the chat, for example from the WhatSync Trigger',
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		required: true,
		typeOptions: { rows: 4 },
		displayOptions: show('message', ['send', 'sendToGroup']),
		default: '',
	},

	// Message: Send Template
	{
		displayName: 'Phone Number',
		name: 'phoneNumber',
		type: 'string',
		required: true,
		displayOptions: show('message', ['sendTemplate']),
		default: '',
		placeholder: '15550000001',
		description: 'Full number with country code, digits only',
	},
	{
		displayName: 'Template Name or ID',
		name: 'templateName',
		type: 'options',
		required: true,
		typeOptions: { loadOptionsMethod: 'getTemplates' },
		displayOptions: show('message', ['sendTemplate']),
		default: '',
		description: 'An approved template on your WhatsApp Business account. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Template Language',
		name: 'templateLanguage',
		type: 'string',
		required: true,
		displayOptions: show('message', ['sendTemplate']),
		default: 'en_US',
		description: 'The language code the template was approved in, such as en_US or pt_BR',
	},
	{
		displayName: 'Template Variables',
		name: 'templateParameters',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true, sortable: true },
		displayOptions: show('message', ['sendTemplate']),
		placeholder: 'Add Variable',
		default: {},
		description: 'Values for {{1}}, {{2}} and so on in the template body, in order',
		options: [
			{
				displayName: 'Variable',
				name: 'parameter',
				values: [{ displayName: 'Value', name: 'value', type: 'string', default: '' }],
			},
		],
	},
	{
		displayName: 'Recipient Agreed to Messages',
		name: 'recipientOptIn',
		type: 'boolean',
		displayOptions: show('message', ['sendTemplate']),
		default: false,
		description: 'Whether this person agreed to receive WhatsApp messages from your business. WhatsApp requires it for templates.',
	},

	// Message: Send to Group
	{
		displayName: 'Group Name or ID',
		name: 'groupId',
		type: 'options',
		required: true,
		typeOptions: { loadOptionsMethod: 'getGroups' },
		displayOptions: show('message', ['sendToGroup']),
		default: '',
		description:
			'A group your personal WhatsApp is in. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},

	// Message: Get Send Status
	{
		displayName: 'Intent ID',
		name: 'intentId',
		type: 'string',
		required: true,
		displayOptions: show('message', ['getStatus']),
		default: '',
		description: 'The intent_id returned when the message was sent',
	},

	// Message: Search
	{
		displayName: 'Search Text',
		name: 'query',
		type: 'string',
		required: true,
		displayOptions: show('message', ['search']),
		default: '',
	},
	...returnAllAndLimit('message', 'search', 50),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		displayOptions: show('message', ['search']),
		default: {},
		options: [
			{ displayName: 'After', name: 'after', type: 'dateTime', default: '', description: 'Only messages after this time' },
			{ displayName: 'Before', name: 'before', type: 'dateTime', default: '', description: 'Only messages before this time' },
			{ displayName: 'Conversation ID', name: 'conversationId', type: 'string', default: '', description: 'Only search one chat' },
			{
				displayName: 'Direction',
				name: 'direction',
				type: 'options',
				options: [
					{ name: 'Received', value: 'inbound' },
					{ name: 'Sent', value: 'outbound' },
				],
				default: 'inbound',
			},
		],
	},

	// Chat
	...returnAllAndLimit('chat', 'getAll', 50),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		displayOptions: show('chat', ['getAll']),
		default: {},
		options: [
			{ displayName: 'After', name: 'after', type: 'dateTime', default: '', description: 'Only chats active after this time' },
			{ displayName: 'Before', name: 'before', type: 'dateTime', default: '', description: 'Only chats active before this time' },
			{ displayName: 'Name or Number', name: 'query', type: 'string', default: '', description: 'Only chats whose contact name or number matches' },
		],
	},
	{
		displayName: 'Conversation ID',
		name: 'conversationId',
		type: 'string',
		required: true,
		displayOptions: show('chat', ['getMessages']),
		default: '',
		description: 'The conversation_id of the chat, from Get Many chats or the WhatSync Trigger',
	},
	...returnAllAndLimit('chat', 'getMessages', 50),
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		displayOptions: show('chat', ['getUnanswered']),
		typeOptions: { minValue: 1, maxValue: 50 },
		default: 50,
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		displayOptions: show('chat', ['getUnanswered']),
		default: {},
		options: [
			{ displayName: 'After', name: 'after', type: 'dateTime', default: '', description: 'Only chats waiting since after this time. Defaults to the last 30 days.' },
			{ displayName: 'Before', name: 'before', type: 'dateTime', default: '', description: 'Only chats waiting since before this time' },
		],
	},

	// Group
	...returnAllAndLimit('group', 'getAll', 100),

	// Template
	{
		displayName: 'Status',
		name: 'status',
		type: 'options',
		displayOptions: show('template', ['getAll']),
		options: [
			{ name: 'Any', value: 'any' },
			{ name: 'Approved', value: 'APPROVED' },
			{ name: 'Pending', value: 'PENDING' },
			{ name: 'Rejected', value: 'REJECTED' },
		],
		default: 'APPROVED',
	},
	...returnAllAndLimit('template', 'getAll', 50),

	// Tool
	{
		displayName: 'Tool Name or ID',
		name: 'toolName',
		type: 'options',
		required: true,
		typeOptions: { loadOptionsMethod: 'getTools' },
		displayOptions: show('tool', ['run']),
		default: '',
		description:
			'Any tool your API key may use. See whatsync.app/docs/api/tools. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Input',
		name: 'input',
		type: 'json',
		displayOptions: show('tool', ['run']),
		default: '{}',
		description: 'The tool input as JSON, matching its schema in the WhatSync tool reference',
	},

	idempotencyOption('message', ['send', 'sendTemplate', 'sendToGroup']),
	idempotencyOption('tool', ['run']),
];
