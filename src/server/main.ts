import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startLocalServer } from './index.js';
import { createFileAuditHistory } from '../reports/history.js';

async function chromeIsReady(): Promise<boolean> {
  try { const response = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(500) }); return response.ok; } catch { return false; }
}

function chromeCandidates(): string[] {
  return [
    process.env.CHROME_PATH,
    process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe') : undefined,
    process.env['PROGRAMFILES(X86)'] ? path.join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe') : undefined,
    process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe') : undefined,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe') : undefined,
    process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, 'Microsoft/Edge/Application/msedge.exe') : undefined,
    process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe') : undefined,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter((value): value is string => Boolean(value));
}

async function ensureChrome(): Promise<ChildProcess | undefined> {
  if (await chromeIsReady()) return undefined;
  const executable = chromeCandidates().find(existsSync);
  if (!executable) throw new Error('Chrome ou Edge não encontrado. Instale um navegador Chromium ou defina CHROME_PATH.');
  const profile = await mkdtemp(path.join(tmpdir(), 'more-accessibility-'));
  const child = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9222', `--user-data-dir=${profile}`], { detached: false, stdio: 'ignore', windowsHide: true });
  for (let attempt = 0; attempt < 40; attempt += 1) { if (await chromeIsReady()) return child; await new Promise(resolve => setTimeout(resolve, 250)); }
  child.kill();
  throw new Error('O navegador foi iniciado, mas a porta CDP 9222 não ficou disponível.');
}

const chrome = await ensureChrome();
const history = createFileAuditHistory();
const running = await startLocalServer({ port: Number(process.env.PORT ?? 8787), staticRoot: 'src/ui', logoPath: 'Logo de olho estilizado em janela roxa.png', history });
console.log(`Servidor local em ${running.url}`);

const shutdown = async () => {
  await running.close();
  chrome?.kill();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
