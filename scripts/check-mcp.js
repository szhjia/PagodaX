import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { writeFile } from 'node:fs/promises';

const client = new Client({ name: 'pagodax-verification', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: ['node_modules/@modelcontextprotocol/server-threejs/dist/index.js', '--stdio'], cwd: process.cwd(), stderr: 'pipe' });
try {
  await client.connect(transport);
  const listing = await client.listTools();
  const names = listing.tools.map((tool) => tool.name);
  if (!names.includes('learn_threejs') || !names.includes('show_threejs_scene')) throw new Error('Required tools missing');
  const docs = await client.callTool({ name: 'learn_threejs', arguments: {} });
  if (docs.isError || !docs.content.some((item) => item.type === 'text' && item.text.includes('THREE'))) throw new Error('Documentation call failed');
  const scene = await client.callTool({ name: 'show_threejs_scene', arguments: { code: 'const scene = new THREE.Scene(); const renderer = new THREE.WebGLRenderer({canvas}); const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100); camera.position.z = 5; renderer.setSize(width, height); renderer.render(scene, camera);', height: 400 } });
  if (scene.isError || scene.structuredContent?.success !== true) throw new Error('Scene tool failed');
  const resources = await client.listResources();
  const ui = resources.resources.find((item) => item.uri === 'ui://threejs/mcp-app.html');
  if (!ui) throw new Error('Preview resource missing');
  const resource = await client.readResource({ uri: ui.uri });
  const report = { package: '@modelcontextprotocol/server-threejs@2.0.4', initialized: true, tools: names, documentationCall: 'passed', sceneToolCall: 'passed', previewResourceBytes: resource.contents[0].text.length, hostLoadedInThisChat: false, note: '项目配置已安装，STDIO与工具协议已通过；当前聊天未热加载该新MCP。' };
  await writeFile('docs/evidence/mcp.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await client.close(); }
