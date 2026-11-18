import { toLocalISODate } from "@pernce/core";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

/** Writes `contents` to a temp file and opens the share sheet for it
 * (save to Files, AirDrop, email, Drive...); downloads it on web. */
export async function shareTextFile(name: string, contents: string, mimeType: string, uti: string) {
  // The web has no share sheet or file system; download it instead.
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(contents);
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this device");
  await Sharing.shareAsync(file.uri, { mimeType, UTI: uti, dialogTitle: name });
}

export function stampedName(prefix: string, ext: string) {
  return `${prefix}-${toLocalISODate()}.${ext}`;
}

/** Lets the user pick a file and returns its text, or null if cancelled. */
export async function pickTextFile(types: string[]): Promise<{ name: string; text: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  // On web the picked file is a browser File (blob: URI), not on disk.
  const text = Platform.OS === "web" ? await (await fetch(asset.uri)).text() : await new File(asset.uri).text();
  return { name: asset.name, text };
}
