import { Alert, Platform } from "react-native";

/** A message the user has to dismiss. React Native Web's Alert does
 * nothing, so on web this uses the browser's own dialog. */
export function showAlert(title: string, message?: string) {
  if (Platform.OS === "web") {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
