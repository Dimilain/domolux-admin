'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  HomeIcon,
  CubeIcon,
  DocumentTextIcon,
  PhotoIcon,
  UsersIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';

interface SidebarProps {
  onClose?: () => void;
}

const navigation = [
      { name: 'Dashboard', href: '/', icon: HomeIcon },
      { name: 'Products', href: '/admin/products', icon: CubeIcon },
      { name: 'Leads', href: '/admin/leads', icon: EnvelopeIcon },
      { name: 'Articles', href: '/admin/articles', icon: DocumentTextIcon },
      { name: 'Media', href: '/admin/media', icon: PhotoIcon },
      { name: 'Audit Logs', href: '/admin/logs', icon: ClipboardDocumentListIcon },
      { name: 'Users', href: '/admin/users', icon: UsersIcon },
      { name: 'Settings', href: '/admin/settings', icon: Cog6ToothIcon },
    ];

export default function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
        <Link href="/" className="flex items-center space-x-2" onClick={onClose}>
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-white font-serif font-bold text-lg">D</span>
          </div>
          <span className="font-serif font-bold text-xl text-midnight">Domolux</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onClose}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-slate-700 hover:bg-gray-100 hover:text-midnight'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-gray-200">
        <button
          className="flex items-center space-x-3 w-full px-4 py-3 rounded-lg text-slate-700 hover:bg-gray-100 hover:text-midnight transition-colors"
          onClick={() => {
            signOut({ callbackUrl: '/login' });
          }}
        >
          <ArrowRightOnRectangleIcon className="w-5 h-5" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}

