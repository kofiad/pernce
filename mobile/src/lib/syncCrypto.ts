import { crypto_pwhash, crypto_pwhash_ALG_ARGON2ID13, randombytes_buf } from "react-native-libsodium";
import type { CryptoProvider } from "../sync/crypto";

/** Argon2id in native libsodium: pure-JS Argon2 is far too slow on low-end
 * Android (docs/mobile-scope.md §5.3). This is why the app needs its own
 * development build rather than Expo Go. The web uses syncCrypto.web.ts. */
export const syncCryptoProvider: CryptoProvider = {
  argon2id: (password, salt, opsLimit, memLimit) =>
    crypto_pwhash(32, password, salt, opsLimit, memLimit, crypto_pwhash_ALG_ARGON2ID13),
  randomBytes: (n) => randombytes_buf(n),
};
