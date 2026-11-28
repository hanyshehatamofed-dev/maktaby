import { defineConfig } from 'vite';
import {
  resolve,
  basename,
  relative,
  sep
} from 'node:path';
import { createHash } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = resolve(projectRoot, 'dist');

function minifiedClassicAssetUrls() {
  return {
    name: 'maktaby-minified-classic-asset-urls',
    apply: 'build',
    enforce: 'pre',

    load(id) {
      if (!id.includes('?url')) return null;

      const sourcePath = id.split('?')[0];

      if (
        !sourcePath.includes('/src/js/') ||
        !sourcePath.endsWith('.js')
      ) {
        return null;
      }

      const source = readFileSync(sourcePath, 'utf8');

      const minified = transformSync(source, { loader: 'js', target: 'es2020', minify: true, legalComments: 'none' }).code;

      const referenceId = this.emitFile({
        type: 'asset',
        name: basename(sourcePath),
        source: minified
      });

return 'export default import.meta.ROLLUP_FILE_URL_' + referenceId + ';';    }
  };
}

function listFiles(directory) {
  if (!existsSync(directory)) return [];

  const result = [];

  for (const entry of readdirSync(directory)) {
    const fullPath = resolve(directory, entry);
    const info = statSync(fullPath);

    if (info.isDirectory()) {
      result.push(...listFiles(fullPath));
    } else if (info.isFile()) {
      result.push(fullPath);
    }
  }

  return result;
}

function generatedServiceWorker() {
  return {
    name: 'maktaby-generated-service-worker',
    apply: 'build',

    writeBundle() {
      const files = listFiles(outputDir);

      const relativeFiles = files.map(file =>
        relative(outputDir, file).split(sep).join('/')
      );

      const available = new Set(relativeFiles);
      const core = new Set();

      function addFile(relativePath) {
        const normalized = relativePath
          .replace(/^\/+/, '')
          .split('?')[0];

        if (available.has(normalized)) {
          core.add(normalized);
        }
      }

      [
        'index.html',
        'track.html',
        'manifest.json'
      ].forEach(addFile);

      for (const page of ['index.html', 'track.html']) {
        const pagePath = resolve(outputDir, page);

        if (!existsSync(pagePath)) continue;

        const html = readFileSync(pagePath, 'utf8');

        const references = html.matchAll(
          /(?:src|href)=["']([^"']+)["']/gi
        );

        for (const match of references) {
          const value = match[1];

          if (
            !value.startsWith('/') ||
            value.startsWith('//')
          ) {
            continue;
          }

          addFile(value);
        }
      }

      const manifestPath = resolve(outputDir, 'manifest.json');

      if (existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(
            readFileSync(manifestPath, 'utf8')
          );

          for (const icon of manifest.icons || []) {
            if (icon.src?.startsWith('/')) {
              addFile(icon.src);
            }
          }
        } catch (error) {
throw new Error(
  'Invalid PWA manifest: ' + error.message
);
        }
      }

      for (const file of relativeFiles) {
        const name = basename(file);

        if (
          /^renderer-[^/]+\.js$/.test(name) ||
          /^maktaby-(?:store|offline-sync|task-archive|weekly-overview)-[^/]+\.js$/.test(name) ||
          /^maktaby-office-extras-[^/]+\.js$/.test(name) ||
          /^maktaby-approved-logo\.[^/]+\.(png|webp|svg)$/.test(name) ||
          /^dashboard-hero-reference-[^/]+\.webp$/.test(name)
        ) {
          addFile(file);
        }
      }

const precache = [...core]
  .sort()
  .map(file => '/' + file);
      for (const url of precache) {
        const diskPath = resolve(
          outputDir,
          url.replace(/^\/+/, '')
        );

        if (
          !existsSync(diskPath) ||
          !statSync(diskPath).isFile()
        ) {
          throw new Error(
            `Service Worker precache file missing: ${url}`
          );
        }
      }

      const hash = createHash('sha256');

      for (const url of precache) {
        const diskPath = resolve(
          outputDir,
          url.replace(/^\/+/, '')
        );

        hash.update(url);
        hash.update(readFileSync(diskPath));
      }

      const buildId = hash.digest('hex').slice(0, 16);

      const templatePath = resolve(projectRoot, 'src/sw.js');
      const template = readFileSync(templatePath, 'utf8');

      if (
        !template.includes('__MAKTABY_BUILD_ID__') ||
        !template.includes('__MAKTABY_PRECACHE__')
      ) {
        throw new Error(
          'Service Worker template placeholders are missing.'
        );
      }

      const worker = template
        .replaceAll('__MAKTABY_BUILD_ID__', buildId)
        .replace(
          '__MAKTABY_PRECACHE__',
          JSON.stringify(precache)
        );

      writeFileSync(
        resolve(outputDir, 'sw.js'),
        worker,
        'utf8'
      );

      console.log('\nMAKTABY SERVICE WORKER PRECACHE');

      for (const url of precache) {
        console.log('PASS', url);
      }

      console.log(`Build ID: ${buildId}`);
      console.log(`Precached files: ${precache.length}\n`);
    }
  };
}

export default defineConfig({
  root: resolve(projectRoot, 'src'),
  base: '/',
  publicDir: resolve(projectRoot, 'public'),

  plugins: [
    minifiedClassicAssetUrls(),
    generatedServiceWorker()
  ],

  build: {
    outDir: outputDir,
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',

    rollupOptions: {
      input: {
        app: resolve(projectRoot, 'src/index.html'),
        track: resolve(projectRoot, 'src/track.html')
      }
    }
  }
});
