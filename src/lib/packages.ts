/**
 * Package registry for WordPress plugins.
 *
 * Polar.sh handles license key validation for premium packages.
 * Plugin releases are pulled automatically from each package's GitHub repository.
 */

export interface PackageDefinition {
  /** Composer package name (vendor/package) */
  name: string;
  /** WordPress plugin slug (e.g. "my-plugin") */
  slug: string;
  /** Human-readable description */
  description: string;
  /** Package type for composer/installers */
  type: "wordpress-plugin";
  /** License identifier */
  license: string;
  /** GitHub repository in "owner/repo" format */
  github: string;
  /** Glob pattern to match the zip asset in a release (default: "*.zip") */
  assetPattern?: string;
  /** PHP minimum version */
  requiresPhp?: string;
  /** Minimum release version — versions below this are excluded */
  minRelease?: string;
  /** Default branch name for branch downloads (e.g. "trunk"). If unset, branch downloads are disabled. */
  branchDownload?: string;
  /** If true, download endpoints require Polar license key auth */
  premium?: boolean;
}

/**
 * Registry of WordPress plugin packages.
 *
 * To add a new package:
 * 1. Create releases on the GitHub repo with a zip asset attached
 * 2. Add an entry below pointing to the repo
 *
 * Versions are fetched automatically from GitHub releases.
 */
export const packages: PackageDefinition[] = [
  // Example: a free plugin with branch download enabled
  {
    name: "acme/acme-plugin",
    slug: "acme-plugin",
    description: "Acme Plugin - Example free WordPress plugin",
    type: "wordpress-plugin",
    license: "GPL-3.0+",
    github: "acme-org/acme-plugin",
    assetPattern: "*.zip",
    requiresPhp: "7.4",
    branchDownload: "main",
  },
  // Example: a premium plugin requiring a Polar license key
  {
    name: "acme/acme-pro",
    slug: "acme-pro",
    description: "Acme Pro - Example premium WordPress plugin",
    type: "wordpress-plugin",
    license: "GPL-3.0+",
    github: "acme-org/acme-pro",
    assetPattern: "*.zip",
    requiresPhp: "7.4",
    premium: true,
  },
];

/**
 * Find a package definition by its Composer name.
 */
export function getPackage(name: string): PackageDefinition | undefined {
  return packages.find((pkg) => pkg.name === name);
}

/**
 * Find a package definition by its WordPress plugin slug.
 */
export function getPackageBySlug(slug: string): PackageDefinition | undefined {
  return packages.find((pkg) => pkg.slug === slug);
}
