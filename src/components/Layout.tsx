import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Bell, TrendingUp, Sun, Moon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';

interface LayoutProps {
  children: React.ReactNode;
}

function getInitialTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const [theme, setTheme] = useState<'dark' | 'light'>(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Alertas', path: '/alerts', icon: Bell },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 flex flex-col transition-colors">
      <header className="bg-white dark:bg-gray-900 border-b dark:border-gray-800 sticky top-0 z-10 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-1.5 rounded-lg">
              <TrendingUp className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-gray-100">BSR Tracker</h1>
              <div className="flex items-center gap-1.5 mt-[-2px]">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-medium uppercase tracking-wider">
                  DiversiPrime
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-6">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                    location.pathname === item.path
                      ? 'text-primary'
                      : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-100'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              ))}
            </nav>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {children}
      </main>

      <footer className="bg-white dark:bg-gray-900 border-t dark:border-gray-800 py-6 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-slate-500 dark:text-gray-400">
          © {new Date().getFullYear()} BSR Tracker - DiversiPrime. Todos os direitos reservados.
        </div>
      </footer>
      <Toaster />
    </div>
  );
}
