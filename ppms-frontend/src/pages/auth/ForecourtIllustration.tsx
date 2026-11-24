const HOSE_PATH = 'M214 196 C 252 204, 262 168, 232 160'

/** A fuel forecourt drawn in currentColor; the accent parts and the fuel flowing along the hose are coloured by CSS. */
export function ForecourtIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 250" className={className} aria-hidden="true" focusable="false">
      <line x1="0" y1="232" x2="360" y2="232" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" />

      <rect x="60" y="66" width="10" height="166" fill="currentColor" fillOpacity="0.45" />
      <rect x="290" y="66" width="10" height="166" fill="currentColor" fillOpacity="0.45" />
      <rect x="28" y="38" width="304" height="28" rx="5" fill="currentColor" fillOpacity="0.92" />
      <rect x="28" y="60" width="304" height="6" className="ui-auth-art__accent" />
      <rect x="84" y="70" width="28" height="4" rx="2" className="ui-auth-art__light" />
      <rect x="166" y="70" width="28" height="4" rx="2" className="ui-auth-art__light" />
      <rect x="248" y="70" width="28" height="4" rx="2" className="ui-auth-art__light" />

      <rect x="118" y="216" width="124" height="16" rx="3" fill="currentColor" fillOpacity="0.3" />
      <rect x="144" y="104" width="72" height="12" rx="5" className="ui-auth-art__accent" />
      <rect x="144" y="110" width="72" height="108" rx="8" fill="currentColor" fillOpacity="0.95" />
      <rect x="154" y="122" width="52" height="28" rx="3" className="ui-auth-art__screen" />
      <rect x="160" y="129" width="26" height="4" rx="2" className="ui-auth-art__accent" />
      <rect x="160" y="138" width="38" height="4" rx="2" className="ui-auth-art__accent" fillOpacity="0.6" />
      <path d="M180 164 C 180 164, 170 178, 170 185 a10 10 0 0 0 20 0 C 190 178, 180 164, 180 164 Z" className="ui-auth-art__accent" />
      <rect x="216" y="146" width="10" height="26" rx="2" fill="currentColor" fillOpacity="0.8" />

      <path d={HOSE_PATH} fill="none" stroke="currentColor" strokeOpacity="0.8" strokeWidth="5" strokeLinecap="round" />
      <path d={HOSE_PATH} fill="none" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 9" className="ui-auth-art__flow" />
    </svg>
  )
}
