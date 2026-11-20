# Privacy Policy for BroAnt

## Introduction

[BroAnt](https://github.com/Steppenwoolf/broant) is an open-source, local-first AI web automation Chrome extension and Model Context Protocol (MCP) server. This Privacy Policy explains how it handles your data.

## Open Source

BroAnt is licensed under the Apache License 2.0. All source code is public in our [GitHub repository](https://github.com/Steppenwoolf/broant), allowing complete auditability of its security and data handling.

## What Stays in Your Browser & Machine

- **Local-First Execution**: BroAnt runs entirely on your local machine. There is no remote BroAnt cloud backend and no user tracking account.
- **Zero External Telemetry**: BroAnt does not phone home, does not collect analytics via third-party telemetry services, and does not open external forms upon uninstall.
- **Local WebSocket Bridge**: The Agent Bridge (`ws://127.0.0.1:8765`) binds exclusively to local loopback interfaces. All inter-process communication between your local AI assistants (Claude Code, Cursor, Antigravity) and the extension stays strictly on your machine.
- **Sensitive Field Protection**: Passwords, payment card details, and sensitive credential fields are stripped and masked from automated observation outlines.
- **Data Persistence**: Your conversations, local settings, model endpoints, and site rules are stored purely inside your browser's local storage (`chrome.storage.local`).

## What Is Sent to the AI Providers You Choose

To perform tasks, BroAnt sends requests directly from your browser to the AI providers you explicitly configure:
- **Your Model Providers** (Anthropic, OpenAI, Google Gemini, OpenRouter, or local servers such as LM Studio and Ollama): your task instructions, page content from active tabs, and screenshots (when vision-enabled).
- **Local Models**: If you use LM Studio or Ollama, all inference occurs locally on your hardware, and zero data leaves your local network.

## API Keys

- You provide your own API keys.
- Keys are encrypted/stored locally in your browser storage and transmitted only to the corresponding vendor endpoint.
- Keys are never logged, exported, or shared.

## Changes to this Policy

Any updates to this policy are published directly in the GitHub repository.

Last updated: November 21, 2026
