import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { brotliCompress, constants, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const brotli = promisify(brotliCompress);
const gzipFile = promisify(gzip);
const outputDirectory = fileURLToPath(new URL('../dist/', import.meta.url));
const compressibleExtensions = new Set(['.css', '.html', '.js', '.json', '.svg']);
const minimumBytes = 1_024;

async function outputFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? outputFiles(path) : [path];
    }),
  );
  return nested.flat();
}

async function writeCompressedVariant(path, suffix, contents) {
  if (contents.length >= (await stat(path)).size) return false;
  await writeFile(`${path}${suffix}`, contents);
  return true;
}

let sourceBytes = 0;
let brotliBytes = 0;
let gzipBytes = 0;
let compressedFiles = 0;

for (const path of await outputFiles(outputDirectory)) {
  if (!compressibleExtensions.has(extname(path))) continue;
  const source = await readFile(path);
  if (source.length < minimumBytes) continue;

  const [brotliContents, gzipContents] = await Promise.all([
    brotli(source, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
      },
    }),
    gzipFile(source, { level: 9 }),
  ]);
  const [wroteBrotli, wroteGzip] = await Promise.all([
    writeCompressedVariant(path, '.br', brotliContents),
    writeCompressedVariant(path, '.gz', gzipContents),
  ]);
  if (!wroteBrotli && !wroteGzip) continue;
  sourceBytes += source.length;
  brotliBytes += wroteBrotli ? brotliContents.length : source.length;
  gzipBytes += wroteGzip ? gzipContents.length : source.length;
  compressedFiles += 1;
}

process.stdout.write(
  `Precompressed ${compressedFiles} assets (${sourceBytes} bytes -> ${brotliBytes} Brotli / ${gzipBytes} gzip).\n`,
);
