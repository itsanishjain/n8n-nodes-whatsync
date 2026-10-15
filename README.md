# n8n-nodes-whatsync

Send and read WhatsApp messages from [n8n](https://n8n.io/) with [WhatSync](https://whatsync.app), and start workflows when a WhatsApp message arrives.

WhatSync connects your personal WhatsApp (linked like WhatsApp Web) or a number on the official WhatsApp Business API. This package works with both.

- [Installation](#installation)
- [Credentials](#credentials)
- [Operations](#operations)
- [Trigger](#trigger)
- [Example: reply to new messages](#example-reply-to-new-messages)
- [Limits](#limits)
- [Compatibility](#compatibility)
- [Resources](#resources)

## Installation

In n8n, open **Settings > Community Nodes**, choose **Install**, and enter `n8n-nodes-whatsync`. See the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) for details and for self-hosted setups.

## Credentials

You need a WhatSync account on the **Max plan**. API keys and webhooks are part of Max.

1. Sign in at [whatsync.app](https://whatsync.app) and link your WhatsApp or connect a WhatsApp Business API number.
2. Open **Dashboard > Developers** and choose **Create key**.
3. Pick permissions. Read and Send are selected by default. Add **Manage groups** for group messages, **Manage templates** to list templates, and **Manage webhooks** for the WhatSync Trigger.
4. Copy the key (it starts with `wsk_live_`). It is shown once.
5. In n8n, create a **WhatSync API** credential and paste the key. Leave Base URL as `https://whatsync.app`.

The credential test calls `GET /api/v1/me` and shows an error if the key is wrong, revoked, or the account is not on Max.

## Operations

| Resource | Operation | What it does |
| --- | --- | --- |
| Message | Send Text | Send a text to a phone number or reply in an existing chat. Choose personal WhatsApp, the Business API, or Automatic. |
| Message | Send Template | Send an approved template from a WhatsApp Business API number, with variables. You confirm the recipient agreed to receive messages. |
| Message | Send to Group | Send a text to a group on your personal WhatsApp. |
| Message | Get Send Status | Check whether a sent message was accepted, delivered or read. |
| Message | Search | Search saved messages by text, file name or contact. |
| Chat | Get Many | List recent chats. |
| Chat | Get Messages | Read the messages in one chat. |
| Chat | Get Unanswered | List chats where the last message came from the other person. |
| Group | Get Many | List the groups your personal WhatsApp is in. |
| Template | Get Many | List message templates on your Business account. |
| Account | Get | Show your connected numbers and what the key may do. |
| Tool | Run | Run any [WhatSync tool](https://whatsync.app/docs/api/tools) by name with a JSON input. |

The node can also be used as a tool by n8n's AI Agent.

### Sending safely

Every send uses an **idempotency key**: WhatSync performs an action once per key, even if n8n repeats the request. By default the node uses one key per execution and item. When a send follows the WhatSync Trigger, set **Options > Idempotency Key** to the event ID (`{{ $json.id }}`) so a repeated event never sends twice.

A free-text message on the Business API only works within 24 hours of the person's last message to you. Outside that window, send a template.

## Trigger

The **WhatSync Trigger** starts a workflow on:

- **Message Received**: someone sent you a message
- **Message Sent**: a message you sent was saved
- **Message Status Changed**: a Business API message was delivered, read or failed
- **Number Connected** and **Number Needs Reconnecting**

Optional filters keep only personal or Business messages, only direct chats or groups, or one group.

How it works:

- When you activate the workflow (or listen for a test event), the trigger registers a webhook in WhatSync. When you deactivate it, the webhook is removed.
- Every event is signed. The trigger checks the signature with the secret WhatSync gave it and rejects anything else.
- WhatSync delivers each event at least once and retries failures. The trigger skips an event ID it has already seen recently.
- Only chats that WhatSync saves produce message events. Choose them in the WhatSync dashboard under **What's saved**.
- WhatSync can only send events to a public **HTTPS** address. n8n Cloud works as is. For self-hosted n8n, set `WEBHOOK_URL` to your public HTTPS address (a tunnel works for testing).

Event payloads are documented at [whatsync.app/docs/webhooks](https://whatsync.app/docs/webhooks). A received message looks like this (shortened):

```json
{
  "id": "evt_01J9XK2Q8V7Y3M4N5P6R7S8T9U",
  "type": "message.received",
  "created_at": "2026-10-08T09:41:12.512Z",
  "data": {
    "message": {
      "conversation_id": "15550000001",
      "channel": "business",
      "chat_type": "direct",
      "from": { "phone": "15550000001", "name": "Ravi" },
      "type": "text",
      "text": "Hi, is the order ready?"
    }
  }
}
```

## Example: reply to new messages

1. Add **WhatSync Trigger** with event **Message Received** and filter **Chat Type: Direct Chats Only**.
2. Add **WhatSync**, resource **Message**, operation **Send Text**:
   - Send To: **Existing Chat**
   - Conversation ID: `{{ $json.data.message.conversation_id }}`
   - Text: `Thanks, we got your message and will reply soon.`
   - Options > Idempotency Key: `{{ $json.id }}`
3. Activate the workflow and send a WhatsApp message to your number from another phone.

Your reply creates a Message Sent event, not Message Received, so it does not start the workflow again.

The same workflow is in [examples/reply-to-new-messages.json](examples/reply-to-new-messages.json). Import it in n8n with **Import from File**, then pick your WhatSync credential in both nodes.

## Limits

- **Personal WhatsApp**: up to 50 messages a day per number through the API, and 5 a minute. This protects the number from a WhatsApp ban. Messages, files, reactions, polls and group messages all count. The count resets at 00:00 UTC.
- **WhatsApp Business API**: no WhatSync daily limit. Meta's own messaging limits and template rules apply.
- 600 read requests and 120 write requests a minute per key.

See [errors and limits](https://whatsync.app/docs/api/errors-and-limits).

## Compatibility

Built with the n8n node CLI for n8n 1.x and later. No runtime dependencies.

## Resources

- [WhatSync API quickstart](https://whatsync.app/docs/api/quickstart)
- [Tool reference](https://whatsync.app/docs/api/tools)
- [Webhooks](https://whatsync.app/docs/webhooks)
- [n8n community nodes](https://docs.n8n.io/integrations/#community-nodes)
- Support: hello@appstronauts.shop

## License

[MIT](LICENSE.md)
