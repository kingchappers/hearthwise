import { describe, expect, it } from 'vitest';
import { isAllowedAddress, isHostLiteral } from '../addressRules';
import registry from './specialPurpose.json';

interface Entry {
  prefix: string;
  name: string;
  globallyReachable: boolean;
}

// The first and last address of a prefix, as text, so a test can try both ends of every registry entry.
function ends(prefix: string): string[] {
  const [base, lengthText] = prefix.split('/');
  const length = Number(lengthText);
  if (base.includes(':')) {
    const groups = expandV6(base);
    let value = groups.reduce((acc, g) => (acc << 16n) | BigInt(g), 0n);
    const hostBits = BigInt(128 - length);
    const mask = (1n << hostBits) - 1n;
    value &= ~mask;
    return [formatV6(value), formatV6(value | mask)];
  }
  const parts = base.split('.').map(BigInt);
  let value = (parts[0] << 24n) | (parts[1] << 16n) | (parts[2] << 8n) | parts[3];
  const mask = (1n << BigInt(32 - length)) - 1n;
  value &= ~mask;
  const text = (v: bigint): string => [24n, 16n, 8n, 0n].map(s => String((v >> s) & 255n)).join('.');
  return [text(value), text(value | mask)];
}

function expandV6(text: string): number[] {
  const [head, tail] = text.split('::');
  const h = head ? head.split(':') : [];
  const t = tail === undefined ? [] : tail ? tail.split(':') : [];
  const fill = 8 - h.length - t.length;
  return [...h, ...Array(tail === undefined ? 0 : fill).fill('0'), ...t].map(g => parseInt(g, 16));
}

function formatV6(value: bigint): string {
  const groups: string[] = [];
  for (let i = 7; i >= 0; i--) groups.push(((value >> BigInt(i * 16)) & 0xffffn).toString(16));
  return groups.join(':');
}

describe('isAllowedAddress: IPv4', () => {
  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '142.250.80.46', '172.15.255.255', '172.32.0.0', '100.63.255.255', '100.128.0.0', '11.0.0.0', '192.169.0.1', '198.20.0.1', '223.255.255.255'])('allows the public address %s', address => {
    expect(isAllowedAddress(address)).toBe(true);
  });

  it.each([
    ['0.0.0.0', 'this network'],
    ['0.255.255.255', 'this network'],
    ['10.0.0.1', 'private'],
    ['10.255.255.255', 'private'],
    ['100.64.0.1', 'shared address space'],
    ['100.127.255.255', 'shared address space'],
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'loopback'],
    ['169.254.169.254', 'cloud metadata'],
    ['169.254.170.2', 'Lambda and ECS credentials'],
    ['172.16.0.1', 'private'],
    ['172.31.255.255', 'private'],
    ['192.0.0.1', 'protocol assignments'],
    ['192.0.2.1', 'documentation'],
    ['192.88.99.1', '6to4 relay'],
    ['192.168.1.1', 'private'],
    ['198.18.0.1', 'benchmarking'],
    ['198.19.255.255', 'benchmarking'],
    ['198.51.100.1', 'documentation'],
    ['203.0.113.1', 'documentation'],
    ['224.0.0.1', 'multicast'],
    ['239.255.255.255', 'multicast'],
    ['240.0.0.1', 'reserved'],
    ['255.255.255.255', 'broadcast'],
  ])('refuses %s (%s)', address => {
    expect(isAllowedAddress(address)).toBe(false);
  });

  it.each(['', '8.8.8', '8.8.8.8.8', '08.8.8.8', '8.8.8.08', '256.1.1.1', '8.8.8.-1', ' 8.8.8.8', '8.8.8.8 ', '0x8.8.8.8', '8.8.8.8\n', 'example.com', '134744072', '1e1.1.1.1'])('refuses the non-canonical or malformed text %j', text => {
    expect(isAllowedAddress(text)).toBe(false);
  });
});

describe('isAllowedAddress: IPv6', () => {
  it.each(['2607:f8b0:4004:c1b::65', '2a00:1450:4009:81f::200e', '2001:4860:4860::8888', '2400:cb00::1', '2606:4700:4700::1111', '3ffe::1', '2620:4f:8000::1'])('allows the global unicast address %s', address => {
    expect(isAllowedAddress(address)).toBe(true);
  });

  it.each([
    '::',
    '::1',
    '::ffff:7f00:1',
    '::ffff:127.0.0.1',
    '::ffff:8.8.8.8',
    '0:0:0:0:0:ffff:808:808',
    '::127.0.0.1',
    '64:ff9b::7f00:1',
    '64:ff9b::808:808',
    '64:ff9b:1::1',
    '100::1',
    'fc00::1',
    'fd00:ec2::254',
    'fe80::1',
    'febf::1',
    'ff02::1',
    '2001::1',
    '2001:0:4136:e378:8000:63bf:3fff:fdd2',
    '2001:1ff:ffff::1',
    '2001:db8::1',
    '2002::1',
    '2002:7f00:1::1',
    '2002:a9fe:a9fe::1',
    '3fff::1',
    '3fff:fff:ffff::1',
    '1fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
    '4000::1',
    'e000::1',
  ])('refuses %s', address => {
    expect(isAllowedAddress(address)).toBe(false);
  });

  it.each(['fe80::1%eth0', 'fe80::1%25eth0', '2607:f8b0::1%1', '[2607:f8b0::1]', '2607:f8b0::1/64', ':::', '2607:f8b0::1::2', '2607:f8b0:0:0:0:0:0:0:1', '12345::1', 'g::1', '2607:f8b0::8.8.8.8', '::ffff:0808:0808%lo'])('refuses the malformed or zoned text %j', text => {
    expect(isAllowedAddress(text)).toBe(false);
  });

  it('reads an uppercase address the same way', () => {
    expect(isAllowedAddress('2607:F8B0:4004:C1B::65')).toBe(true);
    expect(isAllowedAddress('FE80::1')).toBe(false);
    expect(isAllowedAddress('::FFFF:7F00:1')).toBe(false);
  });
});

describe('the IANA special-purpose registries', () => {
  const entries = registry.entries as Entry[];

  it('holds a copy of the registries to walk', () => {
    expect(entries.length).toBeGreaterThan(40);
  });

  it('refuses the first and the last address of every entry that is not globally reachable', () => {
    for (const entry of entries.filter(e => !e.globallyReachable)) {
      for (const address of ends(entry.prefix)) {
        expect(isAllowedAddress(address), `${entry.name} ${entry.prefix} ${address}`).toBe(false);
      }
    }
  });

  it('refuses the globally reachable entries that sit inside a range the design blocks whole', () => {
    for (const address of ['192.0.0.9', '192.0.0.10', '2001:1::1', '2001:1::2', '2001:1::3', '2001:3::1', '2001:4:112::1', '2001:20::1', '2001:30::1', '64:ff9b::808:808']) {
      expect(isAllowedAddress(address), address).toBe(false);
    }
  });

  it('allows what is globally reachable and outside every blocked range (AS112)', () => {
    for (const address of ['192.31.196.1', '192.52.193.1', '192.175.48.1', '2620:4f:8000::1']) {
      expect(isAllowedAddress(address), address).toBe(true);
    }
  });
});

describe('isHostLiteral: an address, or a name that is not a name', () => {
  it.each([
    '127.0.0.1',
    '2130706433',
    '0x7f000001',
    '0X7F.0.0.1',
    '0177.0.0.1',
    '0177.0.0.01',
    '127.1',
    '127.0.1',
    '1.2.3.4.',
    '8.8.8.8',
    '[::1]',
    '::1',
    '[2607:f8b0::1]',
    '[::ffff:127.0.0.1]',
    'fe80::1%eth0',
    'localhost',
    'LOCALHOST',
    'localhost.',
    'foo.localhost',
    'intranet',
    'calendar.google.com.',
    '.',
    '',
    'calendar..google.com',
    '.calendar.google.com',
    '10.0.0.1.',
    '0x7f.1',
    '0xff',
    '12345678901234567890',
  ])('treats %j as a literal or a bad name', host => {
    expect(isHostLiteral(host)).toBe(true);
  });

  it.each(['calendar.google.com', 'outlook.office365.com', 'p12-caldav.icloud.com', 'calendar.proton.me', 'xn--80ak6aa92e.com', 'a.b', '1password.com', 'x1.example.com', 'example.0x.com', '123abc.example.com'])('treats %s as a name', host => {
    expect(isHostLiteral(host)).toBe(false);
  });
});
