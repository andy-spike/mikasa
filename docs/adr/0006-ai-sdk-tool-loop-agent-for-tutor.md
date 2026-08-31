# AI SDK ToolLoopAgent for the Tutor

The Tutor uses an AI SDK `ToolLoopAgent`, `useChat`, and the AI SDK UI message stream over a direct Route Handler. Neon holds the canonical conversation, while the agent gets read-only tools for Course search and web search. We rejected a hand-written agent loop and `WorkflowAgent` because Tutor turns are short, interactive, and already durable between turns through stored messages.
