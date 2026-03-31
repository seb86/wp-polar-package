import { NextRequest, NextResponse } from "next/server";
import { extractCredentials, validateLicenseKey } from "@/lib/polar";
import { getPackage } from "@/lib/packages";
import { getVersionDownloadUrl } from "@/lib/github";

/**
 * GET /api/dist/:vendor/:package/:version
 *
 * Download a premium plugin zip file.
 * Validates the license key, then redirects to the GitHub release asset.
 *
 * Auth format:
 * - Username = License key
 * - Password = Site URL
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ vendor: string; package: string; version: string }> }
) {
  const { vendor, package: pkg, version } = await params;
  const packageName = `${vendor}/${pkg}`;

  // Authenticate
  const credentials = extractCredentials(
    request.headers.get("authorization")
  );

  if (!credentials) {
    return NextResponse.json(
      { error: "Authentication required." },
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

  // Look up the package
  const pkgDef = getPackage(packageName);

  if (!pkgDef) {
    return NextResponse.json(
      { error: `Package ${packageName} not found.` },
      { status: 404 }
    );
  }

  // Get the download URL from GitHub releases
  const downloadUrl = await getVersionDownloadUrl(pkgDef, version);

  if (!downloadUrl) {
    return NextResponse.json(
      { error: `Version ${version} not found for ${packageName}.` },
      { status: 404 }
    );
  }

  // For private repos, we need to proxy the download with the GitHub token.
  // For public repos, a redirect would suffice.
  if (process.env.GITHUB_TOKEN) {
    const response = await fetch(downloadUrl, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/octet-stream",
        "User-Agent": "wp-polar-package/1.0",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      console.error(`GitHub download failed: ${response.status}`);
      return NextResponse.json(
        { error: "Failed to retrieve download." },
        { status: 502 }
      );
    }

    return new NextResponse(response.body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${pkg}-${version}.zip"`,
      },
    });
  }

  // Public repo — redirect directly to GitHub
  return NextResponse.redirect(downloadUrl, 302);
}
