import dns from 'node:dns/promises';
import net from 'node:net';

export class UrlPolicyError extends Error {
  readonly code = 'UNSAFE_URL';
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost', 'localhost.localdomain', 'metadata.google.internal',
  'metadata', 'instance-data.ec2.internal', '169.254.169.254',
]);

function blockedIp(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (net.isIPv4(normalized)) {
    const octets = normalized.split('.').map(Number);
    const a = octets[0] ?? -1;
    const b = octets[1] ?? -1;
    return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 ||
      a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 ||
      a >= 224 || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19);
  }
  if (net.isIPv6(normalized)) {
    const value = normalized.toLowerCase();
    if (value.startsWith('::ffff:')) return blockedIp(value.slice('::ffff:'.length));
    return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') ||
      value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb') ||
      value.startsWith('ff') || value.startsWith('::ffff:127.') || value.startsWith('::ffff:10.') ||
      value.startsWith('::ffff:192.168.') || value.startsWith('::ffff:169.254.');
  }
  return true;
}

export interface SafeUrl {
  url: URL;
  addresses: string[];
}

export async function validateExternalUrl(input: string): Promise<SafeUrl> {
  if (typeof input !== 'string' || input.length === 0 || input.length > 2048) {
    throw new UrlPolicyError('URL ausente ou maior que 2048 caracteres.');
  }
  let url: URL;
  try { url = new URL(input); } catch { throw new UrlPolicyError('URL inválida.'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new UrlPolicyError('Somente http e https são permitidos.');
  if (url.username || url.password) throw new UrlPolicyError('Credenciais na URL não são permitidas.');
  if (url.hostname.endsWith('.') || BLOCKED_HOSTNAMES.has(url.hostname.toLowerCase())) throw new UrlPolicyError('Destino local ou de metadata bloqueado.');
  const addresses = net.isIP(url.hostname) ? [url.hostname] : (await dns.lookup(url.hostname, { all: true })).map(item => item.address);
  if (addresses.length === 0 || addresses.some(blockedIp)) throw new UrlPolicyError('A URL resolve para uma rede local, privada ou reservada.');
  return { url, addresses };
}

