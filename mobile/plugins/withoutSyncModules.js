// Leaves the sync native modules out of the default (store) build. They're
// installed for the personal build (APP_VARIANT=personal, see
// app.config.ts), and autolinking would otherwise link them into every
// build. Expo autolinking only reads `exclude` from package.json or from
// the native files, so this adds it to the generated Podfile and
// settings.gradle, and fails the prebuild if their shape has changed.
const { withPodfile, withSettingsGradle } = require("expo/config-plugins");

const SYNC_MODULES = ["react-native-libsodium", "expo-secure-store", "expo-background-task", "expo-task-manager"];

function replaceOnce(source, from, to, file) {
  if (!source.includes(from)) {
    throw new Error(`withoutSyncModules: couldn't find ${JSON.stringify(from)} in ${file}; update plugins/withoutSyncModules.js`);
  }
  return source.replace(from, to);
}

module.exports = function withoutSyncModules(config) {
  config = withPodfile(config, (c) => {
    const list = SYNC_MODULES.map((m) => `'${m}'`).join(", ");
    let podfile = c.modResults.contents;
    // Expo modules.
    podfile = replaceOnce(podfile, "use_expo_modules!\n", `use_expo_modules!({ exclude: [${list}] })\n`, "Podfile");
    // React Native modules (libsodium), resolved by a separate command.
    podfile = replaceOnce(podfile, "      '--platform',\n      'ios'\n", `      '--platform',\n      'ios',\n      '--exclude', ${list}\n`, "Podfile");
    c.modResults.contents = podfile;
    return c;
  });
  config = withSettingsGradle(config, (c) => {
    const list = SYNC_MODULES.map((m) => `"${m}"`).join(", ");
    let gradle = c.modResults.contents;
    gradle = replaceOnce(
      gradle,
      "ex.autolinkLibrariesFromCommand(expoAutolinking.rnConfigCommand)",
      `ex.autolinkLibrariesFromCommand(expoAutolinking.rnConfigCommand + ["--exclude", ${list}])`,
      "settings.gradle",
    );
    gradle = replaceOnce(
      gradle,
      "expoAutolinking.useExpoModules()",
      `expoAutolinking.exclude = [${list}]\nexpoAutolinking.useExpoModules()`,
      "settings.gradle",
    );
    c.modResults.contents = gradle;
    return c;
  });
  return config;
};
