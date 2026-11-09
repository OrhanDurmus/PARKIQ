# ROTAPARK mobile build (development scaffold)

This is a **local bundled web app**, not a remote website-only WebView. It does not yet constitute an App Store / Google Play-ready binary.

## Prerequisites
- Node.js 22+, npm
- Android Studio + Android SDK for Android
- macOS + Xcode for iOS

## Prepare
```sh
npm install
npm run mobile:prepare
npx cap add android
# On macOS: npx cap add ios
npm run mobile:sync
```

Open with `npx cap open android` or `npx cap open ios` after adding the respective platform.

## Release blockers
- Validate relative URLs and assets inside the packaged app. Absolute paths like `/navigation-voice.js` and `/manifest.webmanifest` may not work as expected inside the native scheme; adjust and test before release.
- Validate third-party map tiles and CDN dependencies offline/online, privacy notices and location permissions on physical devices.
- Add platform-native location permission descriptions and Android permission handling after platform generation.
- Confirm Apple and Google store policies, icons, screenshots, signing, accessibility and privacy declarations.
- Never commit signing keys, credentials or personal account details.

The existing Cloudflare web deployment is unaffected by these scaffold files.
