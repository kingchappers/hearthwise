import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { APP_NAME, APP_DESCRIPTION } from '../pageTitle';
import { BRAND } from '../brand';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(HERE, '../../../public');
const ROOT_TSX = path.resolve(HERE, '../../root.tsx');

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

interface Manifest {
  name: string;
  short_name: string;
  description: string;
  id: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
  shortcuts?: unknown[];
}

function publicFile(src: string): string {
  return path.join(PUBLIC_DIR, src.replace(/^\//, ''));
}

function readManifest(): Manifest {
  return JSON.parse(fs.readFileSync(publicFile('/manifest.webmanifest'), 'utf8')) as Manifest;
}

function pngSize(file: string): { width: number; height: number } {
  const bytes = fs.readFileSync(file);
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error(`${file} is not a PNG`);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('web manifest', () => {
  it('names the app and launches it standalone from the site root', () => {
    const manifest = readManifest();

    expect(manifest.name).toBe(APP_NAME);
    expect(manifest.short_name).toBe(APP_NAME);
    expect(manifest.description).toBe(APP_DESCRIPTION);
    expect(manifest.id).toBe('/');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe(BRAND.ink);
    expect(manifest.background_color).toBe(BRAND.ash);
  });

  it('declares 192 and 512 PNG icons that exist at exactly the declared size', () => {
    const { icons } = readManifest();
    const declared = icons.map(icon => icon.sizes);

    expect(declared).toContain('192x192');
    expect(declared).toContain('512x512');
    for (const icon of icons) {
      const [width, height] = icon.sizes.split('x').map(Number);
      expect(icon.type).toBe('image/png');
      expect(pngSize(publicFile(icon.src))).toEqual({ width, height });
    }
  });

  it('includes a maskable 512 icon', () => {
    const { icons } = readManifest();

    expect(icons.some(icon => icon.purpose === 'maskable' && icon.sizes === '512x512')).toBe(true);
  });

  it('offers no launch shortcuts yet, since Hearthwise has no quick-add sheet', () => {
    expect(readManifest().shortcuts).toBeUndefined();
  });
});

describe('install metadata', () => {
  it('ships a 180px apple-touch-icon, an SVG favicon and an ICO favicon', () => {
    expect(pngSize(publicFile('/apple-touch-icon.png'))).toEqual({ width: 180, height: 180 });
    expect(fs.existsSync(publicFile('/favicon.svg'))).toBe(true);
    expect(fs.readFileSync(publicFile('/favicon.ico')).subarray(0, 4).toString('hex')).toBe('00000100');
  });

  it('has a launch image for each iPhone and iPad size root.tsx points at', () => {
    const source = fs.readFileSync(ROOT_TSX, 'utf8');
    const sizes = [...source.matchAll(/file: '(\d+x\d+)'/g)].map(match => match[1]);
    expect(sizes).toHaveLength(5);
    for (const size of sizes) {
      const [width, height] = size.split('x').map(Number);
      expect(pngSize(publicFile(`/splash/apple-splash-${size}.png`))).toEqual({ width, height });
    }
  });

  it('links the manifest and the touch icon from root.tsx', () => {
    const source = fs.readFileSync(ROOT_TSX, 'utf8');

    expect(source).toContain('/manifest.webmanifest');
    expect(source).toContain('/apple-touch-icon.png');
    expect(source).toContain('theme-color');
  });
});
