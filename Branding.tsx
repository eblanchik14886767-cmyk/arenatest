import type { Settings } from '../types';

interface BrandingProps {
  settings: Settings;
}

/** Top-left wordmark. The trailing dot always uses the live secondary color. */
export function Branding({ settings }: BrandingProps) {
  if (!settings.brandingVisible) return null;
  return (
    <div
      className="branding"
      style={{ fontSize: `${settings.brandingSize}px`, opacity: settings.brandingOpacity }}
    >
      <span className="branding-word">{settings.brandingText}</span>
      <span className="branding-dot" style={{ color: settings.secondaryColor }}>
        .
      </span>
    </div>
  );
}
