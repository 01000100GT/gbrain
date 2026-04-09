import { VERSION } from '../version.ts';
import { detectInstallMethod } from './upgrade.ts';

interface CheckUpdateResult {
  current_version: string;
  current_source: 'package-json';
  latest_version: string;
  update_available: boolean;
  upgrade_command: string;
  release_url: string;
  changelog_diff: string;
  published_at: string;
  error?: string;
}

export function parseSemver(v: string): [number, number, number] | null {
  const clean = v.replace(/^v/, '');
  const parts = clean.split('.');
  if (parts.length < 3) return null;
  const nums = parts.slice(0, 3).map(Number);
  if (nums.some(isNaN)) return null;
  return nums as [number, number, number];
}

export function isMinorOrMajorBump(current: string, latest: string): boolean {
  const cur = parseSemver(current);
  const lat = parseSemver(latest);
  if (!cur || !lat) return false;
  if (lat[0] > cur[0]) return true;
  if (lat[0] === cur[0] && lat[1] > cur[1]) return true;
  return false;
}

function upgradeCommandForMethod(method: string): string {
  switch (method) {
    case 'bun': return 'bun update gbrain';
    case 'clawhub': return 'clawhub update gbrain';
    case 'binary': return 'Download from https://github.com/garrytan/gbrain/releases';
    default: return 'gbrain upgrade';
  }
}

async function fetchLatestRelease(): Promise<{ tag: string; published_at: string; url: string } | null> {
  try {
    const res = await fetch('https://api.github.com/repos/garrytan/gbrain/releases/latest', {
      headers: { 'User-Agent': `gbrain/${VERSION}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    return {
      tag: data.tag_name || '',
      published_at: data.published_at || '',
      url: data.html_url || '',
    };
  } catch {
    return null;
  }
}

async function fetchChangelog(currentVersion: string, latestVersion: string): Promise<string> {
  try {
    const res = await fetch('https://raw.githubusercontent.com/garrytan/gbrain/master/CHANGELOG.md', {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return '';
    const text = await res.text();
    return extractChangelogBetween(text, currentVersion, latestVersion);
  } catch {
    return '';
  }
}

function extractChangelogBetween(changelog: string, from: string, to: string): string {
  const lines = changelog.split('\n');
  const entries: string[] = [];
  let capturing = false;

  for (const line of lines) {
    const versionMatch = line.match(/^## \[(\d+\.\d+\.\d+(?:\.\d+)?)\]/);
    if (versionMatch) {
      const ver = versionMatch[1];
      if (!capturing) {
        // Start capturing at the latest version (or any version newer than current)
        const verParsed = parseSemver(ver);
        const toParsed = parseSemver(to);
        if (verParsed && toParsed && ver === to) {
          capturing = true;
          entries.push(line);
          continue;
        }
        // Also capture if this version is between from and to
        if (verParsed && toParsed) {
          const fromParsed = parseSemver(from);
          if (fromParsed && (verParsed[0] > fromParsed[0] || verParsed[1] > fromParsed[1] ||
              (verParsed[0] === fromParsed[0] && verParsed[1] === fromParsed[1] && verParsed[2] > fromParsed[2]))) {
            capturing = true;
            entries.push(line);
            continue;
          }
        }
      } else {
        // Stop capturing when we hit the current version or older
        const verParsed = parseSemver(ver);
        const fromParsed = parseSemver(from);
        if (verParsed && fromParsed) {
          if (verParsed[0] < fromParsed[0] ||
              (verParsed[0] === fromParsed[0] && verParsed[1] < fromParsed[1]) ||
              (verParsed[0] === fromParsed[0] && verParsed[1] === fromParsed[1] && verParsed[2] <= fromParsed[2])) {
            break;
          }
        }
        entries.push(line);
        continue;
      }
    }
    if (capturing) {
      entries.push(line);
    }
  }

  return entries.join('\n').trim();
}

export async function runCheckUpdate(args: string[]) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: gbrain check-update [--json]\n\nCheck for new GBrain versions.\n\nOnly reports minor/major version bumps (v0.X.0), not patches.\nFails silently on network errors.');
    return;
  }

  const json = args.includes('--json');
  const method = detectInstallMethod();
  const upgradeCmd = upgradeCommandForMethod(method);

  const release = await fetchLatestRelease();

  if (!release) {
    if (json) {
      console.log(JSON.stringify({
        current_version: VERSION,
        current_source: 'package-json',
        latest_version: '',
        update_available: false,
        upgrade_command: upgradeCmd,
        release_url: '',
        changelog_diff: '',
        published_at: '',
        error: 'no_releases',
      }, null, 2));
    } else {
      console.log(`GBrain ${VERSION} — could not check for updates (no releases found or network unavailable).`);
    }
    return;
  }

  const latestVersion = release.tag.replace(/^v/, '');
  const updateAvailable = isMinorOrMajorBump(VERSION, latestVersion);

  let changelogDiff = '';
  if (updateAvailable) {
    changelogDiff = await fetchChangelog(VERSION, latestVersion);
  }

  const result: CheckUpdateResult = {
    current_version: VERSION,
    current_source: 'package-json',
    latest_version: latestVersion,
    update_available: updateAvailable,
    upgrade_command: upgradeCmd,
    release_url: release.url,
    changelog_diff: changelogDiff,
    published_at: release.published_at,
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (updateAvailable) {
    console.log(`GBrain update available: ${VERSION} → ${latestVersion}`);
    console.log(`Run: ${upgradeCmd}`);
    console.log(`Release: ${release.url}`);
  } else {
    console.log(`GBrain ${VERSION} is up to date.`);
  }
}
