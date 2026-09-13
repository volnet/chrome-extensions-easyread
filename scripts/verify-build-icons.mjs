import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Original image SHA-256 values from the v1.0.1 Git LFS pointers (not pointer-file hashes).
const orange = { 16: '540df5e09df7c4886635a5cbd30997aa5ba4db0cc3bc54247c0b0f4a845da0e7', 32: '13034e19f560b4d7f26ddebd7f76c2be3d4a7f9e3da38ca66727a4b43c0f3b68', 48: '63e0a7d5d2c6c5e56063d3aececb2a64bd0e0ed0f44dd3e1f1dbba733ec5c673', 128: '4db0857dc1ceb55e3ad62be30c2d6ef9fc0cbf87a0a595392096f8d3258125a5', 512: '7ad273dc0b377ab707b6b267c5fc418fe969200ae91a0e41984c65940c8fde72' };
const blobHash = bytes => createHash('sha256').update(bytes).digest('hex');
export function verifyBuildIcons(root) {
  for (const mode of ['development', 'production']) {
    const destination = join(root, 'dist', mode);
    const manifest = JSON.parse(readFileSync(join(destination, 'manifest.json'), 'utf8'));
    assert.equal(manifest.version, '2.0.0');
    assert.equal(existsSync(join(destination, 'assets/logo-dev')), false);
    const blueHashes = new Set(readdirSync(join(root, 'src/assets/logo-dev')).map(file => blobHash(readFileSync(join(root, 'src/assets/logo-dev', file)))));
    for (const [size, originalHash] of Object.entries(orange)) {
      const path = `assets/logo/icon-${size}.png`;
      assert.equal(manifest.icons[size], path);
      assert.equal(manifest.action.default_icon[size], path);
      const actual = readFileSync(join(destination, path));
      const expected = readFileSync(join(root, 'src/assets', mode === 'development' ? 'logo-dev' : 'logo', `icon-${size}.png`));
      assert.ok(actual.equals(expected), `${mode}: wrong ${size}px icon`);
      if (mode === 'production') assert.equal(blobHash(actual), originalHash, 'Production must retain v1.0.1 orange artwork');
      else assert.notEqual(blobHash(actual), originalHash, 'Development must use blue artwork');
    }
    if (mode === 'production') {
      const scan = directory => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const path = join(directory, entry.name);
          if (entry.isDirectory()) scan(path);
          else if (entry.name.endsWith('.png')) assert.ok(!blueHashes.has(blobHash(readFileSync(path))), `Development icon leaked into production: ${path}`);
        }
      };
      scan(destination);
    }
  }
  console.log('Verified development blue icons and original v1.0.1 production orange icons.');
}
