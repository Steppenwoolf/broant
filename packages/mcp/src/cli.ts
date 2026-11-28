import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BridgeHub } from './bridge-hub.js';
import { logStderr, resolveAuthToken, type BridgeConfig } from './protocol.js';
import { createBroantMcpServer } from './server.js';

function parseArgs(args: string[]) {
  const result = {
    port: 8765,
    host: '127.0.0.1',
    token: undefined as string | undefined,
    graceMs: 3000,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--port' || arg === '-p') {
      const val = parseInt(args[++i], 10);
      if (!Number.isNaN(val)) result.port = val;
    } else if (arg.startsWith('--port=')) {
      const val = parseInt(arg.slice(7), 10);
      if (!Number.isNaN(val)) result.port = val;
    } else if (arg === '--host') {
      result.host = args[++i] || '127.0.0.1';
    } else if (arg.startsWith('--host=')) {
      result.host = arg.slice(7) || '127.0.0.1';
    } else if (arg === '--token' || arg === '-t') {
      result.token = args[++i];
    } else if (arg.startsWith('--token=')) {
      result.token = arg.slice(8);
    } else if (arg === '--grace-ms') {
      const val = parseInt(args[++i], 10);
      if (!Number.isNaN(val)) result.graceMs = val;
    } else if (arg.startsWith('--grace-ms=')) {
      const val = parseInt(arg.slice(11), 10);
      if (!Number.isNaN(val)) result.graceMs = val;
    }
  }

  return result;
}

function printHelp(): void {
  // strictly console.error so stdout stays clean if accidentally piped to MCP client
  console.error(`
BroAnt MCP Server (broant-mcp)

Usage:
  broant-mcp [options]
  npx broant-mcp [options]

Options:
  -p, --port <number>      Bridge WebSocket port (default: 8765)
  -t, --token <string>     Shared auth token (default: env BROANT_BRIDGE_TOKEN or ~/.broant/bridge.token)
  --host <string>          Host interface to bind to (default: 127.0.0.1)
  --grace-ms <number>      Connection grace wait time in ms (default: 3000)
  -h, --help               Show this help message

Environment variables:
  BROANT_BRIDGE_TOKEN      Bridge authentication token
  BROANT_BRIDGE_PORT       Bridge port override
  NANOBROWSER_BRIDGE_TOKEN Fallback legacy authentication token
`);
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help) {
    printHelp();
    process.exit(0);
  }

  const isLoopbackHost =
    parsed.host === '127.0.0.1' ||
    parsed.host === 'localhost' ||
    parsed.host === '::1' ||
    parsed.host === '[::1]';
  if (!isLoopbackHost) {
    console.error(
      `[broant-mcp] Security Error: --host must be a local loopback address (127.0.0.1, localhost, [::1]). Binding to external interface "${parsed.host}" is prohibited for security reasons.`,
    );
    process.exit(1);
  }

  const envPortStr = process.env.BROANT_BRIDGE_PORT || process.env.NANOBROWSER_BRIDGE_PORT;
  if (envPortStr) {
    const envPort = parseInt(envPortStr, 10);
    if (!Number.isNaN(envPort)) parsed.port = envPort;
  }

  const token = resolveAuthToken(parsed.token);
  const allowedExtensionIds = (process.env.BROANT_EXTENSION_ID || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const config: BridgeConfig = {
    host: parsed.host,
    port: parsed.port,
    authToken: token,
    connectGraceMs: parsed.graceMs,
    allowedExtensionIds: allowedExtensionIds.length > 0 ? allowedExtensionIds : undefined,
  };

  logStderr('INFO', `Initializing broant-mcp on ${config.host}:${config.port}...`);

  const hub = new BridgeHub(config);

  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logStderr('INFO', `Received ${signal}, shutting down Bridge Hub...`);
    try {
      await hub.shutdown();
    } catch (err) {
      logStderr('ERROR', `Error during shutdown: ${String(err)}`);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  if (!process.env.BROANT_STANDALONE) {
    process.stdin.on('close', () => void shutdown('stdin:close'));
    process.stdin.on('end', () => void shutdown('stdin:end'));
  }

  try {
    await hub.start();
    logStderr('INFO', `Bridge Hub started in [${hub.currentMode}] mode`);

    const server = createBroantMcpServer(hub, config.port);
    const transport = new StdioServerTransport();

    await server.connect(transport);
    logStderr('INFO', 'BroAnt MCP server connected to stdio transport and ready');
  } catch (err) {
    logStderr('ERROR', `Fatal startup error: ${err instanceof Error ? err.stack || err.message : String(err)}`);
    await hub.shutdown();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[broant-mcp] Uncaught top-level error:', err);
  process.exit(1);
});
