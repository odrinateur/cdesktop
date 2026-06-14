import { useTranslation } from 'react-i18next';
import { ShortcutsList } from '@/shared/keyboard/ShortcutsList';

export function ShortcutsSettingsSection() {
  const { t } = useTranslation('common');

  return (
    <div className="pb-6">
      <ShortcutsList />
      <p className="mt-2 text-xs text-low text-center">
        {t('shortcuts.sequentialHint')}
      </p>
    </div>
  );
}
