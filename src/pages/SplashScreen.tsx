import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { firebaseInitError, missingConfigKeys } from '../firebase/config';

export const SplashScreen: React.FC = () => (
  <div
    style={{
      paddingTop: 'calc(2rem + env(safe-area-inset-top))',
      paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))',
    }}
    className="flex min-h-screen w-full flex-col items-center justify-center bg-[#E6EBF2] px-6 text-center"
  >
    <div className="neu-raised-2 flex flex-col items-center rounded-3xl px-8 py-10">
      <div className="neu-teal flex h-16 w-16 items-center justify-center rounded-2xl font-display text-3xl font-bold text-white">
        T
      </div>
      <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-[#111827]">
        TERRA Track Rider
      </h1>
      <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-[#1F2937]">
        <Loader2 className="h-4 w-4 animate-spin text-[#006B5F]" aria-hidden="true" />
        <span>Checking session…</span>
      </div>
    </div>
  </div>
);

export const ConfigMissingScreen: React.FC = () => (
  <div
    style={{
      paddingTop: 'calc(2rem + env(safe-area-inset-top))',
      paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))',
    }}
    className="flex min-h-screen w-full items-center justify-center bg-[#E6EBF2] px-4"
  >
    <main className="neu-raised-2 w-full max-w-lg rounded-3xl p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <div className="neu-inset-sm flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[#DC2626]">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-[#111827]">TERRA Track Rider</h1>
          <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#DC2626]">
            Firebase configuration missing
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm font-medium leading-relaxed text-[#1F2937] whitespace-normal break-words">
        {firebaseInitError ?? 'Firebase configuration must be provisioned before starting the app.'}
      </p>
      {missingConfigKeys.length > 0 && (
        <div className="neu-inset-sm mt-4 rounded-2xl p-4">
          <div className="text-xs font-bold uppercase tracking-[0.06em] text-[#111827]">
            Missing configuration keys
          </div>
          <ul className="mt-2 space-y-1 font-mono text-xs font-semibold text-[#1F2937]">
            {missingConfigKeys.map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
        </div>
      )}
    </main>
  </div>
);
