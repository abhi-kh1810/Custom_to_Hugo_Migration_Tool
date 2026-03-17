import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

export default function Layout() {
  return (
    <div className="min-h-screen bg-surface-950 flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-white/[0.06] py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-surface-500 text-sm">
            Hugo Site Builder &mdash; Build static sites effortlessly
          </p>
          <div className="flex items-center gap-4">
            <span className="text-surface-600 text-xs">
              Powered by Hugo + React
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
