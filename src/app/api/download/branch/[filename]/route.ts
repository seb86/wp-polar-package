import { NextRequest, NextResponse } from "next/server";
import { getPackageBySlug } from "@/lib/packages";
import { getBranchArchiveUrl } from "@/lib/github";
import { extractCredentials, validateLicenseKey } from "@/lib/polar";
import JSZip from "jszip";

/**
 * GET /api/download/branch/{slug}-{branch}.zip
 *
 * Downloads a branch as a ZIP with the root folder renamed to the plugin slug.
 * Premium packages require Polar license key auth via HTTP Basic Auth.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Strip .zip suffix and parse slug + branch
  const base = filename.replace(/\.zip$/i, "");
  const lastDash = base.lastIndexOf("-");
  if (lastDash === -1) {
    return NextResponse.json(
      { error: "Invalid filename format. Expected: {slug}-{branch}.zip" },
      { status: 400 }
    );
  }

  const slug = base.slice(0, lastDash);
  const branch = base.slice(lastDash + 1);

  const pkg = getPackageBySlug(slug);
  if (!pkg) {
    return NextResponse.json(
      { error: "Plugin not found" },
      { status: 404 }
    );
  }

  // Check that branch downloads are enabled for this package
  if (!pkg.branchDownload) {
    return NextResponse.json(
      { error: "Branch downloads are not available for this plugin" },
      { status: 400 }
    );
  }

  // Enforce auth for premium packages
  if (pkg.premium) {
    const credentials = extractCredentials(
      _request.headers.get("Authorization")
    );
    if (!credentials) {
      return new NextResponse("Authentication required", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Plugin Downloads"',
        },
      });
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
    const [owner, repo] = pkg.github.split("/");
    const archiveUrl = getBranchArchiveUrl(owner, repo, branch);

    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "wp-polar-package/1.0",
    };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const response = await fetch(archiveUrl, {
      headers,
      redirect: "follow",
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: `Branch "${branch}" not found` },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "Failed to fetch branch archive from GitHub" },
        { status: 502 }
      );
    }

    // Read the GitHub ZIP into memory
    const originalZipBuffer = await response.arrayBuffer();
    const originalZip = await JSZip.loadAsync(originalZipBuffer);

    // GitHub archives have a root folder like "owner-repo-commitsha/"
    // We need to rename it to just "{slug}/"
    const newZip = new JSZip();
    const entries = Object.keys(originalZip.files);

    // Find the root folder prefix (first path segment of the first entry)
    const rootPrefix = entries[0]?.split("/")[0];
    if (!rootPrefix) {
      return NextResponse.json(
        { error: "Unexpected archive structure" },
        { status: 502 }
      );
    }

    for (const entryPath of entries) {
      const file = originalZip.files[entryPath];
      // Replace the root folder name with the plugin slug
      const newPath = entryPath.replace(rootPrefix, slug);

      if (file.dir) {
        newZip.folder(newPath);
      } else {
        const content = await file.async("uint8array");
        newZip.file(newPath, content);
      }
    }

    // Generate the re-packaged ZIP
    const repackaged = await newZip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    return new NextResponse(repackaged.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${slug}-${branch}.zip"`,
        "Content-Length": String(repackaged.length),
      },
    });
  } catch (error) {
    console.error(`Error downloading branch ${slug}-${branch}:`, error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
