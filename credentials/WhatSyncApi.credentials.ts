import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class WhatSyncApi implements ICredentialType {
	name = 'whatSyncApi';

	displayName = 'WhatSync API';

	icon: Icon = { light: 'file:../icons/whatsync.svg', dark: 'file:../icons/whatsync.dark.svg' };

	documentationUrl = 'https://whatsync.app/docs/api/authentication';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			placeholder: 'wsk_live_...',
			description:
				'Create a key in the WhatSync dashboard under Developers. API keys are part of the Max plan.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://whatsync.app',
			description: 'Leave as is unless WhatSync support gives you a different address',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}',
			url: '/api/v1/me',
			method: 'GET',
		},
	};
}
