/**
 * Lightweight semver comparison utilities.
 * Handles versions in "major.minor.patch" format with optional pre-release suffixes.
 */

/**
 * Parse a version string into comparable parts.
 * Strips leading "v" and splits on "." and "-".
 */
function parseParts(version: string): { nums: number[]; pre: string | null } {
  const cleaned = version.replace(/^v/i, "");
  const [core, ...preParts] = cleaned.split("-");
  const nums = core.split(".").map((n) => parseInt(n, 10) || 0);
  // Pad to at least 3 parts
  while (nums.length < 3) nums.push(0);
  return { nums, pre: preParts.length > 0 ? preParts.join("-") : null };
}

/**
 * Compare two version strings.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 * Pre-release versions sort before their release counterpart (1.0.0-beta < 1.0.0).
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseParts(a);
  const pb = parseParts(b);

  for (let i = 0; i < Math.max(pa.nums.length, pb.nums.length); i++) {
    const diff = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (diff !== 0) return diff;
  }

  // If numeric parts are equal, a version without pre-release is greater
  if (pa.pre === null && pb.pre !== null) return 1;
  if (pa.pre !== null && pb.pre === null) return -1;
  if (pa.pre !== null && pb.pre !== null) {
    return pa.pre.localeCompare(pb.pre);
  }

  return 0;
}

/**
 * Check if `version` is greater than or equal to `minimum`.
 */
export function gte(version: string, minimum: string): boolean {
  return compareVersions(version, minimum) >= 0;
}
