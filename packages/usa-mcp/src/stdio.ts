#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createUsaOpenDataMcpServer } from './usaOpenDataMcpServer.js';

const server = createUsaOpenDataMcpServer();
await server.connect(new StdioServerTransport());
