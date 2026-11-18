// react-native-libsodium 1.7.0 reaches the JS runtime on iOS through
// RCTCxxBridge, which React Native 0.88 no longer has, so it doesn't
// compile. This applies the upstream fix
// (https://github.com/serenity-kit/react-native-libsodium/pull/109): read
// the runtime from the bridge proxy that legacy modules get instead. It
// edits the installed package at prebuild (personal build only, see
// app.config.ts), does nothing once the file has the fix, and fails the
// prebuild if the file has changed some other way. Remove it once a
// release includes the fix.
const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("expo/config-plugins");

const EDITS = [
  [
    '#import "react-native-libsodium.h"\n',
    '#import "react-native-libsodium.h"\n\n@interface RCTBridge (LibsodiumRuntime)\n- (void *)runtime;\n@end\n',
  ],
  [
    "  RCTCxxBridge *cxxBridge = (RCTCxxBridge *)self.bridge;\n  if (!cxxBridge.runtime) {",
    "  void *runtime = [self.bridge runtime];\n  if (!runtime) {",
  ],
  [
    "ReactNativeLibsodium::installLibsodium(*(facebook::jsi::Runtime *)cxxBridge.runtime);",
    "ReactNativeLibsodium::installLibsodium(*(facebook::jsi::Runtime *)runtime);",
  ],
];

module.exports = function withLibsodiumBridgeProxy(config) {
  return withDangerousMod(config, [
    "ios",
    (c) => {
      const file = path.join(path.dirname(require.resolve("react-native-libsodium/package.json")), "ios", "Libsodium.mm");
      let source = fs.readFileSync(file, "utf8");
      if (source.includes("[self.bridge runtime]")) return c;
      for (const [from, to] of EDITS) {
        if (!source.includes(from)) {
          throw new Error(`withLibsodiumBridgeProxy: couldn't find ${JSON.stringify(from)} in ${file}; update plugins/withLibsodiumBridgeProxy.js`);
        }
        source = source.replace(from, to);
      }
      fs.writeFileSync(file, source);
      return c;
    },
  ]);
};
