# WP Polar Package

A self-hosted WordPress plugin repository server with Composer support. Authenticate customers with [Polar.sh](https://polar.sh) license keys and distribute plugin releases hosted on GitHub — including private repositories.

## How it works

1. Plugin versions are discovered automatically from GitHub releases
2. Customers authenticate with their Polar license key via HTTP Basic Auth or URL query parameter
3. The server validates the license key against Polar.sh
4. Composer receives the package index and downloads plugin ZIPs
5. WordPress can check for plugin updates via the plugin-info endpoint
6. Private repo assets are proxied through the server using a GitHub token

## Features

- **Composer private repository** — `packages.json` endpoint with license key auth
- **WordPress plugin updates** — Plugin info endpoint compatible with the WordPress update checker
- **Private GitHub repos** — Proxied asset downloads with token-based authentication
- **Release channels** — Filter by `stable`, `beta`, `rc`, `nightly`, `prerelease`, or `all`
- **Branch downloads** — Download development branches as properly-packaged ZIPs (root folder renamed to plugin slug)
- **Premium + free** — Enforce license auth only on premium packages; free packages are public
- **License key via URL** — Pass `?license_key=` as an alternative to HTTP Basic Auth headers
- **Caching** — In-memory caching for both GitHub API responses and Polar license validations

## Requirements

- **Node.js** 20+ (required by Next.js)
- **npm** (for dependency management)
- A **[Polar.sh](https://polar.sh) account** with:
  - An organization created
  - A product with a license key benefit configured
  - Your **Organization ID** (found in the Polar dashboard)
  - An **API access token** with no additional scopes required (created at https://polar.sh/settings)
- A **GitHub account** with:
  - Repositories containing tagged releases with `.zip` assets attached
  - A **Personal Access Token** with `repo` scope (required for private repositories, optional for public)

## Getting started

### 1. Clone this repository

```bash
git clone https://github.com/your-org/wp-polar-package.git
cd wp-polar-package
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy `.env.example` to `.env` and fill in your values:

```env
# Polar.sh Configuration (required)
# Organization ID from Polar dashboard
POLAR_ORGANIZATION_ID=your-organization-id

# API access token from: https://polar.sh/settings
POLAR_ACCESS_TOKEN=your-polar-access-token

# GitHub Configuration
# Personal access token with repo read access (required for private repos)
GITHUB_TOKEN=your-github-token

# Optional: Cache TTL in seconds (default: 300 = 5 minutes)
# LICENSE_CACHE_TTL=300
# GITHUB_CACHE_TTL=300
```

| Variable | Required | Description |
|----------|----------|-------------|
| `POLAR_ORGANIZATION_ID` | Yes | Your Polar.sh organization ID |
| `POLAR_ACCESS_TOKEN` | Yes | Polar API access token |
| `GITHUB_TOKEN` | For private repos | GitHub personal access token with `repo` scope |
| `LICENSE_CACHE_TTL` | No | License validation cache in seconds (default: `300`) |
| `GITHUB_CACHE_TTL` | No | GitHub releases cache in seconds (default: `300`) |

### 4. Add your packages

Edit `src/lib/packages.ts` to register your plugins:

```ts
export const packages: PackageDefinition[] = [
  {
    name: "your-vendor/your-plugin",   // Composer package name
    slug: "your-plugin",               // WordPress plugin slug
    description: "My awesome plugin",
    type: "wordpress-plugin",
    license: "GPL-3.0+",
    github: "your-org/your-repo",      // GitHub owner/repo
    assetPattern: "*.zip",             // Glob pattern for release assets (default: "*.zip")
    requiresPhp: "7.4",               // Minimum PHP version (optional)
    premium: true,                     // Require Polar license key for downloads (optional)
    benefitID: 'benefit-id-goes-here'  // Polar benefit ID required to access this package (only if required)
    branchDownload: "main",            // Enable branch downloads for this branch (optional)
    minRelease: "2.0.0",              // Exclude versions below this (optional)
  },
];
```

#### Package definition options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Composer package name in `vendor/package` format |
| `slug` | `string` | Yes | WordPress plugin slug (used in URLs and update checks) |
| `description` | `string` | Yes | Human-readable plugin description |
| `type` | `string` | Yes | Must be `"wordpress-plugin"` |
| `license` | `string` | Yes | License identifier (e.g. `"GPL-3.0+"`) |
| `github` | `string` | Yes | GitHub repository in `owner/repo` format |
| `assetPattern` | `string` | No | Glob pattern to match ZIP assets in releases (default: `"*.zip"`) |
| `requiresPhp` | `string` | No | Minimum PHP version requirement |
| `minRelease` | `string` | No | Exclude releases below this version |
| `branchDownload` | `string` | No | Branch name to enable branch ZIP downloads (e.g. `"main"`, `"trunk"`) |
| `premium` | `boolean` | No | When `true`, download endpoints require a valid Polar license key |
| `benefitID` | `string` | No | Only if required |

### 5. Run locally

```bash
npm run dev
```

### 6. Build for production

```bash
npm run build
npm start
```

### 7. Deploy

Deploy to any Node.js host (Vercel, Sevalla, Railway, etc.) and set the environment variables in the hosting dashboard.

## API endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /packages.json` | License key (Basic Auth) | Composer package index |
| `GET /dist/:vendor/:package/:version` | License key (Basic Auth) | Composer dist download (proxied for private repos) |
| `GET /plugin-info/{slug}.json` | Public | WordPress plugin info JSON |
| `GET /download/release/{slug}-{version}.zip` | Premium only | Download a release ZIP |
| `GET /download/branch/{slug}-{branch}.zip` | Premium only | Download a branch ZIP |

### Plugin info query parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `tag` | Latest | Request info for a specific version |
| `channel` | `stable` | Filter releases: `stable`, `beta`, `rc`, `nightly`, `prerelease`, `all` |
| `license_key` | — | Polar license key; when provided, download links in the response include it as a query parameter |

### Download query parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `license_key` | — | Polar license key (alternative to HTTP Basic Auth for premium packages) |

### Authentication methods

Premium download endpoints accept authentication in two ways:

1. **HTTP Basic Auth** (recommended for Composer and server-side use)
   - Username: Polar license key
   - Password: Site URL
2. **URL query parameter** (useful for WordPress update integration)
   - Append `?license_key=YOUR_KEY` to the download URL

The plugin-info endpoint is always public. When a `license_key` is passed to the plugin-info endpoint, all download links in the response automatically include the key as a query parameter.

## Customer setup (Composer)

Customers add the repository to their project:

```json
// composer.json
{
  "repositories": [
    {
      "type": "composer",
      "url": "https://your-domain.com/api"
    }
  ],
  "require": {
    "your-vendor/your-plugin": "^1.0"
  }
}
```

```json
// auth.json (do not commit this file)
{
  "http-basic": {
    "your-domain.com": {
      "username": "YOUR_POLAR_LICENSE_KEY",
      "password": "https://yoursite.com"
    }
  }
}
```

- **username** = Polar license key
- **password** = Site URL where the plugin will be used

Then run:

```bash
composer install
```

## WordPress plugin update integration

To enable automatic update checks from the WordPress admin, add the following to your plugin's main PHP file. This hooks into WordPress's built-in update system and points it at your `/plugin-info/{slug}` endpoint.

### Example implementation

```php
<?php
/**
 * Custom update checker for plugins hosted on WP Polar Package.
 *
 * Drop this into your plugin's main file or load it from a separate file.
 * Replace the constants with your own values.
 */

// Configuration — change these to match your setup.
define( 'MY_PLUGIN_SLUG', 'your-plugin' );
define( 'MY_PLUGIN_FILE', __FILE__ ); // Path to the main plugin file.
define( 'MY_PLUGIN_API_URL', 'https://your-domain.com/plugin-info/' . MY_PLUGIN_SLUG );

/**
 * Check for plugin updates.
 *
 * Hooks into the `update_plugins` site transient to inject update info
 * from the custom repository.
 *
 * @param object $transient The update_plugins transient value.
 * @return object Modified transient with update data if available.
 */
function my_plugin_check_for_updates( $transient ) {
    if ( empty( $transient->checked ) ) {
        return $transient;
    }

    $plugin_basename = plugin_basename( MY_PLUGIN_FILE );
    $current_version = $transient->checked[ $plugin_basename ] ?? '';

    if ( empty( $current_version ) ) {
        return $transient;
    }

    // Build the API URL. For premium plugins, append the license key.
    $api_url = MY_PLUGIN_API_URL;
    $license_key = get_option( 'my_plugin_license_key', '' );
    if ( ! empty( $license_key ) ) {
        $api_url = add_query_arg( 'license_key', $license_key, $api_url );
    }

    // Query the plugin info API.
    $response = wp_remote_get( $api_url, array(
        'timeout' => 15,
        'headers' => array(
            'Accept' => 'application/json',
        ),
    ) );

    if ( is_wp_error( $response ) || wp_remote_retrieve_response_code( $response ) !== 200 ) {
        return $transient;
    }

    $plugin_info = json_decode( wp_remote_retrieve_body( $response ) );

    if ( empty( $plugin_info->version ) ) {
        return $transient;
    }

    // Compare versions — only offer an update if the remote version is newer.
    if ( version_compare( $plugin_info->version, $current_version, '>' ) ) {
        $update = (object) array(
            'slug'        => MY_PLUGIN_SLUG,
            'plugin'      => $plugin_basename,
            'new_version' => $plugin_info->version,
            'url'         => $plugin_info->author_profile ?? '',
            'package'     => $plugin_info->download_link,
            'tested'      => $plugin_info->tested ?? '',
            'requires'    => $plugin_info->requires ?? '',
            'requires_php'=> $plugin_info->requires_php ?? '',
        );

        $transient->response[ $plugin_basename ] = $update;
    }

    return $transient;
}
add_filter( 'site_transient_update_plugins', 'my_plugin_check_for_updates' );

/**
 * Display plugin details in the update modal.
 *
 * When a user clicks "View version x.x.x details" in the WordPress admin,
 * this serves the full plugin information from the custom API.
 *
 * @param false|object|array $result The result object or array. Default false.
 * @param string             $action The API action being performed.
 * @param object             $args   Plugin API arguments.
 * @return false|object Plugin info object or false to use default behavior.
 */
function my_plugin_info_screen( $result, $action, $args ) {
    if ( $action !== 'plugin_information' || $args->slug !== MY_PLUGIN_SLUG ) {
        return $result;
    }

    $api_url = MY_PLUGIN_API_URL;
    $license_key = get_option( 'my_plugin_license_key', '' );
    if ( ! empty( $license_key ) ) {
        $api_url = add_query_arg( 'license_key', $license_key, $api_url );
    }

    $response = wp_remote_get( $api_url, array(
        'timeout' => 15,
        'headers' => array(
            'Accept' => 'application/json',
        ),
    ) );

    if ( is_wp_error( $response ) || wp_remote_retrieve_response_code( $response ) !== 200 ) {
        return $result;
    }

    $plugin_info = json_decode( wp_remote_retrieve_body( $response ) );

    if ( empty( $plugin_info->name ) ) {
        return $result;
    }

    // Map the API response to the format WordPress expects.
    return (object) array(
        'name'          => $plugin_info->name,
        'slug'          => $plugin_info->slug,
        'version'       => $plugin_info->version,
        'author'        => $plugin_info->author ?? '',
        'author_profile'=> $plugin_info->author_profile ?? '',
        'requires'      => $plugin_info->requires ?? '',
        'tested'        => $plugin_info->tested ?? '',
        'requires_php'  => $plugin_info->requires_php ?? '',
        'download_link' => $plugin_info->download_link,
        'last_updated'  => $plugin_info->last_updated ?? '',
        'sections'      => array(
            'description' => $plugin_info->sections->description ?? '',
            'changelog'   => $plugin_info->sections->changelog ?? '',
        ),
    );
}
add_filter( 'plugins_api', 'my_plugin_info_screen', 10, 3 );
```

### Premium plugins — license key auth

For premium plugins, the example above automatically appends the license key to the plugin-info URL. The server then includes the license key in all download links returned in the response, so WordPress can download the ZIP without needing separate auth headers.

Store the license key in your plugin's settings:

```php
update_option( 'my_plugin_license_key', $key );
```

Alternatively, if you prefer to use HTTP Basic Auth headers for downloads instead of URL parameters, add this filter:

```php
/**
 * Inject license key auth into the download request for premium plugins.
 *
 * @param array  $parsed_args HTTP request arguments.
 * @param string $url         The request URL.
 * @return array Modified request arguments with auth header.
 */
function my_plugin_inject_download_auth( $parsed_args, $url ) {
    // Only add auth to download requests for our plugin.
    if ( strpos( $url, 'your-domain.com/download/' ) === false ) {
        return $parsed_args;
    }

    $license_key = get_option( 'my_plugin_license_key', '' );
    $site_url    = home_url();

    if ( ! empty( $license_key ) ) {
        $parsed_args['headers']['Authorization'] = 'Basic ' . base64_encode(
            $license_key . ':' . $site_url
        );
    }

    return $parsed_args;
}
add_filter( 'http_request_args', 'my_plugin_inject_download_auth', 10, 2 );
```

### API response format

The `/plugin-info/{slug}` endpoint returns:

```json
{
  "name": "My Plugin",
  "slug": "my-plugin",
  "version": "1.2.3",
  "author": "<a href=\"https://example.com\">Author Name</a>",
  "author_profile": "https://example.com",
  "requires": "5.6",
  "tested": "6.7",
  "requires_php": "7.4",
  "download_link": "https://your-domain.com/download/release/my-plugin-1.2.3.zip",
  "last_updated": "2025-01-15 3:24pm GMT",
  "download_count": 1234,
  "sections": {
    "description": "<p>Plugin description here.</p>",
    "changelog": "<h2>1.2.3</h2><ul><li>Fixed a bug</li></ul>"
  },
  "versions": {
    "1.2.3": "https://your-domain.com/download/release/my-plugin-1.2.3.zip",
    "1.2.2": "https://your-domain.com/download/release/my-plugin-1.2.2.zip"
  },
  "branches": {
    "main": "https://your-domain.com/download/branch/my-plugin-main.zip"
  }
}
```

When `?license_key=YOUR_KEY` is passed, all download links include the key:

```
https://your-domain.com/download/release/my-plugin-1.2.3.zip?license_key=YOUR_KEY
```

### Plugin metadata from `package.json`

The plugin-info endpoint reads metadata from a `package.json` file at the root of the GitHub repo (at the tagged commit). Supported fields:

| Field | Maps to |
|-------|---------|
| `name` | Plugin display name |
| `description` | Plugin description |
| `author` | Author name |
| `author_uri` | Author profile URL |
| `requires` | Minimum WordPress version |
| `tested` | Tested up to WordPress version |
| `requires_php` | Minimum PHP version (fallback to package definition) |

## GitHub release setup

For the server to discover your plugin versions:

1. Create a GitHub release with a tag (e.g. `v1.0.0`)
2. Attach a `.zip` file as a release asset containing the plugin
3. The tag name is used as the version (the `v` prefix is stripped automatically)

The asset pattern can be customized per package with `assetPattern`. If no asset matches the pattern, the first `.zip` asset is used as a fallback.

### Release channels

Versions are automatically classified based on the tag name:

| Tag pattern | Channel |
|-------------|---------|
| `1.0.0` | `stable` |
| `1.0.0-beta.1` | `beta` |
| `1.0.0-rc.1` | `rc` |
| `1.0.0-nightly.1` | `nightly` |
| Any GitHub prerelease | `prerelease` |

## License

GPL-3.0+
