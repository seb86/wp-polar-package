import { NextRequest, NextResponse } from "next/server";
import { extractCredentials, validateLicenseKey } from "@/lib/polar";
import { buildPackagesJson } from "@/lib/github";

/**
 * GET /api/packages.json
 *
 * Composer repository index endpoint.
 * Requires a valid Polar license key via HTTP Basic auth.
 *
 * Auth format:
 * - Username = License key
 * - Password = Site URL
 */
export async function GET(request: NextRequest) {
  const credentials = extractCredentials(
    request.headers.get("authorization")
  );

  if (!credentials) {
    return NextResponse.json(
      { error: "Authentication required. Provide your license key as the username and site URL as the password via HTTP Basic auth." },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Plugin Repository"',
        },
      }
    );
  }

  const { valid } = await validateLicenseKey(credentials.licenseKey);

  if (!valid) {
    return NextResponse.json(
      { error: "Invalid or expired license key." },
      { status: 403 }
    );
  }

  const baseUrl = new URL(request.url).origin;
  const packagesJson = await buildPackagesJson(baseUrl);

  return NextResponse.json(packagesJson, {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
