/** UUIDs for new rows, generated on the device (sync-ready primary keys).
 * Node and modern browsers have crypto.randomUUID; Hermes may not, so the
 * app installs expo-crypto's generator at startup (src/db/client.ts). */
let generate: () => string = () => globalThis.crypto.randomUUID();

export function setUuidGenerator(fn: () => string) {
  generate = fn;
}

export function newId(): string {
  return generate();
}
