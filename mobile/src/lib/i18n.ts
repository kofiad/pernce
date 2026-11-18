import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { languageFor } from "../data/preferences";
import { MESSAGES, type Messages } from "../i18n";

/** The phone's language, re-read whenever the app comes back to the
 * foreground, so changing it in the phone's settings re-renders every
 * screen in the new language. */
let language = languageFor();
const listeners = new Set<() => void>();
AppState.addEventListener("change", (state) => {
  if (state !== "active") return;
  const next = languageFor();
  if (next === language) return;
  language = next;
  for (const l of listeners) l();
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The UI strings in the phone's language. */
export function useT(): Messages {
  return MESSAGES[useSyncExternalStore(subscribe, () => language)];
}
