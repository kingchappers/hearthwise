import { notifications } from '@mantine/notifications';
import { ToastAction } from '~/components/layout/ToastAction';
import { usePreferences } from '~/lib/preferences';
import { undoAutoClose } from '~/lib/undoDuration';

// A message with one button that puts things back, kept for as long as the person chose in Settings ("Messages").
export function useUndoToast(): (text: string, label: string, run: () => void) => void {
  const [preferences] = usePreferences();
  return (text, label, run) => {
    const id = crypto.randomUUID();
    notifications.show({
      id,
      autoClose: undoAutoClose(preferences.undoDuration),
      message: <ToastAction text={text} actionLabel={label} onAction={() => { notifications.hide(id); run(); }} />,
    });
  };
}
