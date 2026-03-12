import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Trophy, Medal, TrendingUp, Clock, Filter, Search, AlertTriangle } from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';
import Skeleton from '../components/Skeleton';
import { useWebSocket } from '../hooks/useWebSocket';
import { logger } from '../utils/logger';

interface LeaderboardEntry {
  rank: number;
  user_id: string; // username from registration or verification
  username: string; // Computed username (respects Discord toggle)
  eightBallPoolId: string;
  account_level?: number | null;
  account_rank?: string | null;
  discord_id?: string | null;
  avatarUrl?: string | null; // Computed avatar URL (respects priority)
  totalClaims: number;
  successfulClaims: number;
  failedClaims: number;
  totalItemsClaimed: number;
  successRate: number;
  lastClaimed: string;
}

interface LeaderboardStats {
  timeframe: string;
  period: string;
  totalUsers: number;
  leaderboard: LeaderboardEntry[];
}

const LeaderboardPage: React.FC = () => {
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardStats | null>(null);
  const [totalStats, setTotalStats] = useState<LeaderboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState('7d');
  const [limit, setLimit] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');

  const [avatarRefreshKey, setAvatarRefreshKey] = useState<number>(Date.now());
  const [avatarErrors, setAvatarErrors] = useState<Set<string>>(new Set());
  const { socket } = useWebSocket({ autoConnect: true });

  const getAvatarDisplay = useCallback((entry: LeaderboardEntry) => {
    const initial = (entry.username || entry.user_id || 'U').charAt(0).toUpperCase();
    const rankBg = entry.rank === 1 ? 'bg-yellow-500' :
      entry.rank === 2 ? 'bg-gray-400' :
      entry.rank === 3 ? 'bg-orange-500' :
      'bg-primary-500';

    if (entry.avatarUrl && !avatarErrors.has(entry.eightBallPoolId)) {
      return (
        <img
          key={`avatar-${entry.eightBallPoolId}`}
          src={`${entry.avatarUrl}?v=${avatarRefreshKey}`}
          alt={entry.username || entry.user_id}
          className="w-8 h-8 rounded-full object-cover border-2 border-white dark:border-background-dark-secondary"
          onError={() => {
            setAvatarErrors(prev => new Set(prev).add(entry.eightBallPoolId));
          }}
        />
      );
    }
    return (
      <div
        key={`avatar-fallback-${entry.eightBallPoolId}`}
        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-white dark:border-background-dark-secondary ${rankBg}`}
      >
        {initial}
      </div>
    );
  }, [avatarRefreshKey, avatarErrors]);

  const timeframes = [
    { value: '1d', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '14d', label: 'Last 14 Days' },
    { value: '28d', label: 'Last 28 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
    { value: '1y', label: 'Last Year' },
  ];

  // Fetch function WITHOUT dependencies to prevent closure issues
  const fetchLeaderboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const timestamp = Date.now();
      const response = await axios.get(`${API_ENDPOINTS.LEADERBOARD}?timeframe=${timeframe}&limit=${limit}&_t=${timestamp}`, { withCredentials: true });
      setLeaderboardData(response.data);
      setTotalStats(response.data);
      
      logger.debug('📊 Leaderboard: Data refreshed', {
        entries: response.data?.leaderboard?.length || 0,
        totalUsers: response.data?.totalUsers || 0,
        timestamp
      });
      
      setError(null);
    } catch (err: any) {
      setError('Failed to fetch leaderboard data');
      console.error('Error fetching leaderboard:', err);
      setLeaderboardData(null);
      setTotalStats(null);
    } finally {
      setIsLoading(false);
    }
  }, [timeframe, limit]); // Dependencies here

  // Initial fetch when timeframe/limit change
  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Background fetch that preserves scroll and doesn't show loading state
  const backgroundFetchLeaderboard = useCallback(async () => {
    try {
      const scrollPosition = window.scrollY;
      const timestamp = Date.now();
      const response = await axios.get(`${API_ENDPOINTS.LEADERBOARD}?timeframe=${timeframe}&limit=${limit}&_t=${timestamp}`, { withCredentials: true });
      
      // Only update if data actually changed (compare by JSON to avoid unnecessary re-renders)
      setLeaderboardData(prevData => {
        if (JSON.stringify(prevData?.leaderboard) === JSON.stringify(response.data?.leaderboard)) {
          return prevData; // No change, keep old reference
        }
        return response.data;
      });
      setTotalStats(response.data);
      setError(null);
      
      // Restore scroll position
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollPosition);
      });
      
      logger.debug('📊 Leaderboard: Background refresh complete', {
        entries: response.data?.leaderboard?.length || 0,
      });
    } catch (err: any) {
      console.error('Error in background fetch:', err);
      // Don't update error state on background fetch failure
    }
  }, [timeframe, limit]);

  // WebSocket and event-driven updates - NO polling interval
  useEffect(() => {
    // Handle avatar update - only update refresh key and fetch on actual change
    const handleAvatarUpdate = (data?: any) => {
      logger.debug('🔄 Leaderboard: Avatar update received', data);
      setAvatarRefreshKey(Date.now());
      backgroundFetchLeaderboard();
    };

    // Handle data update (from verification bot, etc.)
    const handleDataUpdate = (data?: any) => {
      logger.debug('🔄 Leaderboard: Data update received', data);
      backgroundFetchLeaderboard();
    };

    window.addEventListener('avatar-updated', handleAvatarUpdate);
    
    if (socket) {
      logger.debug('🔌 Leaderboard: Setting up WebSocket listeners');
      socket.on('leaderboard-avatar-update', handleAvatarUpdate);
      socket.on('leaderboard-data-update', handleDataUpdate);
    }
    
    // NO automatic polling - rely on WebSocket events for real-time updates
    // This prevents the "refreshing every few seconds" issue
    // Data will update when:
    // 1. User changes timeframe/limit filters
    // 2. WebSocket emits avatar update
    // 3. WebSocket emits data update (from verification bot)
    // 4. User triggers manual refresh via page navigation

    return () => {
      window.removeEventListener('avatar-updated', handleAvatarUpdate);
      if (socket) {
        socket.off('leaderboard-avatar-update', handleAvatarUpdate);
        socket.off('leaderboard-data-update', handleDataUpdate);
      }
    };
  }, [socket, backgroundFetchLeaderboard]); // Include socket and backgroundFetchLeaderboard in deps

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Medal className="w-6 h-6 text-yellow-500" />;
      case 2:
        return <Medal className="w-6 h-6 text-gray-400" />;
      case 3:
        return <Medal className="w-6 h-6 text-orange-600" />;
      default:
        return <span className="w-6 h-6 flex items-center justify-center text-sm font-bold text-text-secondary">#{rank}</span>;
    }
  };

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-to-r from-yellow-400 to-yellow-600';
      case 2:
        return 'bg-gradient-to-r from-gray-300 to-gray-500';
      case 3:
        return 'bg-gradient-to-r from-orange-400 to-orange-600';
      default:
        return 'bg-white dark:bg-background-dark-tertiary border-gray-200 dark:border-dark-accent-navy';
    }
  };

  const getRankBadgeColor = (rankName: string | null | undefined): string => {
    if (!rankName) return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400';
    const rank = rankName.toLowerCase();
    if (rank.includes('grandmaster') || rank.includes('master')) {
      return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300';
    } else if (rank.includes('expert') || rank.includes('professional')) {
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
    } else if (rank.includes('advanced') || rank.includes('intermediate')) {
      return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
    } else if (rank.includes('rookie') || rank.includes('beginner')) {
      return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300';
    }
    return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen pt-8 pb-16 sm:pb-20 px-4 sm:px-6 lg:px-8 overflow-x-hidden w-full">
        <div className="max-w-7xl mx-auto w-full">
          <div className="text-center mb-12 space-y-4">
            <div className="inline-block">
              <Skeleton className="w-20 h-20 rounded-2xl mx-auto" />
            </div>
            <Skeleton className="h-12 w-64 mx-auto" />
            <Skeleton className="h-6 w-96 mx-auto" />
          </div>

          <Skeleton className="h-24 w-full rounded-2xl mb-8" />

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>

          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Trophy className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-text-primary mb-2">Error</h2>
          <p className="text-text-secondary mb-4">{error}</p>
          <button onClick={fetchLeaderboard} className="btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-8 pb-16 sm:pb-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <div className="relative inline-block mb-4">
            <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full blur-2xl opacity-30 animate-pulse" />
            <div className="relative w-20 h-20 bg-gradient-to-br from-yellow-100 to-yellow-50 dark:from-yellow-500/20 dark:to-orange-600/20 rounded-2xl flex items-center justify-center shadow-xl rotate-3 hover:rotate-6 transition-transform duration-300">
              <Trophy className="w-10 h-10 text-yellow-600 dark:text-yellow-400 drop-shadow-md" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-text-primary dark:text-white mb-4 tracking-tight">
            Leaderboard
          </h1>
          <p className="text-lg text-text-secondary dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
            See who's claiming the most rewards! Rankings are based on total items claimed.
          </p>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="glass-panel rounded-2xl p-6 mb-10 border border-white/20 dark:border-white/5"
        >
          <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-primary-50 dark:bg-dark-accent-blue/10 rounded-xl flex items-center justify-center">
                <Filter className="w-6 h-6 text-primary-600 dark:text-dark-accent-blue" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-text-primary dark:text-white">Filters</h3>
                <p className="text-sm text-text-secondary dark:text-gray-400">Customise view</p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
              <div className="flex-1 lg:flex-none lg:min-w-[200px]">
                <label htmlFor="timeframe" className="label">
                  Time Period
                </label>
                <div className="relative">
                  <select
                    id="timeframe"
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                    className="input appearance-none pl-10"
                  >
                    {timeframes.map((tf) => (
                      <option key={tf.value} value={tf.value}>
                        {tf.label}
                      </option>
                    ))}
                  </select>
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>
              
              <div className="flex-1 lg:flex-none lg:min-w-[150px]">
                <label htmlFor="limit" className="label">
                  Show Top
                </label>
                <div className="relative">
                  <select
                    id="limit"
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    className="input appearance-none pl-10"
                  >
                    <option value={10}>10 Players</option>
                    <option value={25}>25 Players</option>
                    <option value={50}>50 Players</option>
                    <option value={100}>100 Players</option>
                  </select>
                  <Trophy className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Top 3 Podium - Desktop Only */}
        {leaderboardData && leaderboardData.leaderboard.length >= 3 && (
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="hidden lg:flex justify-center items-end gap-4 mb-12 px-4 h-80"
          >
            {/* 2nd Place */}
            <div className="relative w-1/3 max-w-xs group">
              <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 flex flex-col items-center">
                <div className="relative">
                  <div className="absolute inset-0 bg-gray-400/30 blur-xl rounded-full" />
                  {leaderboardData.leaderboard[1].avatarUrl ? (
                    <img 
                      src={`${leaderboardData.leaderboard[1].avatarUrl}?v=${avatarRefreshKey}`} 
                      alt="2nd Place" 
                      className="relative w-16 h-16 rounded-full border-4 border-gray-300 shadow-lg z-10 object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/8bp-rewards/assets/logos/8logo.png";
                      }}
                    />
                  ) : (
                    <img 
                      src="/8bp-rewards/assets/logos/8logo.png" 
                      alt="2nd Place" 
                      className="relative w-16 h-16 rounded-full border-4 border-gray-300 shadow-lg z-10"
                      onError={(e) => (e.target as HTMLImageElement).style.display = 'none'}
                    />
                  )}
                  <div className="absolute -bottom-2 -right-2 bg-gray-500 text-white w-8 h-8 flex items-center justify-center rounded-full font-bold border-2 border-white shadow-md z-20">2</div>
                </div>
                <div className="mt-2 text-center">
                  <p className="font-bold text-gray-800 dark:text-gray-200 truncate max-w-[150px]">{leaderboardData.leaderboard[1].username}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{leaderboardData.leaderboard[1].totalItemsClaimed} items</p>
                </div>
              </div>
              <div className="h-48 bg-gradient-to-t from-gray-300 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-t-2xl shadow-lg border-t border-white/20 flex flex-col justify-end items-center pb-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-white/10 transform skew-y-12 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <Medal className="w-16 h-16 text-gray-400 opacity-20 mb-2" />
              </div>
            </div>

            {/* 1st Place */}
            <div className="relative w-1/3 max-w-xs group z-10">
              <div className="absolute -top-14 left-1/2 transform -translate-x-1/2 flex flex-col items-center">
                <div className="relative">
                  <div className="absolute inset-0 bg-yellow-500/40 blur-xl rounded-full animate-pulse" />
                  {leaderboardData.leaderboard[0].avatarUrl ? (
                    <img 
                      src={`${leaderboardData.leaderboard[0].avatarUrl}?v=${avatarRefreshKey}`} 
                      alt="1st Place" 
                      className="relative w-20 h-20 rounded-full border-4 border-yellow-400 shadow-xl z-10 object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/8bp-rewards/assets/logos/8logo.png";
                      }}
                    />
                  ) : (
                    <img 
                      src="/8bp-rewards/assets/logos/8logo.png" 
                      alt="1st Place" 
                      className="relative w-20 h-20 rounded-full border-4 border-yellow-400 shadow-xl z-10"
                      onError={(e) => (e.target as HTMLImageElement).style.display = 'none'}
                    />
                  )}
                  <div className="absolute -top-6 left-1/2 transform -translate-x-1/2">
                    <Trophy className="w-8 h-8 text-yellow-500 drop-shadow-md" />
                  </div>
                  <div className="absolute -bottom-2 -right-2 bg-yellow-500 text-white w-9 h-9 flex items-center justify-center rounded-full font-bold border-2 border-white shadow-md z-20 text-lg">1</div>
                </div>
                <div className="mt-2 text-center">
                  <p className="font-bold text-gray-900 dark:text-white text-lg truncate max-w-[180px]">{leaderboardData.leaderboard[0].username}</p>
                  <p className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">{leaderboardData.leaderboard[0].totalItemsClaimed} items</p>
                </div>
              </div>
              <div className="h-60 bg-gradient-to-t from-yellow-400 to-yellow-200 dark:from-yellow-700 dark:to-yellow-600 rounded-t-2xl shadow-xl border-t border-white/30 flex flex-col justify-end items-center pb-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-white/20 transform -skew-y-12 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <Medal className="w-20 h-20 text-yellow-900 opacity-20 mb-2" />
              </div>
            </div>

            {/* 3rd Place */}
            <div className="relative w-1/3 max-w-xs group">
              <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 flex flex-col items-center">
                <div className="relative">
                  <div className="absolute inset-0 bg-orange-500/30 blur-xl rounded-full" />
                  {leaderboardData.leaderboard[2].avatarUrl ? (
                    <img 
                      src={`${leaderboardData.leaderboard[2].avatarUrl}?v=${avatarRefreshKey}`} 
                      alt="3rd Place" 
                      className="relative w-16 h-16 rounded-full border-4 border-orange-400 shadow-lg z-10 object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/8bp-rewards/assets/logos/8logo.png";
                      }}
                    />
                  ) : (
                    <img 
                      src="/8bp-rewards/assets/logos/8logo.png" 
                      alt="3rd Place" 
                      className="relative w-16 h-16 rounded-full border-4 border-orange-400 shadow-lg z-10"
                      onError={(e) => (e.target as HTMLImageElement).style.display = 'none'}
                    />
                  )}
                  <div className="absolute -bottom-2 -right-2 bg-orange-500 text-white w-8 h-8 flex items-center justify-center rounded-full font-bold border-2 border-white shadow-md z-20">3</div>
                </div>
                <div className="mt-2 text-center">
                  <p className="font-bold text-gray-800 dark:text-gray-200 truncate max-w-[150px]">{leaderboardData.leaderboard[2].username}</p>
                  <p className="text-sm text-orange-600 dark:text-orange-400">{leaderboardData.leaderboard[2].totalItemsClaimed} items</p>
                </div>
              </div>
              <div className="h-40 bg-gradient-to-t from-orange-300 to-orange-100 dark:from-orange-800 dark:to-orange-700 rounded-t-2xl shadow-lg border-t border-white/20 flex flex-col justify-end items-center pb-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-white/10 transform skew-y-6 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <Medal className="w-16 h-16 text-orange-900 opacity-20 mb-2" />
              </div>
            </div>
          </motion.div>
        )}

        {/* Total Claims Stats */}
        {totalStats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8"
          >
            <div className="card p-6 flex items-center space-x-4 hover:scale-[1.02] transition-transform">
              <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
                <Trophy className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-secondary dark:text-gray-400">Total Players</p>
                <p className="text-2xl font-bold text-text-primary dark:text-white">{totalStats.totalUsers}</p>
              </div>
            </div>

            <div className="card p-6 flex items-center space-x-4 hover:scale-[1.02] transition-transform">
              <div className="p-3 rounded-xl bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-secondary dark:text-gray-400">Total Claims</p>
                <p className="text-2xl font-bold text-text-primary dark:text-white">
                  {totalStats.leaderboard.reduce((sum, entry) => sum + entry.totalClaims, 0).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="card p-6 flex items-center space-x-4 hover:scale-[1.02] transition-transform">
              <div className="p-3 rounded-xl bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400">
                <Medal className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-secondary dark:text-gray-400">Total Items</p>
                <p className="text-2xl font-bold text-text-primary dark:text-white">
                  {totalStats.leaderboard.reduce((sum, entry) => sum + entry.totalItemsClaimed, 0).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="card p-6 flex items-center space-x-4 hover:scale-[1.02] transition-transform">
              <div className="p-3 rounded-xl bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-secondary dark:text-gray-400">Failed Claims</p>
                <p className="text-2xl font-bold text-text-primary dark:text-white">
                  {totalStats.leaderboard.reduce((sum, entry) => sum + (entry.failedClaims || 0), 0).toLocaleString()}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Leaderboard List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="glass-panel rounded-2xl overflow-hidden border border-white/20 dark:border-white/5"
        >
          {leaderboardData && (
            <>
              <div className="p-6 border-b border-gray-200 dark:border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-text-primary dark:text-white">
                    Rankings
                  </h2>
                  <p className="text-sm text-text-secondary dark:text-gray-400">
                    {leaderboardData.period} • {leaderboardData.timeframe}
                  </p>
                </div>

                {/* Search Bar */}
                <div className="relative w-full md:w-72">
                  <input
                    type="text"
                    placeholder="Search user or ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input pl-10"
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>

              {leaderboardData.leaderboard.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-20 h-20 bg-gray-50 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Trophy className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                  </div>
                  <h3 className="text-lg font-medium text-text-primary dark:text-white mb-2">
                    No Data Available
                  </h3>
                  <p className="text-text-secondary dark:text-gray-400">
                    No claims have been recorded for the selected time period.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-white/5">
                  <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50/50 dark:bg-white/5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <div className="col-span-1 text-center">Rank</div>
                    <div className="col-span-3">Player</div>
                    <div className="col-span-1 text-center">Level</div>
                    <div className="col-span-1 text-center">Game Rank</div>
                    <div className="col-span-2 text-center">Items</div>
                    <div className="col-span-2 text-center">Success Rate</div>
                    <div className="col-span-2 text-right">Last Claim</div>
                  </div>

                  {leaderboardData.leaderboard
                    .filter(entry => 
                      entry.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      entry.user_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      entry.eightBallPoolId.includes(searchQuery)
                    )
                    .map((entry) => (
                    <div
                      key={entry.user_id || entry.eightBallPoolId}
                      className={`p-4 md:px-6 md:py-4 hover:bg-gray-50/80 dark:hover:bg-white/5 transition-colors ${
                        entry.rank <= 3 ? 'bg-gradient-to-r from-transparent via-transparent to-transparent' : ''
                      } ${
                        entry.rank === 1 ? 'dark:bg-yellow-500/5' : 
                        entry.rank === 2 ? 'dark:bg-gray-500/5' : 
                        entry.rank === 3 ? 'dark:bg-orange-500/5' : ''
                      }`}
                    >
                      {/* Mobile Card View */}
                      <div className="md:hidden flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="flex-shrink-0 w-8 text-center font-bold text-lg">
                            {entry.rank <= 3 ? getRankIcon(entry.rank) : <span className="text-gray-500">#{entry.rank}</span>}
                          </div>
                          <div>
                            <h3 className="font-bold text-text-primary dark:text-white">{entry.username || entry.user_id}</h3>
                            <p className="text-xs text-text-secondary dark:text-gray-400 font-mono">ID: {entry.eightBallPoolId}</p>
                            <div className="flex items-center gap-2 mt-1">
                              {entry.account_level && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                                  Lv {entry.account_level}
                                </span>
                              )}
                              {entry.account_rank && (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getRankBadgeColor(entry.account_rank)}`}>
                                  {entry.account_rank}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-primary-600 dark:text-primary-400">{entry.totalItemsClaimed} Items</p>
                          <p className={`text-xs font-medium ${
                            entry.successRate >= 90 ? 'text-green-600 dark:text-green-400' : 
                            entry.successRate >= 70 ? 'text-yellow-600 dark:text-yellow-400' : 
                            'text-red-600 dark:text-red-400'
                          }`}>
                            {entry.successRate}% Success
                          </p>
                        </div>
                      </div>

                      {/* Desktop Grid View */}
                      <div className="hidden md:grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-1 flex justify-center">
                          {entry.rank <= 3 ? (
                            <div className="transform scale-110">{getRankIcon(entry.rank)}</div>
                          ) : (
                            <span className="font-bold text-gray-500 dark:text-gray-400">#{entry.rank}</span>
                          )}
                        </div>
                        <div className="col-span-3">
                          <div className="flex items-center space-x-3">
                            {getAvatarDisplay(entry)}
                            <div>
                              <p className="font-bold text-text-primary dark:text-white text-sm">{entry.username || entry.user_id}</p>
                              <p className="text-xs text-text-secondary dark:text-gray-400 font-mono">ID: {entry.eightBallPoolId}</p>
                            </div>
                          </div>
                        </div>
                        <div className="col-span-1 text-center">
                          {entry.account_level ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                              Lv {entry.account_level}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-gray-600">-</span>
                          )}
                        </div>
                        <div className="col-span-1 text-center">
                          {entry.account_rank ? (
                            <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${getRankBadgeColor(entry.account_rank)}`}>
                              {entry.account_rank}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-gray-600">-</span>
                          )}
                        </div>
                        <div className="col-span-2 text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300">
                            {entry.totalItemsClaimed}
                          </span>
                        </div>
                        <div className="col-span-2">
                          <div className="flex items-center justify-center space-x-2">
                            <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full ${
                                  entry.successRate >= 90 ? 'bg-green-500' : 
                                  entry.successRate >= 70 ? 'bg-yellow-500' : 
                                  'bg-red-500'
                                }`} 
                                style={{ width: `${entry.successRate}%` }}
                              />
                            </div>
                            <span className={`text-xs font-bold ${
                              entry.successRate >= 90 ? 'text-green-600 dark:text-green-400' : 
                              entry.successRate >= 70 ? 'text-yellow-600 dark:text-yellow-400' : 
                              'text-red-600 dark:text-red-400'
                            }`}>
                              {entry.successRate}%
                            </span>
                          </div>
                        </div>
                        <div className="col-span-2 text-right text-sm text-text-secondary dark:text-gray-400">
                          {entry.lastClaimed ? new Date(entry.lastClaimed).toLocaleDateString('en-GB', { 
                            day: '2-digit', 
                            month: 'short', 
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          }) : 'Never'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default LeaderboardPage;












