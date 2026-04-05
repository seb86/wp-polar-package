import { Polar } from "@polar-sh/sdk";

// Server-side Polar client (requires POLAR_ACCESS_TOKEN)
export const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN,
});

// In-memory cache for license validation results
const validationCache = new Map<
  string,
  { valid: boolean; benefitId?: string; timestamp: number }
>();

const CACHE_TTL = parseInt(process.env.LICENSE_CACHE_TTL || "300", 10) * 1000;

/**
 * Validate a Polar license key against the organization.
 * Returns the validated license key data if valid, or null if invalid.
 */
export async function validateLicenseKey(
  key: string
): Promise<{ valid: boolean; benefitId?: string }> {
  // Check cache first
  const cached = validationCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { valid: cached.valid, benefitId: cached.benefitId };
  }

  try {
    const result = await polar.customerPortal.licenseKeys.validate({
      key,
      organizationId: process.env.POLAR_ORGANIZATION_ID!,
    });

    const entry = {
      valid: result.status === "granted",
      benefitId: result.benefitId,
      timestamp: Date.now(),
    };
    validationCache.set(key, entry);
    return { valid: entry.valid, benefitId: entry.benefitId };
  } catch (error) {
    console.error("License key validation failed:", error);
    const entry = { valid: false, timestamp: Date.now() };
    validationCache.set(key, entry);
    return { valid: false };
  }
}

/**
 * Extract credentials from HTTP Basic auth header.
 *
 * Following the ACF Pro convention:
 * - Username = Polar license key
 * - Password = Site URL where the plugin will be used
 */
export function extractCredentials(
  authHeader: string | null
): { licenseKey: string; siteUrl: string } | null {
  if (!authHeader?.startsWith("Basic ")) {
    return null;
  }

  try {
    const decoded = atob(authHeader.slice(6));
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) return null;

    const licenseKey = decoded.slice(0, colonIndex);
    const siteUrl = decoded.slice(colonIndex + 1);

    if (!licenseKey) return null;

    return { licenseKey, siteUrl: siteUrl || "" };
  } catch {
    return null;
  }
}
