// Configure native location permissions after Capacitor generates platform projects.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const ios = path.join(root, 'ios/App/App/Info.plist');
const android = path.join(root, 'android/app/src/main/AndroidManifest.xml');
const usage = 'ROTAPARK, yakınınızdaki otoparkları göstermek ve navigasyon sırasında konumunuzu belirlemek için konum izni kullanır.';
if (fs.existsSync(ios)) {
  let xml = fs.readFileSync(ios, 'utf8');
  if (!xml.includes('<key>NSLocationWhenInUseUsageDescription</key>')) {
    xml = xml.replace('</dict>', '    <key>NSLocationWhenInUseUsageDescription</key>\n    <string>' + usage + '</string>\n</dict>');
  }
  if (!xml.includes('<key>NSLocationWhenInUseUsageDescription</key>')) throw new Error('iOS location permission key missing');
  fs.writeFileSync(ios, xml);
  console.log('iOS location usage description configured');
}
if (fs.existsSync(android)) {
  let xml = fs.readFileSync(android, 'utf8');
  const permissions = ['android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION'];
  for (const name of permissions) {
    if (!xml.includes('android:name="' + name + '"')) {
      xml = xml.replace(/(<manifest\b[^>]*>)/, '$1\n    <uses-permission android:name="' + name + '" />');
    }
  }
  for (const name of permissions) if (!xml.includes('android:name="' + name + '"')) throw new Error('Missing Android permission: ' + name);
  fs.writeFileSync(android, xml);
  console.log('Android foreground location permissions configured');
}
if (!fs.existsSync(ios) && !fs.existsSync(android)) throw new Error('No generated native projects found');
