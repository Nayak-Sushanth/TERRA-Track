import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Map as MapIcon, Navigation, User } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/map', label: 'Map', icon: MapIcon },
  { to: '/route', label: 'Route', icon: Navigation },
  { to: '/profile', label: 'Profile', icon: User },
];

export const BottomNav: React.FC = () => (
  <nav
    aria-label="Primary navigation"
    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    className="fixed bottom-0 left-0 right-0 z-40 bg-[#E6EBF2]/95 backdrop-blur-md shadow-[0_-6px_16px_rgba(194,201,214,0.65)]"
  >
    <div className="mx-auto grid min-h-[68px] max-w-5xl grid-cols-4 items-center px-2 py-1.5">
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `mx-auto flex min-h-[56px] min-w-[68px] flex-col items-center justify-center gap-1 rounded-2xl px-3 py-1.5 text-[11px] font-bold tracking-wide transition-all ${
              isActive ? 'neu-inset-sm text-[#006B5F]' : 'text-[#1F2937] hover:text-[#111827]'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                className={`h-5 w-5 ${isActive ? 'text-[#006B5F]' : 'text-[#1F2937]'}`}
                aria-hidden="true"
              />
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </div>
  </nav>
);
