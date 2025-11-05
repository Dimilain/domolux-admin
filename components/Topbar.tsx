'use client';

import { Bars3Icon, BellIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useSession } from 'next-auth/react';
import { useState } from 'react';

interface TopbarProps {
  onMenuClick: () => void;
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const { data: session } = useSession();
  const [searchQuery, setSearchQuery] = useState('');
  
  const userName = session?.user?.name || 'Admin User';
  const userEmail = session?.user?.email || 'admin@domolux.com';
  const userInitials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
      <div className="flex items-center justify-between h-16 px-6">
        {/* Left: Menu button and search */}
        <div className="flex items-center space-x-4 flex-1">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-lg text-slate-700 hover:bg-gray-100 transition-colors"
            aria-label="Open menu"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>

          {/* Search bar */}
          <div className="hidden md:flex items-center flex-1 max-w-md">
            <div className="relative w-full">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
            </div>
          </div>
        </div>

        {/* Right: Notifications and user menu */}
        <div className="flex items-center space-x-4">
          {/* Notifications */}
          <button
            className="relative p-2 rounded-lg text-slate-700 hover:bg-gray-100 transition-colors"
            aria-label="Notifications"
          >
            <BellIcon className="w-6 h-6" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>

          {/* User menu */}
          <div className="flex items-center space-x-3">
            <div className="hidden md:block text-right">
              <p className="text-sm font-medium text-midnight">{userName}</p>
              <p className="text-xs text-slate-600">{userEmail}</p>
            </div>
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
              <span className="text-white font-medium text-sm">{userInitials}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

