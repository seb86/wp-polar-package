# WP Polar Package

A WordPress plugin repository server with Composer support. Authenticate customers with [Polar.sh](https://polar.sh) license keys and distribute plugin releases hosted on GitHub.

## How it works

1. Plugin versions are discovered automatically from GitHub releases
2. Customers authenticate with their Polar license key via HTTP Basic auth
3. The server validates the license key against Polar.sh
4. Composer receives the package index and downloads plugin ZIPs
5. WordPress can check for plugin updates via the plugin-info endpoint

## Features

- **Composer private repository** — `packages.json` endpoint with license key auth
- **WordPress plugin updates** — Plugin info endpoint compatible with WordPress update checks
- **Release channels** — Filter by stable, beta, rc, nightly, or prerelease
- **Branch downloads** — Download development branches as properly-packaged ZIPs
- **Premium + free** — Enforce license auth only on premium packages
- **GitHub integration** — Automatic version discovery with pagination and caching

## Getting started

### 1. Fork or clone this repository

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy `.env.example` to `.env` and fill in your values:

| Variable | Required | Description |
|----------|----------|-------------|
| `POLAR_ORGANIZATION_ID` | Yes | Your Polar.sh organization ID |
| `POLAR_ACCESS_TOKEN` | Yes | Polar API access token |
| `GITHUB_TOKEN` | For private repos | GitHub personal access token with repo read access |
| `LICENSE_CACHE_TTL` | No | License validation cache in seconds (default: 300) |
| `GITHUB_CACHE_TTL` | No | GitHub releases cache in seconds (default: 300) |

### 4. Add your packages

Edit `src/lib/packages.ts` to register your plugins:

```ts
{
  name: "your-vendor/your-plugin",   // Composer package name
  slug: "your-plugin",               // WordPress plugin slug
  description: "My awesome plugin",
  type: "wordpress-plugin",
  license: "GPL-3.0+",
  github: "your-org/your-repo",      // GitHub owner/repo
  assetPattern: "*.zip",             // Glob pattern for release assets
  requiresPhp: "7.4",               // Minimum PHP version
  premium: true,                     // Require Polar license key for downloads
  branchDownload: "main",            // Enable branch downloads (optional)
  minRelease: "2.0.0",              // Exclude versions below this (optional)
}
```

### 5. Run locally

```bash
npm run dev
```

### 6. Deploy

Deploy to any Node.js host (Vercel, Sevalla, etc.) and set the environment variables in the hosting dashboard.

## API endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/packages.json` | License key | Composer package index |
| `GET /api/dist/:vendor/:package/:version` | License key | Composer dist download |
| `GET /api/plugin-info/{slug}` | Public | WordPress plugin info JSON |
| `GET /api/download/release/{slug}-{version}.zip` | Premium only | Download a release ZIP |
| `GET /api/download/branch/{slug}-{branch}.zip` | Premium only | Download a branch ZIP |

### Plugin info query parameters

- `tag` — Request info for a specific version (default: latest)
- `channel` — Filter releases: `stable`, `beta`, `rc`, `nightly`, `prerelease`, `all` (default: `stable`)

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

To enable automatic update checks from the WordPress admin, add the following to your plugin's main PHP file. This hooks into WordPress's built-in update system and points it at your `/api/plugin-info/{slug}` endpoint.

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
define( 'MY_PLUGIN_API_URL', 'https://your-domain.com/api/plugin-info/' . MY_PLUGIN_SLUG );

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

    // Query the plugin info API.
    $response = wp_remote_get( MY_PLUGIN_API_URL, array(
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

    $response = wp_remote_get( MY_PLUGIN_API_URL, array(
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

### Premium plugins with license key auth

For premium plugins where the download endpoint requires a Polar license key, pass the credentials when WordPress downloads the ZIP. Add this alongside the code above:

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
    if ( strpos( $url, 'your-domain.com/api/download/' ) === false ) {
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

Store the license key in your plugin's settings (e.g. via `update_option( 'my_plugin_license_key', $key )`). The `password` field is the site URL, matching the same convention used for Composer auth.

### API response format

The `/api/plugin-info/{slug}` endpoint returns:

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
  "download_link": "https://your-domain.com/api/download/release/my-plugin-1.2.3.zip",
  "last_updated": "2025-01-15",
  "download_count": 1234,
  "sections": {
    "description": "<p>Plugin description here.</p>",
    "changelog": "<h2>1.2.3</h2><ul><li>Fixed a bug</li></ul>"
  },
  "versions": {
    "1.2.3": "https://your-domain.com/api/download/release/my-plugin-1.2.3.zip",
    "1.2.2": "https://your-domain.com/api/download/release/my-plugin-1.2.2.zip"
  },
  "branches": {
    "main": "https://your-domain.com/api/download/branch/my-plugin-main.zip"
  }
}
```

## License

GPL-3.0+
