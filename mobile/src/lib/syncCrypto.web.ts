import sodium, { ready as sodiumReady } from "libsodium-wrappers-sumo";
import type { CryptoProvider } from "../sync/crypto";

// react-native-libsodium's web build has no crypto_pwhash, so Argon2id comes
// from libsodium's "sumo" WebAssembly build, loaded at startup (well before
// anyone can type a password), and random bytes from the browser.
let ready = false;
sodiumReady.then(() => {
  ready = true;
});

export const syncCryptoProvider: CryptoProvider = {
  argon2id: (password, salt, opsLimit, memLimit) => {
    if (!ready) throw new Error("Encryption is still loading. Try again in a moment.");
    return sodium.crypto_pwhash(32, password, salt, opsLimit, memLimit, sodium.crypto_pwhash_ALG_ARGON2ID13);
  },
  randomBytes: (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)),
};
