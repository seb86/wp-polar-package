import { PackageDefinition, packages } from "./packages";
import { gte } from "./semver";

export type ReleaseChannel =
  | "stable"
  | "beta"
  | "rc"
  | "nightly"
  | "prerelease"
  | "all";

export interface GitHubRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string;
  body: string;
  assets: GitHubAsset[];
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
  download_count: number;
}

export interface ResolvedVersion {
  version: string;
  downloadUrl: string;
  assetName: string;
  publishedAt: string;
  body: string;
  downloadCount: number;
  channel: ReleaseChannel;
}

// In-memory cache: package name -> resolved versions
const cache = new Map<
  string,
  { versions: ResolvedVersion[]; timestamp: number }
>();
const CACHE_TTL = parseInt(process.env.GITHUB_CACHE_TTL || "300", 10) * 1000;

// Cache for package.json metadata fetched from repos
const metadataCache = new Map<
  string,
  { metadata: PackageMetadata | null; timestamp: number }
>();

export interface PackageMetadata {
  name?: string;
  version?: string;
  description?: string;
  author?: string;
  author_uri?: string;
  requires?: string;
  tested?: string;
  requires_php?: string;
}

/**
 * Standard GitHub API request headers.
 */
function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "wp-polar-package/1.0",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

/**
 * Strip leading "v" from a tag name to get a clean semver string.
 */
function normalizeVersion(tag: string): string {
  return tag.replace(/^v/i, "");
}

/**
 * Check if an asset name matches the given glob-like pattern.
 * Supports simple "*.zip" style patterns.
 */
function matchesPattern(assetName: string, pattern: string): boolean {
  if (pattern === "*.zip") {
    return assetName.endsWith(".zip");
  }
  const regex = new RegExp(
    "^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$"
  );
  return regex.test(assetName);
}

/**
 * Classify a release into a channel based on its tag name and prerelease flag.
 */
function classifyChannel(
  tag: string,
  prerelease: boolean
): Exclude<ReleaseChannel, "all"> {
  const version = normalizeVersion(tag).toLowerCase();
  if (version.includes("-beta") || version.includes(".beta")) return "beta";
  if (version.includes("-rc") || version.includes(".rc")) return "rc";
  if (version.includes("-nightly") || version.includes(".nightly"))
    return "nightly";
  if (prerelease) return "prerelease";
  return "stable";
}

/**
 * Filter resolved versions by release channel.
 */
export function filterByChannel(
  versions: ResolvedVersion[],
  channel: ReleaseChannel
): ResolvedVersion[] {
  if (channel === "all") return versions;
  if (channel === "stable") {
    return versions.filter((v) => v.channel === "stable");
  }
  // For specific pre-release channels, include stable + that channel
  return versions.filter(
    (v) => v.channel === "stable" || v.channel === channel
  );
}

/**
 * Filter resolved versions by minimum release version.
 */
export function filterByMinRelease(
  versions: ResolvedVersion[],
  minRelease: string
): ResolvedVersion[] {
  const min = normalizeVersion(minRelease);
  return versions.filter((v) => gte(v.version, min));
}

/**
 * Parse the Link header from GitHub API responses for pagination.
 */
function getNextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

/**
 * Fetch releases from a GitHub repository with pagination support.
 * Follows up to `maxPages` pages (default 3 = 150 releases).
 */
async function fetchReleasesFromGitHub(
  pkg: PackageDefinition,
  maxPages = 3
): Promise<ResolvedVersion[]> {
  const headers = githubHeaders();
  const pattern = pkg.assetPattern || "*.zip";
  const versions: ResolvedVersion[] = [];

  let url: string | null =
    `https://api.github.com/repos/${pkg.github}/releases?per_page=50`;
  let page = 0;

  while (url && page < maxPages) {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      console.error(
        `GitHub API error for ${pkg.github}: ${response.status} ${response.statusText}`
      );
      break;
    }

    const releases: GitHubRelease[] = await response.json();
    if (releases.length === 0) break;

    for (const release of releases) {
      if (release.draft) continue;

      // Find matching asset: try pattern first, fall back to first .zip
      let zipAsset = release.assets.find((a) => matchesPattern(a.name, pattern));
      if (!zipAsset) {
        zipAsset = release.assets.find((a) => a.name.endsWith(".zip"));
      }
      if (!zipAsset) continue;

      versions.push({
        version: normalizeVersion(release.tag_name),
        downloadUrl: zipAsset.browser_download_url,
        assetName: zipAsset.name,
        publishedAt: release.published_at,
        body: release.body || "",
        downloadCount: zipAsset.download_count,
        channel: classifyChannel(release.tag_name, release.prerelease),
      });
    }

    url = getNextPageUrl(response.headers.get("Link"));
    page++;
  }

  return versions;
}

/**
 * Get resolved versions for a package, using cache when available.
 */
export async function getVersions(
  pkg: PackageDefinition
): Promise<ResolvedVersion[]> {
  const cached = cache.get(pkg.name);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.versions;
  }

  let versions = await fetchReleasesFromGitHub(pkg);

  // Apply minRelease filter if configured
  if (pkg.minRelease) {
    versions = filterByMinRelease(versions, pkg.minRelease);
  }

  cache.set(pkg.name, { versions, timestamp: Date.now() });
  return versions;
}

/**
 * Find a specific version's download URL for a package.
 */
export async function getVersionDownloadUrl(
  pkg: PackageDefinition,
  version: string
): Promise<string | null> {
  const versions = await getVersions(pkg);
  const match = versions.find((v) => v.version === version);
  return match?.downloadUrl ?? null;
}

/**
 * Find a specific version's download URL, trying both with and without "v" prefix.
 */
export async function getVersionDownloadUrlWithFallback(
  pkg: PackageDefinition,
  version: string
): Promise<{ downloadUrl: string; assetName: string } | null> {
  const versions = await getVersions(pkg);

  // Try exact match first, then with/without v prefix
  const candidates = [version, `v${version}`, version.replace(/^v/i, "")];
  for (const v of candidates) {
    const normalized = normalizeVersion(v);
    const match = versions.find((ver) => ver.version === normalized);
    if (match) {
      return { downloadUrl: match.downloadUrl, assetName: match.assetName };
    }
  }

  return null;
}

/**
 * Build the Composer packages.json response body.
 * Fetches releases from GitHub for all registered packages.
 */
export async function buildPackagesJson(baseUrl: string): Promise<object> {
  const packagesMap: Record<string, Record<string, object>> = {};

  const results = await Promise.all(
    packages.map(async (pkg) => {
      const versions = await getVersions(pkg);
      // Only include stable releases in the Composer index
      const stable = filterByChannel(versions, "stable");
      return { pkg, versions: stable };
    })
  );

  for (const { pkg, versions } of results) {
    if (versions.length === 0) continue;

    const versionMap: Record<string, object> = {};
    for (const ver of versions) {
      versionMap[ver.version] = {
        name: pkg.name,
        version: ver.version,
        description: pkg.description,
        type: pkg.type,
        license: [pkg.license],
        require: {
          ...(pkg.requiresPhp ? { php: `>=${pkg.requiresPhp}` } : {}),
        },
        dist: {
          url: `${baseUrl}/api/dist/${pkg.name}/${ver.version}`,
          type: "zip",
        },
      };
    }

    packagesMap[pkg.name] = versionMap;
  }

  return { packages: packagesMap };
}

/**
 * Fetch package.json metadata from a GitHub repo at a specific tag.
 * Returns parsed metadata or null if not found.
 */
export async function fetchPackageMetadata(
  owner: string,
  repo: string,
  tag: string
): Promise<PackageMetadata | null> {
  const cacheKey = `${owner}/${repo}@${tag}`;
  const cached = metadataCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.metadata;
  }

  try {
    const headers = githubHeaders();
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/package.json?ref=${tag}`,
      { headers }
    );

    if (!response.ok) {
      metadataCache.set(cacheKey, { metadata: null, timestamp: Date.now() });
      return null;
    }

    const data = await response.json();
    const content = atob(data.content);
    const metadata: PackageMetadata = JSON.parse(content);

    metadataCache.set(cacheKey, { metadata, timestamp: Date.now() });
    return metadata;
  } catch {
    metadataCache.set(cacheKey, { metadata: null, timestamp: Date.now() });
    return null;
  }
}

/**
 * Get the GitHub zipball URL for a branch.
 */
export function getBranchArchiveUrl(
  owner: string,
  repo: string,
  branch: string
): string {
  return `https://api.github.com/repos/${owner}/${repo}/zipball/${branch}`;
}
