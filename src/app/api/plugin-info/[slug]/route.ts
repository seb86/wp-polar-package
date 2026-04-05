import { NextRequest, NextResponse } from "next/server";
import { getPackageBySlug } from "@/lib/packages";
import {
  getVersions,
  filterByChannel,
  fetchPackageMetadata,
  ReleaseChannel,
} from "@/lib/github";
import { markdownToHtml } from "@/lib/markdown";
import { extractCredentials, validateLicenseKey } from "@/lib/polar";

function formatWordPressDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  let hours = date.getUTCHours();
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;
  return `${year}-${month}-${day} ${hours}:${minutes}${ampm} GMT`;
}

/**
 * GET /api/plugin-info/{slug}
 *
 * Returns WordPress-compatible plugin information JSON.
 * Public endpoint — no authentication required.
 *
 * Query params:
 *   tag     - specific version to highlight (default: latest)
 *   channel - release channel filter: stable|beta|rc|nightly|prerelease|all (default: stable)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug: rawSlug } = await params;

  // Strip .json suffix if present
  const slug = rawSlug.replace(/\.json$/i, "");

  const pkg = getPackageBySlug(slug);
  if (!pkg) {
    return NextResponse.json(
      { error: "Plugin not found" },
      { status: 404 }
    );
  }

  // Check if license key grants access to premium downloads
  let hasDownloadAccess = !pkg.premium;
  if (pkg.premium && pkg.benefitId) {
    const credentials = extractCredentials(
      request.headers.get("Authorization")
    );
    const licenseKeyValue =
      credentials?.licenseKey ||
      request.nextUrl.searchParams.get("license_key");

    if (licenseKeyValue) {
      const validation = await validateLicenseKey(licenseKeyValue);
      if (validation.valid && validation.benefitId === pkg.benefitId) {
        hasDownloadAccess = true;
      }
    }
  }

  const searchParams = request.nextUrl.searchParams;
  const requestedTag = searchParams.get("tag");
  const licenseKey = searchParams.get("license_key");
  const channel = (searchParams.get("channel") || "stable") as ReleaseChannel;

  const validChannels: ReleaseChannel[] = [
    "stable",
    "beta",
    "rc",
    "nightly",
    "prerelease",
    "all",
  ];
  if (!validChannels.includes(channel)) {
    return NextResponse.json(
      { error: `Invalid channel. Valid options: ${validChannels.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const allVersions = await getVersions(pkg);
    const filtered = filterByChannel(allVersions, channel);

    if (filtered.length === 0) {
      return NextResponse.json(
        { error: "No releases found" },
        { status: 404 }
      );
    }

    // Determine the target version
    let target = filtered[0]; // Latest by default (GitHub returns newest first)
    if (requestedTag) {
      const cleanTag = requestedTag.replace(/^v/i, "");
      const found = filtered.find((v) => v.version === cleanTag);
      if (!found) {
        return NextResponse.json(
          { error: `Version ${requestedTag} not found` },
          { status: 404 }
        );
      }
      target = found;
    }

    // Fetch package.json metadata from the repo at the target tag
    const [owner, repo] = pkg.github.split("/");
    const metadata = await fetchPackageMetadata(
      owner,
      repo,
      `v${target.version}`
    );

    const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const licenseParam = licenseKey
      ? `?license_key=${encodeURIComponent(licenseKey)}`
      : "";

    // Build changelog from all filtered release bodies
    const changelog = filtered
      .filter((v) => v.body)
      .map((v) => `## ${v.version}\n\n${v.body}`)
      .join("\n\n");

    // Build versions map
    const versionsMap: Record<string, string | null> = {};
    for (const v of filtered) {
      versionsMap[v.version] = hasDownloadAccess
        ? `${baseUrl}/api/download/release/${slug}-${v.version}.zip${licenseParam}`
        : null;
    }

    // Build branches map
    const branches: Record<string, string | null> = {};
    if (pkg.branchDownload) {
      branches[pkg.branchDownload] = hasDownloadAccess
        ? `${baseUrl}/api/download/branch/${slug}-${pkg.branchDownload}.zip${licenseParam}`
        : null;
    }

    // Total download count across all versions
    const totalDownloads = filtered.reduce(
      (sum, v) => sum + v.downloadCount,
      0
    );

    const pluginName = metadata?.name || pkg.description.split(" - ")[0] || slug;
    const description = metadata?.description || pkg.description;

    const response = {
      name: pluginName,
      slug,
      version: target.version,
      author: metadata?.author
        ? `<a href="${metadata.author_uri || "#"}">${metadata.author}</a>`
        : undefined,
      author_profile: metadata?.author_uri || undefined,
      requires: metadata?.requires || undefined,
      tested: metadata?.tested || undefined,
      requires_php: metadata?.requires_php || pkg.requiresPhp || undefined,
      download_link: hasDownloadAccess
        ? `${baseUrl}/api/download/release/${slug}-${target.version}.zip${licenseParam}`
        : null,
      last_updated: target.publishedAt
        ? formatWordPressDate(new Date(target.publishedAt))
        : undefined,
      download_count: totalDownloads,
      sections: {
        description: `<p>${description}</p>`,
        changelog: changelog ? markdownToHtml(changelog) : "",
      },
      versions: versionsMap,
      ...(Object.keys(branches).length > 0 ? { branches } : {}),
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (error) {
    console.error(`Error fetching plugin info for ${slug}:`, error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
