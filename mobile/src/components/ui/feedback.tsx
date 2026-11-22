import type { ReactNode } from "react";
import { Modal, View, type StyleProp, type ViewStyle } from "react-native";
import { useT } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { Icon } from "../Icon";
import { KeyboardBox } from "../keyboard";
import { Button, IconButton, Inline, T } from "./display";
import { Card } from "./layout";
import { styles } from "./styles";

/** Feedback building blocks: empty states, notes, error cards and the confirm dialog. */

/** .empty: a 72px ring with an icon, a heading and one next step. */
export function Empty({
  icon = "list",
  title,
  body,
  action,
  fill,
}: {
  icon?: string;
  title: string;
  body?: string;
  action?: ReactNode;
  /** Centered in the remaining space. */
  fill?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.empty, fill && { flex: 1, justifyContent: "center" }]}>
      <View style={[styles.ring, { backgroundColor: c.chip }]}>
        <Icon name={icon} color={c.mute} variant="l" />
      </View>
      <T variant="heading" align="center">
        {title}
      </T>
      {body ? (
        <T variant="bodySm" color={c.mute} align="center" style={{ maxWidth: 260 }}>
          {body}
        </T>
      ) : null}
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </View>
  );
}

/** .note: a small icon beside a muted caption. */
export function Note({ icon, children, style }: { icon: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[styles.note, style]}>
      <Icon name={icon} color={c.mute} variant="s" />
      <T variant="caption" color={c.mute} style={[styles.grow, { lineHeight: 19 }]}>
        {children}
      </T>
    </View>
  );
}

/** card.inset with an icon and a muted caption ("Updated today at 06:00"). */
export function InsetNote({ icon, children, style }: { icon: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <Card inset style={[styles.inline, { gap: 10, alignItems: "flex-start" }, style]}>
      <Icon name={icon} color={c.text} variant="s" />
      <T variant="caption" color={c.mute} style={styles.grow}>
        {children}
      </T>
    </Card>
  );
}

/** The inset card with a danger hairline: "Couldn't save" + what to do. */
export function ErrorCard({ title, children, style }: { title: string; children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <Card inset style={[{ borderColor: c.negative }, style]}>
      <Inline gap={8}>
        <Icon name="alert" color={c.negativeText} variant="s" />
        <T variant="label" color={c.negativeText} style={styles.grow}>
          {title}
        </T>
      </Inline>
      {children ? (
        <T variant="caption" color={c.mute} style={{ marginTop: 6 }}>
          {children}
        </T>
      ) : null}
    </Card>
  );
}

/** The destructive confirmation (.ph-alert / .alertbox): icon, title, body,
 * a red-text action and a soft Cancel. */
export function ConfirmDialog({
  visible,
  icon = "trash",
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
  children,
}: {
  visible: boolean;
  icon?: string;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  /** Extra content above the buttons, e.g. a password field. */
  children?: ReactNode;
}) {
  const { c } = useTheme();
  const t = useT();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent navigationBarTranslucent>
      <KeyboardBox style={styles.alertBackdrop}>
        <View style={[styles.alertBox, { backgroundColor: c.canvas2, borderColor: c.cardBorder }]}>
          <View style={{ alignSelf: "center", marginBottom: 16 }}>
            <IconButton icon={icon} label={title} iconColor={c.negativeText} iconVariant="md" />
          </View>
          <T variant="heading" align="center" style={{ marginBottom: 8 }}>
            {title}
          </T>
          <T variant="bodySm" color={c.mute} align="center" style={{ marginBottom: 24 }}>
            {body}
          </T>
          {children}
          <View style={{ gap: 10 }}>
            <Button label={confirmLabel} variant="danger" onPress={onConfirm} loading={busy} />
            <Button label={t.common.cancel} variant="soft" onPress={onCancel} />
          </View>
        </View>
      </KeyboardBox>
    </Modal>
  );
}
