// Which addresses the calendar fetcher may connect to. This is an allow-list, so a range nobody thought of is refused: an IPv4 address
// must be outside the blocked table, and an IPv6 address must be global unicast (2000::/3) and outside the blocked ranges inside it.
// Text is read strictly. Anything that is not the canonical form of an address is refused, never "fixed up", because the address that
// is checked must be the address that is connected to.

const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // the cloud metadata address and the Lambda credential address
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

// Inside 2000::/3. Everything outside it is refused by the allow-list itself: ::, ::1, IPv4-mapped (::ffff:0:0/96), NAT64 (64:ff9b::/96
// and 64:ff9b:1::/48), 100::/64, fc00::/7, fe80::/10 and ff00::/8.
const BLOCKED_V6: ReadonlyArray<readonly [number[], number]> = [
  [[0x2001, 0], 23], // Teredo and the IETF protocol assignments
  [[0x2001, 0xdb8], 32], // documentation
  [[0x2002], 16], // 6to4
  [[0x3fff], 20], // documentation
];

const toBigInt = (parts: number[], width: number): bigint => parts.reduce((acc, part) => (acc << BigInt(width)) | BigInt(part), 0n);

const BLOCKED_V4_RANGES = BLOCKED_V4.map(([base, length]) => {
  const parts = base.split('.').map(Number);
  const start = toBigInt(parts, 8);
  return [start, start + (1n << BigInt(32 - length)) - 1n] as const;
});

const BLOCKED_V6_RANGES = BLOCKED_V6.map(([groups, length]) => {
  const padded = [...groups, ...Array(8 - groups.length).fill(0)] as number[];
  const start = toBigInt(padded, 16);
  return [start, start + (1n << BigInt(128 - length)) - 1n] as const;
});

const V6_GLOBAL_UNICAST_START = 0x2000n << 112n;
const V6_GLOBAL_UNICAST_END = (0x4000n << 112n) - 1n;

function parseV4(text: string): bigint | undefined {
  const parts = text.split('.');
  if (parts.length !== 4) return undefined;
  const numbers: number[] = [];
  for (const part of parts) {
    // Canonical dotted decimal only: no signs, spaces, hex, octal (a leading zero) or empty parts.
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return undefined;
    const value = Number(part);
    if (value > 255) return undefined;
    numbers.push(value);
  }
  return toBigInt(numbers, 8);
}

function parseV6(text: string): bigint | undefined {
  // No zone ids, brackets, prefix lengths or dotted tails: a resolver returns none of them, and each one is a way to smuggle an address.
  if (!/^[0-9a-fA-F:]+$/.test(text)) return undefined;
  const halves = text.split('::');
  if (halves.length > 2) return undefined;
  const groupsOf = (half: string): string[] | undefined => {
    if (half === '') return [];
    const groups = half.split(':');
    return groups.every(group => /^[0-9a-fA-F]{1,4}$/.test(group)) ? groups : undefined;
  };
  const head = groupsOf(halves[0]);
  const tail = halves.length === 2 ? groupsOf(halves[1]) : [];
  if (!head || !tail) return undefined;
  let groups: string[];
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 1) return undefined;
    groups = [...head, ...Array<string>(fill).fill('0'), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return undefined;
  return toBigInt(groups.map(group => parseInt(group, 16)), 16);
}

export function isAllowedAddress(address: string): boolean {
  if (typeof address !== 'string') return false;
  if (address.includes(':')) {
    const value = parseV6(address);
    if (value === undefined) return false;
    if (value < V6_GLOBAL_UNICAST_START || value > V6_GLOBAL_UNICAST_END) return false;
    return !BLOCKED_V6_RANGES.some(([start, end]) => value >= start && value <= end);
  }
  const value = parseV4(address);
  if (value === undefined) return false;
  return !BLOCKED_V4_RANGES.some(([start, end]) => value >= start && value <= end);
}

// True for a host that is an address in any form (decimal, hex, octal, shortened, bracketed, IPv6, with a zone), for localhost, for a
// name with no dot, and for a name with an empty label (a trailing dot too). A second check beside the exact host list, so a mistake
// in the list cannot let one through.
export function isHostLiteral(host: string): boolean {
  if (host === '' || /[:[\]%]/.test(host)) return true;
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true;
  const labels = lower.split('.');
  if (labels.length < 2 || labels.some(label => label === '')) return true;
  // The URL standard reads a host whose last label is a number as an IPv4 address (127.1, 0x7f.1, 2130706433).
  return /^(0x[0-9a-f]*|\d+)$/.test(labels[labels.length - 1]);
}
