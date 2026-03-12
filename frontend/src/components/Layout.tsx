import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Menu, X, Home, UserPlus, UserMinus, Mail, Trophy, HelpCircle, LogIn, LogOut, User, Shield } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import AnimatedBackground from './AnimatedBackground';
import Footer from './Footer';
import SocialSidebar from './SocialSidebar';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { user, isAuthenticated, isAdmin, role, login, logout } = useAuth();

  // Get Discord avatar URL or return null for default
  const getDiscordAvatarUrl = (userId: string | undefined, avatar: string | null | undefined): string | null => {
    if (userId && avatar) {
      return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png`;
    }
    return null;
  };

  const avatarUrl = getDiscordAvatarUrl(user?.id, user?.avatar || null);

  const navigation: Array<{
    name: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    adminOnly?: boolean;
  }> = [
    { name: 'Home', href: '/home', icon: Home },
    { name: 'Register', href: '/register', icon: UserPlus },
    { name: 'Deregister', href: '/deregister', icon: UserMinus },
    { name: 'Contact', href: '/contact', icon: Mail },
    { name: 'Leaderboard', href: '/leaderboard', icon: Trophy },
    { name: 'FAQ', href: '/faq', icon: HelpCircle },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="relative min-h-screen">
      <AnimatedBackground />
      
      {/* Social Sidebar - Left side with icons only */}
      <SocialSidebar />
      
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/70 dark:bg-background-dark-secondary/70 backdrop-blur-xl border-b border-white/20 dark:border-white/5 shadow-lg shadow-black/5 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Logged Out State - Centered Navigation */}
          {!isAuthenticated && (
            <div className="relative flex items-center justify-between h-16">
              {/* Logo */}
              <div className="flex-shrink-0 flex items-center">
                <Link to="/home" className="flex items-center space-x-3 group">
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary-500/20 dark:bg-dark-accent-blue/20 rounded-xl blur-lg group-hover:blur-xl transition-all duration-300" />
                    <img 
                      src="/8bp-rewards/assets/logos/8logo.png" 
                      alt="8BP Rewards Logo" 
                      className="relative w-9 h-9 rounded-xl object-cover shadow-md transform group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300">
                    Rewards
                  </span>
                </Link>
              </div>

              {/* Desktop Navigation - Centered */}
              <div className="hidden lg:flex items-center justify-center absolute left-1/2 transform -translate-x-1/2 space-x-1 p-1 bg-gray-100/50 dark:bg-background-dark-tertiary/50 backdrop-blur-md rounded-full border border-white/20 dark:border-white/5">
                {navigation.map((item) => {
                  // Skip admin-only items if user is not admin
                  if (item.adminOnly && !isAdmin) return null;
                  
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`relative flex items-center space-x-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                        active
                          ? 'text-primary-700 dark:text-white'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/5'
                      }`}
                    >
                      {active && (
                        <motion.div
                          layoutId="navbar-indicator"
                          className="absolute inset-0 bg-white dark:bg-background-dark-secondary rounded-full shadow-sm"
                          initial={false}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        />
                      )}
                      <span className="relative z-10 flex items-center space-x-2">
                        <Icon className={`w-4 h-4 ${active ? 'text-primary-500 dark:text-dark-accent-blue' : ''}`} />
                        <span>{item.name}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>

              {/* Login Button */}
              <div className="hidden lg:flex items-center space-x-4">
                <button
                  onClick={login}
                  className="btn-primary flex items-center space-x-2 px-5 py-2.5 rounded-full shadow-lg shadow-primary-500/20 hover:shadow-primary-500/30 hover:-translate-y-0.5 transition-all duration-300"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Login</span>
                </button>
              </div>

              {/* Mobile menu button */}
              <div className="lg:hidden flex items-center">
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="p-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                >
                  {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
              </div>
            </div>
          )}

          {/* Logged In State */}
          {isAuthenticated && (
            <div className="relative flex items-center justify-between h-16">
              {/* Logo */}
              <div className="flex-shrink-0 flex items-center">
                <Link to="/home" className="flex items-center space-x-3 group">
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary-500/20 dark:bg-dark-accent-blue/20 rounded-xl blur-lg group-hover:blur-xl transition-all duration-300" />
                    <img 
                      src="/8bp-rewards/assets/logos/8logo.png" 
                      alt="8BP Rewards Logo" 
                      className="relative w-9 h-9 rounded-xl object-cover shadow-md transform group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300">
                    Rewards
                  </span>
                </Link>
              </div>

              {/* Desktop Navigation - Centered */}
              <div className="hidden lg:flex items-center justify-center absolute left-1/2 transform -translate-x-1/2 space-x-1 p-1 bg-gray-100/50 dark:bg-background-dark-tertiary/50 backdrop-blur-md rounded-full border border-white/20 dark:border-white/5">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`relative flex items-center space-x-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                        active
                          ? 'text-primary-700 dark:text-white'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/5'
                      }`}
                    >
                      {active && (
                        <motion.div
                          layoutId="navbar-indicator-auth"
                          className="absolute inset-0 bg-white dark:bg-background-dark-secondary rounded-full shadow-sm"
                          initial={false}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        />
                      )}
                      <span className="relative z-10 flex items-center space-x-2">
                        <Icon className={`w-4 h-4 ${active ? 'text-primary-500 dark:text-dark-accent-blue' : ''}`} />
                        <span>{item.name}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>

              {/* User Info & Logout */}
              <div className="hidden lg:flex items-center space-x-4">
                <div className="flex items-center space-x-3 pl-4 border-l border-gray-200 dark:border-white/10">
                  {isAdmin && (
                    <Link
                      to="/dashboard-selection"
                      className="p-2 rounded-full text-primary-600 dark:text-dark-accent-blue hover:bg-primary-50 dark:hover:bg-dark-accent-blue/10 transition-colors"
                      title="Admin Dashboard"
                    >
                      <Shield className="w-5 h-5" />
                    </Link>
                  )}
                  
                  <div className="flex items-center space-x-3">
                    <div className="text-right hidden xl:block">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{user?.username}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{role}</p>
                    </div>
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={user?.username || 'User'}
                        className="h-9 w-9 rounded-full object-cover shadow-lg shadow-primary-500/20 border-2 border-white dark:border-background-dark-secondary"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 dark:from-dark-accent-navy dark:to-dark-accent-blue flex items-center justify-center text-white shadow-lg shadow-primary-500/20">
                        <User className="w-5 h-5" />
                      </div>
                    )}
                  </div>

                  <button
                    onClick={logout}
                    className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    title="Logout"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Mobile menu button */}
              <div className="lg:hidden flex items-center space-x-4">
                {isAuthenticated && (
                  avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={user?.username || 'User'}
                      className="h-8 w-8 rounded-full object-cover border-2 border-white dark:border-background-dark-secondary"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 dark:from-dark-accent-navy dark:to-dark-accent-blue flex items-center justify-center text-white">
                      <User className="w-4 h-4" />
                    </div>
                  )
                )}
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="p-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                >
                  {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-white/95 dark:bg-background-dark-secondary/95 backdrop-blur-xl border-t border-gray-200 dark:border-white/5 shadow-xl"
          >
            <div className="px-4 py-4 space-y-2">
              {navigation.map((item) => {
                if (item.adminOnly && !isAdmin) return null;
                
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                      active
                        ? 'bg-primary-50 dark:bg-dark-accent-blue/10 text-primary-700 dark:text-dark-accent-blue'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${active ? 'text-primary-500 dark:text-dark-accent-blue' : ''}`} />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
              
              {isAdmin && (
                <Link
                  to="/dashboard-selection"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium text-primary-600 dark:text-dark-accent-blue hover:bg-primary-50 dark:hover:bg-dark-accent-blue/10 transition-all duration-200"
                >
                  <Shield className="w-5 h-5" />
                  <span>Admin Dashboard</span>
                </Link>
              )}
              
              <div className="pt-4 mt-4 border-t border-gray-200 dark:border-white/10">
                {isAuthenticated ? (
                  <button
                    onClick={() => {
                      logout();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all duration-200"
                  >
                    <LogOut className="w-5 h-5" />
                    <span>Logout</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      login();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/20"
                  >
                    <LogIn className="w-5 h-5" />
                    <span>Login with Discord</span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </nav>

      {/* Main Content */}
      <main className="relative z-10 pt-20 pb-8">
        {children}
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default Layout;
