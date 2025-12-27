import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '~/utils';

type Props = {
  className?: string;
  intervalMs?: number; // e.g. 5000 for 5 seconds
};

function toFlagEmoji(countryCode: string) {
  const cc = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '🌐';

  const A = 0x1f1e6;
  const base = 'A'.charCodeAt(0);
  return String.fromCodePoint(A + (cc.charCodeAt(0) - base), A + (cc.charCodeAt(1) - base));
}

function inferCountryFromRegion(regionRaw?: string): { cc?: string; label?: string } {
  const region = (regionRaw ?? '').trim().toLowerCase();
  if (!region) return {};

  if (region === 'ap-southeast-2') return { cc: 'AU', label: 'Australia (Sydney)' };
  if (region.startsWith('us-')) return { cc: 'US', label: 'United States' };
  if (region === 'me-central-1') return { cc: 'AE', label: 'United Arab Emirates' };

  return { cc: undefined, label: regionRaw };
}

function demonymForCountryCode(cc?: string): string | undefined {
  const code = (cc ?? '').toUpperCase();

  // Common/explicit mappings
  const map: Record<string, string> = {
    AU: 'Australian',
    US: 'American',
    AE: 'Emirati',
    GB: 'British',
    NZ: 'New Zealand',
    CA: 'Canadian',
    IE: 'Irish',
    SG: 'Singaporean',
    IN: 'Indian',
    JP: 'Japanese',
    KR: 'Korean',
    CN: 'Chinese',
    FR: 'French',
    DE: 'German',
    IT: 'Italian',
    ES: 'Spanish',
    NL: 'Dutch',
    SE: 'Swedish',
    NO: 'Norwegian',
    DK: 'Danish',
    FI: 'Finnish',
    BR: 'Brazilian',
    MX: 'Mexican',
    ZA: 'South African',
  };

  return map[code];
}

export default function SovereigntyFlag({ className, intervalMs = 120_000 }: Props) {
  const [flutter, setFlutter] = useState(false);
  const [mountEl, setMountEl] = useState<HTMLElement | null>(null);

  const meta = useMemo(() => {
    const env = import.meta.env as any;

    const countryOverride =
      (env.VITE_SOVEREIGN_COUNTRY as string | undefined) ??
      (env.VITE_DEPLOY_COUNTRY as string | undefined);

    const regionHint =
      (env.VITE_SOVEREIGN_REGION as string | undefined) ??
      (env.VITE_DEPLOY_REGION as string | undefined) ??
      (env.VITE_AWS_REGION as string | undefined) ??
      (env.VITE_AWS_DEFAULT_REGION as string | undefined);

    const fromRegion = inferCountryFromRegion(regionHint);

    const cc = (countryOverride ?? fromRegion.cc ?? '').toUpperCase();
    const emoji = cc ? toFlagEmoji(cc) : '🌐';

    const demonym = demonymForCountryCode(cc);

    // Tooltip text: "<Country> ingenuity" pattern.
    // If unknown, fall back to "Sovereign ingenuity".
    const title = demonym ? `${demonym} ingenuity` : 'Sovereign ingenuity';

    return { cc, emoji, title };
  }, []);

  // Create a fixed mount node directly under <body>
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const id = 'k9-sovereignty-flag-root';
    let el = document.getElementById(id) as HTMLElement | null;

    if (!el) {
      el = document.createElement('div');
      el.id = id;

      el.style.position = 'fixed';
      el.style.top = '12px';

      // moved LEFT so it doesn't collide with RHS menu
      el.style.right = '72px';

      el.style.zIndex = '2147483647';
      el.style.pointerEvents = 'auto';

      document.body.appendChild(el);
    } else {
      // Ensure updated positioning even if the element already existed
      el.style.top = '12px';
      el.style.right = '72px';
    }

    setMountEl(el);
  }, []);

  // Inject keyframes once
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const id = 'k9-flag-flutter-style';
    if (document.getElementById(id)) return;

    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes k9FlagFlutter {
        0%   { transform: rotate(0deg) translateY(0px); }
        15%  { transform: rotate(-2deg) translateY(-0.5px); }
        30%  { transform: rotate(2.5deg) translateY(0px); }
        45%  { transform: rotate(-2deg) translateY(0.5px); }
        60%  { transform: rotate(2deg) translateY(0px); }
        75%  { transform: rotate(-1deg) translateY(-0.5px); }
        100% { transform: rotate(0deg) translateY(0px); }
      }
      .k9-flag {
        display: inline-flex;
        transform-origin: 15% 50%;
        will-change: transform;
      }
      .k9-flag--flutter {
        animation: k9FlagFlutter 1.2s ease-in-out;
      }
    `;
    document.head.appendChild(style);
  }, []);

  // Flutter timer (5s if you pass 5000)
  useEffect(() => {
    const kick = () => {
      setFlutter(true);
      window.setTimeout(() => setFlutter(false), 1300);
    };

    const t0 = window.setTimeout(kick, 1200);
    const every = Math.max(250, intervalMs);
    const id = window.setInterval(kick, every);

    return () => {
      window.clearTimeout(t0);
      window.clearInterval(id);
    };
  }, [intervalMs]);

  const flagNode = (
    <div className={cn('select-none', className)} title={meta.title} aria-label={meta.title}>
      <span
        className={cn(
          'k9-flag',
          flutter && 'k9-flag--flutter',
          // ~50% bigger
          'h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white/60 text-[22px] shadow-sm dark:border-white/10 dark:bg-white/5',
        )}
      >
        {meta.emoji}
      </span>
    </div>
  );

  if (!mountEl) return null;
  return createPortal(flagNode, mountEl);
}