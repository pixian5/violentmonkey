# Violentmonkey

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/jinjaccalgkegednnccohejagnlnfdag.svg)](https://chrome.google.com/webstore/detail/violentmonkey/jinjaccalgkegednnccohejagnlnfdag)
[![Firefox Add-ons](https://img.shields.io/amo/v/violentmonkey.svg)](https://addons.mozilla.org/firefox/addon/violentmonkey)
[![Microsoft Edge Add-on](https://img.shields.io/badge/dynamic/json?label=microsoft%20edge%20add-on&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Feeagobfjdenkkddmbclomhiblgggliao)](https://microsoftedge.microsoft.com/addons/detail/eeagobfjdenkkddmbclomhiblgggliao)

Violentmonkey provides userscripts support for browsers.
It works on browsers with [WebExtensions](https://developer.mozilla.org/en-US/Add-ons/WebExtensions) support.

More details can be found [here](https://violentmonkey.github.io/).

Join our Discord server:

[![Discord](https://img.shields.io/discord/995346102003965952?label=discord&logo=discord&logoColor=white&style=for-the-badge)](https://discord.gg/XHtUNSm6Xc)

## Automated Builds for Testers

A test build is generated automatically for changes between beta releases. It can be installed as an unpacked extension in Chrome and Chromium-based browsers or as a temporary extension in Firefox. It's likely to have bugs so do an export in Violentmonkey settings first. This zip is available only if you're logged-in on GitHub site. Open an entry in the [CI workflows](https://github.com/violentmonkey/violentmonkey/actions/workflows/ci.yml) table and click the `Violentmonkey-...` link at the bottom to download it.

## Workflows

### Development

Install [Node.js](https://nodejs.org/) and Yarn v1.x.
The version of Node.js should match `"node"` key in `package.json`.
This project is pinned to Yarn `1.22.22`.

``` sh
# Install dependencies
$ yarn

# Watch and compile
$ yarn dev
```

Then load the extension from 'dist/'.

### Build

To release a new version, we must build the assets and upload them to web stores.

``` sh
# Build for normal releases
$ yarn build

# Build for self-hosted release that has an update_url
$ yarn build:selfHosted
```

### macOS Desktop Build

This repository now includes an Electron-based macOS shell that loads the
generated Violentmonkey extension into Chromium.

``` sh
# Install dependencies
$ yarn

# Run the desktop shell locally
$ yarn macos:dev

# Package a macOS .app in build/macos/
$ yarn macos:dist
```

If a local code-signing certificate is available in Keychain, the packaging
script will try to sign the app automatically. Otherwise it will build an
unsigned app bundle.

### Safari Build

Safari packaging uses Apple's Web Extension converter plus Xcode.

``` sh
# Build a Safari-compatible extension bundle and host app
$ yarn safari:dist
```

The generated Safari host app is placed in `build/safari/DerivedData/Build/Products/Debug/`.

### Release

See [RELEASE](RELEASE.md) for the release flow.

## Related Projects

- [Violentmonkey for Opera Presto](https://github.com/violentmonkey/violentmonkey-oex)
- [Violentmonkey for Maxthon](https://github.com/violentmonkey/violentmonkey-mx)
