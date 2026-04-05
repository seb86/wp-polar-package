import { NextRequest, NextResponse } from "next/server";
import { getPackageBySlug } from "@/lib/packages";
import { getVersionDownloadUrlWithFallback } from "@/lib/github";
import { extractCredentials, validateLicenseKey } from "@/lib/polar";

/**
 * GET /api/download/release/{slug}-{version}.zip
 *
 * Downloads a plugin release ZIP.
 * Premium packages require Polar license key auth via HTTP Basic Auth.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Strip .zip suffix and parse slug + version
  const base = filename.replace(/\.zip$/i, "");
  const lastDash = base.lastIndexOf("-");
  if (lastDash === -1) {
    return NextResponse.json(
      { error: "Invalid filename format. Expected: {slug}-{version}.zip" },
      { status: 400 }
    );
  }

  const slug = base.slice(0, lastDash);
  const version = base.slice(lastDash + 1);

  const pkg = getPackageBySlug(slug);
  if (!pkg) {
    return NextResponse.json(
      { error: "Plugin not found" },
      { status: 404 }
    );
  }

  // Enforce auth for premium packages
  if (pkg.premium) {
    const credentials = extractCredentials(
      _request.headers.get("Authorization")
    );
    if (!credentials) {
      return NextResponse.json(
        { error: "License key required" },
        { status: 403 }
      );
    }

    const validation = await validateLicenseKey(credentials.licenseKey);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Invalid or expired license key" },
        { status: 403 }
      );
    }
  }

  try {
    const result = await getVersionDownloadUrlWithFallback(pkg, version);
    if (!result) {
      return NextResponse.json(
        { error: `Version ${version} not found for ${slug}` },
        { status: 404 }
      );
    }

    // Proxy the download if we have a GitHub token (for private repos),
    // otherwise redirect directly
    if (process.env.GITHUB_TOKEN) {
      const assetResponse = await fetch(result.downloadUrl, {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: "application/octet-stream",
          "User-Agent": "wp-polar-package/1.0",
        },
        redirect: "follow",
      });

      if (!assetResponse.ok) {
        return NextResponse.json(
          { error: "Failed to fetch release asset from GitHub" },
          { status: 502 }
        );
      }

      return new NextResponse(assetResponse.body, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${slug}-${version}.zip"`,
          ...(assetResponse.headers.get("Content-Length")
            ? { "Content-Length": assetResponse.headers.get("Content-Length")! }
            : {}),
        },
      });
    }

    // Public repo: redirect to GitHub
    return NextResponse.redirect(result.downloadUrl, 302);
  } catch (error) {
    console.error(`Error downloading release ${slug}-${version}:`, error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
