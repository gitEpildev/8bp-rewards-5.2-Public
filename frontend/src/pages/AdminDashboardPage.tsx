import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { Navigate, Link } from 'react-router-dom';
import axios from 'axios';
import { API_ENDPOINTS, getAdminUserBlockEndpoint, getAdminRegistrationDeleteEndpoint } from '../config/api';
import { useVPSStats } from '../hooks/useWebSocket';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { logger } from '../utils/logger';
import PostgreSQLDBManager from '../components/PostgreSQLDBManager';
import SupportTicketsManager from '../components/SupportTicketsManager';
import { 
  Shield, 
  Users, 
  Activity, 
  TrendingUp, 
  Search, 
  Plus, 
  Trash2, 
  Play, 
  Settings,
  LogOut,
  User,
  Clock,
  Database,
  FileText,
  Filter,
  Monitor,
  RefreshCw,
  CheckCircle,
  XCircle,
  Server,
  Cpu,
  HardDrive,
  Wifi,
  AlertTriangle,
  RotateCcw,
  Camera,
  Terminal,
  Send,
  Bot,
  Circle,
  CircleDot,
  Pause,
  ChevronDown,
  Network,
  MessageSquare,
    UserMinus,
    X
} from 'lucide-react';
import ClaimProgressTracker from '../components/ClaimProgressTracker';
import VPSAuthModal from '../components/VPSAuthModal';
import ResetLeaderboardAuthModal from '../components/ResetLeaderboardAuthModal';
import { toast } from 'react-hot-toast';

interface AdminOverview {
  registrations: {
    total: number;
    recent: number;
    period: string;
  };
  claims: Array<{
    _id: string;
    count: number;
    totalitems: number;
  }>;
  logs: Array<{
    _id: string;
    count: number;
    latest: string;
  }>;
  recentClaims: Array<{
    eightBallPoolId: string;
    status: string;
    itemsClaimed: string[];
    claimedAt: string;
    screenshotPath?: string | null;
    username?: string | null;
  }>;
}

interface HeartbeatSummary {
  totalActiveFiles: number;
  byProcess: { [pid: string]: Array<{
    moduleId: string;
    filePath: string;
    processId: number;
    service?: string;
    lastSeen: number;
  }> };
}

interface Registration {
  _id: string;
  eightBallPoolId: string;
  username: string;
  createdAt: string;
  updatedAt: string;
}

interface VPSStats {
  timestamp: string;
  system: {
    hostname: string;
    uptime: number;
    platform: string;
    arch: string;
    nodeVersion: string;
  };
  cpu: {
    usage: number;
    cores: number;
    loadAverage: number[];
    temperature?: number;
  };
  memory: {
    total: number;
    free: number;
    used: number;
    available: number;
    usagePercent: number;
    swap: {
      total: number;
      free: number;
      used: number;
    };
  };
  disk: {
    total: number;
    free: number;
    used: number;
    usagePercent: number;
    inodes: {
      total: number;
      free: number;
      used: number;
    };
  };
  network: {
    interfaces: Array<{
      name: string;
      bytesReceived: number;
      bytesSent: number;
      packetsReceived: number;
      packetsSent: number;
    }>;
    connections: number;
  };
  processes: {
    total: number;
    running: number;
    sleeping: number;
    zombie: number;
  };
  services: Array<{
    name: string;
    status: string;
    uptime: string;
    memory: string;
    cpu: string;
  }>;
  ping: {
    google: number;
    cloudflare: number;
    localhost: number;
  };
  uptime: string;
}

const AdminDashboardPage: React.FC = () => {
  const { user, isAuthenticated, isAdmin, isLoading, logout } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [userIp, setUserIp] = useState<string>('Loading...');
  const [newRegistration, setNewRegistration] = useState({
    eightBallPoolId: '',
    username: ''
  });
  const [logs, setLogs] = useState<any[]>([]);
  const [logFilters, setLogFilters] = useState({
    level: '',
    action: '',
    search: ''
  });
  const [showProgressTracker, setShowProgressTracker] = useState(false);
  const [currentProcessId, setCurrentProcessId] = useState<string | null>(null);
  const [activeProcesses, setActiveProcesses] = useState<any[]>([]);
  const [isLoadingProcesses, setIsLoadingProcesses] = useState(false);
  const [vpsStats, setVpsStats] = useState<VPSStats | null>(null);
  const [isLoadingVpsStats, setIsLoadingVpsStats] = useState(false);

  // Use WebSocket for real-time VPS stats updates
  const { stats: wsVpsStats, status: wsStatus, isConnected: wsConnected } = useVPSStats();
  const [screenshotUserQuery, setScreenshotUserQuery] = useState('');
  const [isClearingScreenshots, setIsClearingScreenshots] = useState(false);
  const [screenshotFolders, setScreenshotFolders] = useState<any[]>([]);
  const [allScreenshotFolders, setAllScreenshotFolders] = useState<any[]>([]);
  const [isLoadingScreenshots, setIsLoadingScreenshots] = useState(false);
  const [screenshotFetchTimeout, setScreenshotFetchTimeout] = useState<NodeJS.Timeout | null>(null);
  const [screenshotSearchQuery, setScreenshotSearchQuery] = useState('');
  const [verificationImages, setVerificationImages] = useState<Array<{
    filename: string;
    imageUrl: string;
    discordId: string | null;
    uniqueId: string | null;
    level: number | null;
    rankName: string | null;
    timestamp: string | null;
    capturedAt: string | null;
  }>>([]);
  const [isLoadingVerificationImages, setIsLoadingVerificationImages] = useState(false);
  const [verificationImageSearchQuery, setVerificationImageSearchQuery] = useState('');
  const [terminalAccess, setTerminalAccess] = useState<boolean | null>(null);
  const [terminalCommand, setTerminalCommand] = useState('');
  const [avatarAssignmentSelectedUsers, setAvatarAssignmentSelectedUsers] = useState<string[]>([]);
  const [avatarAssignmentSearchQuery, setAvatarAssignmentSearchQuery] = useState('');
  const [avatarAssignmentSelectedAvatar, setAvatarAssignmentSelectedAvatar] = useState<string>('');
  const [isAssigningAvatars, setIsAssigningAvatars] = useState(false);
  const [available8BPAvatars, setAvailable8BPAvatars] = useState<string[]>([]);
  const [terminalOutput, setTerminalOutput] = useState('');
  const [isExecutingCommand, setIsExecutingCommand] = useState(false);
  const [mfaVerified, setMfaVerified] = useState(false);
  const [discordCode, setDiscordCode] = useState('');
  const [telegramCode, setTelegramCode] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [codesSent, setCodesSent] = useState<{discord: boolean; telegram: boolean; email: boolean}>({discord: false, telegram: false, email: false});
  const [showCommandHelp, setShowCommandHelp] = useState(false);
  const [isRequestingCodes, setIsRequestingCodes] = useState(false);
  const [chartData, setChartData] = useState<Array<{
    time: string;
    cpu: number;
    memory: number;
    timestamp: number;
  }>>([
    // Sample data for testing
    { time: "00:00:01", cpu: 10, memory: 30, timestamp: Date.now() },
    { time: "00:00:02", cpu: 15, memory: 35, timestamp: Date.now() },
    { time: "00:00:03", cpu: 20, memory: 40, timestamp: Date.now() }
  ]);
  const [showVPSAuthModal, setShowVPSAuthModal] = useState(false);
  const [vpsAccessGranted, setVpsAccessGranted] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResettingLeaderboard, setIsResettingLeaderboard] = useState(false);
  const [showResetAuthModal, setShowResetAuthModal] = useState(false);
  const [resetAccessGranted, setResetAccessGranted] = useState(false);
  
  // Active Services state
  const [activeServicesData, setActiveServicesData] = useState<any>(null);
  const [heartbeatData, setHeartbeatData] = useState<HeartbeatSummary | null>(null);
  const [isLoadingActiveServices, setIsLoadingActiveServices] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<{ [key: string]: boolean }>({
    'Claimers': true,
    'Discord Services': true,
    'Website': true,
    'Other / System': false
  });
  const [expandedServices, setExpandedServices] = useState<{ [key: string]: boolean }>({});

  // Public deregistration requests state
  const [publicDeregRequests, setPublicDeregRequests] = useState<any[]>([]);
  const [isLoadingPublicDeregRequests, setIsLoadingPublicDeregRequests] = useState(false);
  const [publicDeregReviewNotes, setPublicDeregReviewNotes] = useState<{ [key: string]: string }>({});
  
  // Bot status state
  const [botStatus, setBotStatus] = useState<{
    currentStatus: string;
    environmentStatus: string;
    botReady: boolean;
    botTag?: string;
  } | null>(null);
  const [isLoadingBotStatus, setIsLoadingBotStatus] = useState(false);
  const [isChangingBotStatus, setIsChangingBotStatus] = useState(false);
  const [botStatusFetchTimeout, setBotStatusFetchTimeout] = useState<NodeJS.Timeout | null>(null);
  
  // Bot on/off toggle state
  const [isBotEnabled, setIsBotEnabled] = useState(true);
  const [isTogglingBot, setIsTogglingBot] = useState(false);
  
  // Manual claim per user state
  const [singleUserId, setSingleUserId] = useState('');
  const [testUsers, setTestUsers] = useState<Array<{id: string; username: string; description: string}>>([]);
  const [isLoadingTestUsers, setIsLoadingTestUsers] = useState(false);

  // Deregistered Users state
  const [deregisteredUsers, setDeregisteredUsers] = useState<any[]>([]);
  const [isLoadingDeregisteredUsers, setIsLoadingDeregisteredUsers] = useState(false);
  const [deregisteredUsersFilter, setDeregisteredUsersFilter] = useState({
    sourceModule: '',
    reason: '',
    search: ''
  });

  // Deregistration Requests state
  const [deregistrationRequests, setDeregistrationRequests] = useState<any[]>([]);
  const [isLoadingDeregistrationRequests, setIsLoadingDeregistrationRequests] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<{ [key: string]: string }>({});

  // System Integration Map state
  const [systemIntegrationData, setSystemIntegrationData] = useState<any>(null);
  const [isLoadingSystemIntegration, setIsLoadingSystemIntegration] = useState(false);
  const [moduleHealthData, setModuleHealthData] = useState<any>(null);

  const fetchVpsStats = useCallback(async () => {
    setIsLoadingVpsStats(true);
    try {
      const response = await axios.get(API_ENDPOINTS.VPS_MONITOR_STATS, { withCredentials: true });
      const stats = response.data;
      setVpsStats(stats);
      
      // Update chart data with new reading
      const now = new Date();
      const timeString = now.toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      });
      const newDataPoint = {
        time: timeString,
        cpu: stats.cpu.usage,
        memory: stats.memory.usagePercent,
        timestamp: now.getTime()
      };
      
      setChartData(prevData => {
        const updatedData = [...prevData, newDataPoint];
        // Keep only last 60 data points (1 minute of data at 1-second intervals)
        const finalData = updatedData.slice(-60);
        console.log('Chart data updated:', finalData.length, 'points, latest:', newDataPoint);
        return finalData;
      });
    } catch (error: any) {
      toast.error('Failed to fetch VPS statistics');
      console.error('Error fetching VPS stats:', error);
    } finally {
      setIsLoadingVpsStats(false);
    }
  }, []);

  // Bot status functions
  const fetchBotStatus = useCallback(async () => {
    // Clear any existing timeout
    if (botStatusFetchTimeout) {
      clearTimeout(botStatusFetchTimeout);
    }
    
    // Debounce the API call by 1 second
    const timeout = setTimeout(async () => {
      logger.debug('🔄 Starting to fetch bot status...');
      setIsLoadingBotStatus(true);
      
      try {
        console.log('📡 Making API call to /api/admin/bot-status-public');
        const response = await axios.get('/api/admin/bot-status-public');
        console.log('✅ Bot status API response received:', response.data);
        setBotStatus(response.data.data);
      } catch (error: any) {
        console.error('❌ Bot status API error:', error);
        console.error('❌ Error details:', {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          url: error.config?.url
        });
        toast.error(`Failed to fetch bot status: ${error.response?.status || error.message}`);
      } finally {
        console.log('🏁 Setting isLoadingBotStatus to false');
        setIsLoadingBotStatus(false);
      }
    }, 1000);
    
    setBotStatusFetchTimeout(timeout);
  }, [botStatusFetchTimeout]);

  // Update VPS stats from WebSocket when received
  useEffect(() => {
    if (wsVpsStats) {
      setVpsStats(wsVpsStats as VPSStats);
      setIsLoadingVpsStats(false);
      
      // Update chart data with new reading
      const now = new Date();
      const timeString = now.toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      });
      const newDataPoint = {
        time: timeString,
        cpu: wsVpsStats.cpu.usage,
        memory: wsVpsStats.memory.usagePercent,
        timestamp: now.getTime()
      };
      
      setChartData(prevData => {
        const filtered = prevData.filter(d => now.getTime() - d.timestamp < 60000); // Keep last 60 seconds
        return [...filtered, newDataPoint];
      });
    }
  }, [wsVpsStats]);

  // Initial VPS stats fetch on tab switch (fallback)
  useEffect(() => {
    if (activeTab === 'vps' && !vpsStats && !wsVpsStats) {
      fetchVpsStats();
    }
  }, [activeTab, vpsStats, wsVpsStats, fetchVpsStats]);

  // WebSocket handles VPS stats updates - no polling needed
  // If WebSocket is not connected, show connection status to user

  const fetchUserIp = useCallback(async () => {
    try {
      // Get user's public IP address
      const response = await axios.get('https://api.ipify.org?format=json');
      setUserIp(response.data.ip);
    } catch (error) {
      setUserIp('Unable to fetch IP');
    }
  }, []);

  const fetchAdminData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [overviewResponse, registrationsResponse] = await Promise.all([
        axios.get(API_ENDPOINTS.ADMIN_OVERVIEW, { withCredentials: true }),
        axios.get(API_ENDPOINTS.ADMIN_REGISTRATIONS, { withCredentials: true })
      ]);

      setOverview(overviewResponse.data);
      setRegistrations(registrationsResponse.data.registrations);
    } catch (error: any) {
      toast.error('Failed to fetch admin data');
      console.error('Error fetching admin data:', error);
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (logFilters.level) params.append('level', logFilters.level);
      if (logFilters.action) params.append('action', logFilters.action);
      
      const response = await axios.get(`${API_ENDPOINTS.ADMIN_OVERVIEW.replace('/overview', '/logs')}?${params.toString()}`, { 
        withCredentials: true 
      });
      setLogs(response.data.logs);
    } catch (error: any) {
      toast.error('Failed to fetch logs');
      console.error('Error fetching logs:', error);
    }
  }, [logFilters]);

  const handleAddRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(API_ENDPOINTS.ADMIN_REGISTRATIONS, newRegistration, { withCredentials: true });
      toast.success('Registration added successfully');
      setShowAddForm(false);
      setNewRegistration({ eightBallPoolId: '', username: '' });
      fetchAdminData();
    } catch (error: any) {
      toast.error('Failed to add registration');
    }
  };

  const handleRemoveRegistration = async (eightBallPoolId: string) => {
    if (!window.confirm('Are you sure you want to remove this registration?')) {
      return;
    }

    try {
      await axios.delete(getAdminRegistrationDeleteEndpoint(eightBallPoolId), { withCredentials: true });
      toast.success('Registration removed successfully');
      fetchAdminData();
    } catch (error: any) {
      toast.error('Failed to remove registration');
    }
  };

  const handleManualClaim = async () => {
    try {
      const response = await axios.post(API_ENDPOINTS.ADMIN_CLAIM_ALL, {}, { withCredentials: true });
      const { processId } = response.data;
      setCurrentProcessId(processId);
      setShowProgressTracker(true);
      toast.success('Manual claim triggered successfully - Opening progress tracker');
    } catch (error: any) {
      toast.error('Failed to trigger manual claim');
    }
  };

  const handleSingleUserClaim = async () => {
    if (!singleUserId.trim()) {
      toast.error('Please enter a User ID');
      return;
    }

    try {
      const response = await axios.post(API_ENDPOINTS.ADMIN_CLAIM_USERS, {
        userIds: [singleUserId.trim()]
      }, { withCredentials: true });
      
      const { processId } = response.data;
      setCurrentProcessId(processId);
      setShowProgressTracker(true);
      toast.success(`Manual claim started for user ${singleUserId}`);
      setSingleUserId(''); // Clear the input
    } catch (error: any) {
      toast.error('Failed to trigger single user claim');
    }
  };

  const handleAssignAvatars = async () => {
    if (avatarAssignmentSelectedUsers.length === 0 || !avatarAssignmentSelectedAvatar) {
      toast.error('Please select users and an avatar');
      return;
    }

    setIsAssigningAvatars(true);
    try {
      const response = await axios.post(API_ENDPOINTS.ADMIN_ASSIGN_AVATARS, {
        userIds: avatarAssignmentSelectedUsers,
        avatarType: avatarAssignmentSelectedAvatar
      }, { withCredentials: true });

      if (response.data.success) {
        const { assigned, failed, results } = response.data;
        toast.success(
          `Avatar assignment completed: ${assigned} assigned, ${failed} failed`,
          { duration: 5000 }
        );
        
        // Clear selections
        setAvatarAssignmentSelectedUsers([]);
        setAvatarAssignmentSelectedAvatar('');
        setAvatarAssignmentSearchQuery('');
        
        // Refresh registrations to show updated avatars
        fetchAdminData();
      } else {
        toast.error('Failed to assign avatars');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to assign avatars');
    } finally {
      setIsAssigningAvatars(false);
    }
  };

  const fetch8BPAvatars = async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.USER_LIST_8BP_AVATARS, {
        withCredentials: true
      });
      if (response.data.success) {
        const avatars = response.data.avatars || [];
        setAvailable8BPAvatars(avatars.map((a: { filename: string }) => a.filename));
      }
    } catch (error) {
      console.error('Error fetching 8BP avatars:', error);
    }
  };

  const handleTestUserClaim = async (userId: string) => {
    try {
      const response = await axios.post(API_ENDPOINTS.ADMIN_CLAIM_USERS, {
        userIds: [userId]
      }, { withCredentials: true });
      
      const { processId } = response.data;
      setCurrentProcessId(processId);
      setShowProgressTracker(true);
      toast.success(`Manual claim started for test user ${userId}`);
    } catch (error: any) {
      toast.error('Failed to trigger test user claim');
    }
  };

  const fetchTestUsers = useCallback(async () => {
    setIsLoadingTestUsers(true);
    try {
      const response = await axios.get(API_ENDPOINTS.ADMIN_TEST_USERS, { withCredentials: true });
      setTestUsers(response.data.testUsers);
    } catch (error: any) {
      console.error('Failed to fetch test users:', error);
      // Set default test users if API fails
      setTestUsers([
        { id: '1826254746', username: 'TestUser1', description: 'Primary test user' },
        { id: '3057211056', username: 'TestUser2', description: 'Secondary test user' },
        { id: '110141', username: 'TestUser3', description: 'Tertiary test user' }
      ]);
    } finally {
      setIsLoadingTestUsers(false);
    }
  }, []);

  const changeBotStatus = async (status: string) => {
    setIsChangingBotStatus(true);
    try {
      const response = await axios.post('/api/admin/bot-status', 
        { status }, 
        { withCredentials: true }
      );
      toast.success(`Bot status changed to ${status.toUpperCase()}`);
      await fetchBotStatus(); // Refresh status
    } catch (error: any) {
      toast.error('Failed to change bot status');
      console.error('Bot status change error:', error);
    } finally {
      setIsChangingBotStatus(false);
    }
  };

  const toggleBot = async () => {
    setIsTogglingBot(true);
    try {
      const newState = !isBotEnabled;
      const response = await axios.post('/api/admin/bot-toggle', 
        { enabled: newState }, 
        { withCredentials: true }
      );
      setIsBotEnabled(newState);
      toast.success(`Bot ${newState ? 'enabled' : 'disabled'} successfully`);
      await fetchBotStatus(); // Refresh status
    } catch (error: any) {
      toast.error(`Failed to ${isBotEnabled ? 'disable' : 'enable'} bot`);
      console.error('Bot toggle error:', error);
    } finally {
      setIsTogglingBot(false);
    }
  };

  const getStatusIcon = (status: string) => {
    if (!status) return <Circle className="w-4 h-4 text-gray-400" />;
    switch (status) {
      case 'online': return <CircleDot className="w-4 h-4 text-green-500" />;
      case 'idle': return <Circle className="w-4 h-4 text-yellow-500" />;
      case 'dnd': return <Circle className="w-4 h-4 text-red-500" />;
      case 'invisible': return <Circle className="w-4 h-4 text-gray-500" />;
      default: return <Circle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    if (!status) return 'text-gray-400';
    switch (status) {
      case 'online': return 'text-green-500';
      case 'idle': return 'text-yellow-500';
      case 'dnd': return 'text-red-500';
      case 'invisible': return 'text-gray-500';
      default: return 'text-gray-400';
    }
  };

  const handleResetLeaderboard = async () => {
    setIsResettingLeaderboard(true);
    try {
      const response = await axios.post(API_ENDPOINTS.ADMIN_RESET_LEADERBOARD, {}, { withCredentials: true });
      const { stats } = response.data;
      
      toast.success(
        `Leaderboard reset successfully! Deleted ${stats.claimRecordsDeleted} claim records, preserved ${stats.usersPreserved} users.`,
        { duration: 6000 }
      );
      
      setShowResetModal(false);
      setResetAccessGranted(false); // Reset access after use
      
      // Refresh the overview data to show updated statistics
      fetchAdminData();
      
    } catch (error: any) {
      toast.error('Failed to reset leaderboard');
      console.error('Reset leaderboard error:', error);
    } finally {
      setIsResettingLeaderboard(false);
    }
  };

  const fetchActiveProcesses = async () => {
    setIsLoadingProcesses(true);
    try {
      const response = await axios.get(API_ENDPOINTS.ADMIN_CLAIM_PROGRESS, { withCredentials: true });
      setActiveProcesses(response.data);
      if (response.data.length > 0) {
        toast.success(`Found ${response.data.length} active claim process(es)`);
      } else {
        toast('No active claim processes found', { icon: 'ℹ️' });
      }
    } catch (error: any) {
      toast.error('Failed to fetch active processes');
      console.error('Error fetching active processes:', error);
    } finally {
      setIsLoadingProcesses(false);
    }
  };

  const fetchHeartbeatData = useCallback(async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.ADMIN_HEARTBEAT_SUMMARY);
      setHeartbeatData(response.data.data);
    } catch (error) {
      console.error('Error fetching heartbeat data:', error);
    }
  }, []);

  const fetchActiveServices = useCallback(async () => {
    setIsLoadingActiveServices(true);
    try {
      logger.debug('🔄 Fetching active services...');
      // Add timestamp to prevent caching
      const timestamp = Date.now();
      const response = await axios.get(`${API_ENDPOINTS.ADMIN_ACTIVE_SERVICES}?t=${timestamp}`, {
        withCredentials: true,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      console.log('✅ Active services response:', response.data);

      if (response.data.success && response.data.data) {
        setActiveServicesData(response.data.data);
        console.log('✅ Active services data set:', response.data.data);
      } else {
        console.error('❌ Invalid response structure:', response.data);
        toast.error('Invalid response from server');
      }
    } catch (error: any) {
      console.error('❌ Error fetching active services:', error);
      console.error('❌ Error response:', error.response?.data);
      toast.error('Failed to fetch active services');
    } finally {
      setIsLoadingActiveServices(false);
    }
  }, []);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const toggleService = (serviceId: string) => {
    setExpandedServices(prev => ({
      ...prev,
      [serviceId]: !prev[serviceId]
    }));
  };

  const fetchPublicDeregRequests = useCallback(async () => {
    setIsLoadingPublicDeregRequests(true);
    try {
      const response = await axios.get(API_ENDPOINTS.ADMIN_PUBLIC_DEREGISTRATION_REQUESTS, { withCredentials: true });
      setPublicDeregRequests(response.data.requests || []);
    } catch (error) {
      logger.error('Failed to fetch public deregistration requests:', error);
      toast.error('Failed to fetch deregistration requests');
    } finally {
      setIsLoadingPublicDeregRequests(false);
    }
  }, []);

  const handleApprovePublicDereg = async (id: string) => {
    if (!window.confirm('Are you sure you want to approve this request? The user will be removed from all tables.')) return;
    try {
      await axios.post(API_ENDPOINTS.ADMIN_PUBLIC_DEREGISTRATION_APPROVE(id), {}, { withCredentials: true });
      toast.success('Deregistration request approved');
      fetchPublicDeregRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to approve request');
    }
  };

  const handleDenyPublicDereg = async (id: string) => {
    if (!window.confirm('Are you sure you want to deny this request?')) return;
    try {
      await axios.post(API_ENDPOINTS.ADMIN_PUBLIC_DEREGISTRATION_DENY(id), {}, { withCredentials: true });
      toast.success('Deregistration request denied');
      fetchPublicDeregRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to deny request');
    }
  };

  const getLanguageIcon = (language: string) => {
    // Return empty string to remove ugly emojis
    return '';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running': return { text: 'Running', color: 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' };
      case 'idle': return { text: 'Idle', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100' };
      case 'failed': return { text: 'Failed', color: 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100' };
      default: return { text: 'Unknown', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100' };
    }
  };

  const connectToProcess = (processId: string) => {
    setCurrentProcessId(processId);
    setShowProgressTracker(true);
    toast.success(`Connected to process ${processId}`);
  };

  const clearUserScreenshots = async () => {
    if (!screenshotUserQuery.trim()) {
      toast.error('Please enter a user ID or username');
      return;
    }

    setIsClearingScreenshots(true);
    try {
      const response = await axios.post('/8bp-rewards/api/admin/screenshots/clear-user', {
        userQuery: screenshotUserQuery.trim()
      }, { withCredentials: true });
      
      toast.success(response.data.message || 'User screenshots cleared successfully');
      setScreenshotUserQuery('');
      // Refresh the screenshot list after clearing
      fetchScreenshotFolders();
      // Clear search if it was for the same user
      if (screenshotSearchQuery && screenshotSearchQuery === screenshotUserQuery.trim()) {
        setScreenshotSearchQuery('');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to clear user screenshots');
      console.error('Error clearing user screenshots:', error);
    } finally {
      setIsClearingScreenshots(false);
    }
  };

  const clearAllScreenshots = async () => {
    if (!window.confirm('Are you sure you want to clear ALL screenshots? This action cannot be undone.')) {
      return;
    }

    setIsClearingScreenshots(true);
    try {
      const response = await axios.post('/8bp-rewards/api/admin/screenshots/clear-all', {}, { withCredentials: true });
      
      toast.success(response.data.message || 'All screenshots cleared successfully');
      // Refresh the screenshot list after clearing
      fetchScreenshotFolders();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to clear all screenshots');
      console.error('Error clearing all screenshots:', error);
    } finally {
      setIsClearingScreenshots(false);
    }
  };

  const fetchScreenshotFolders = useCallback(async () => {
    // Clear any existing timeout
    if (screenshotFetchTimeout) {
      clearTimeout(screenshotFetchTimeout);
    }
    
    // Debounce the API call by 1 second
    const timeout = setTimeout(async () => {
      logger.debug('🔄 Starting to fetch screenshot folders...');
      logger.debug('🔄 Current activeTab:', activeTab);
      logger.debug('🔄 isAuthenticated:', isAuthenticated);
      logger.debug('🔄 isAdmin:', isAdmin);
      setIsLoadingScreenshots(true);
      
      try {
        console.log('📡 Making API call to /8bp-rewards/api/admin/screenshots/folders');
        const response = await axios.get('/8bp-rewards/api/admin/screenshots/folders', { withCredentials: true });
        console.log('✅ API response received:', response.data);
        setAllScreenshotFolders(response.data.folders);
        // Apply current search filter if any
        filterScreenshotsByUser(response.data.folders, screenshotSearchQuery);
        console.log('📁 Screenshot folders set:', response.data.folders.length);
      } catch (error: any) {
        console.error('❌ Screenshots API error:', error);
        console.error('❌ Error details:', {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          url: error.config?.url
        });
        toast.error(`Failed to fetch screenshot folders: ${error.response?.status || error.message}`);
      } finally {
        console.log('🏁 Setting isLoadingScreenshots to false');
        setIsLoadingScreenshots(false);
      }
    }, 1000);
    
    setScreenshotFetchTimeout(timeout);
  }, [screenshotFetchTimeout, screenshotSearchQuery, activeTab, isAuthenticated, isAdmin]);

  const filterScreenshotsByUser = (folders: any[], searchQuery: string) => {
    if (!searchQuery.trim()) {
      setScreenshotFolders(folders);
      return;
    }

    const filteredFolders = folders.map(folder => ({
      ...folder,
      files: folder.files.filter((file: any) => 
        file.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    })).filter(folder => folder.files.length > 0);

    setScreenshotFolders(filteredFolders);
  };

  const handleScreenshotSearch = (query: string) => {
    setScreenshotSearchQuery(query);
    filterScreenshotsByUser(allScreenshotFolders, query);
  };

  const fetchVerificationImages = useCallback(async () => {
    setIsLoadingVerificationImages(true);
    try {
      const response = await axios.get(API_ENDPOINTS.ADMIN_VERIFICATION_IMAGES, {
        withCredentials: true
      });
      if (response.data.success) {
        setVerificationImages(response.data.verificationImages || []);
      }
    } catch (error) {
      console.error('Error fetching verification images:', error);
      toast.error('Failed to load verification images');
    } finally {
      setIsLoadingVerificationImages(false);
    }
  }, []);

  const filteredVerificationImages = useMemo(() => {
    if (!verificationImageSearchQuery.trim()) {
      return verificationImages;
    }
    const query = verificationImageSearchQuery.toLowerCase().trim();
    return verificationImages.filter(img => 
      img.discordId?.toLowerCase().includes(query) ||
      img.uniqueId?.toLowerCase().includes(query) ||
      img.rankName?.toLowerCase().includes(query) ||
      img.level?.toString().includes(query)
    );
  }, [verificationImages, verificationImageSearchQuery]);

  // Fetch deregistration requests
  const fetchDeregistrationRequests = useCallback(async () => {
    setIsLoadingDeregistrationRequests(true);
    try {
      const response = await axios.get(API_ENDPOINTS.ADMIN_DEREGISTRATION_REQUESTS, { withCredentials: true });
      if (response.data.success) {
        setDeregistrationRequests(response.data.requests || []);
      } else {
        toast.error(response.data.error || 'Failed to fetch deregistration requests');
      }
    } catch (error: any) {
      console.error('Error fetching deregistration requests:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to fetch deregistration requests';
      toast.error(errorMessage);
    } finally {
      setIsLoadingDeregistrationRequests(false);
    }
  }, []);

  // Approve deregistration request
  const handleApproveDeregistration = async (requestId: string, eightBallPoolId: string) => {
    const notes = reviewNotes[requestId] || '';
    try {
      await axios.post(API_ENDPOINTS.ADMIN_DEREGISTRATION_REQUEST_APPROVE(requestId), {
        reviewNotes: notes
      }, { withCredentials: true });
      toast.success('Deregistration request approved');
      setReviewNotes({ ...reviewNotes, [requestId]: '' });
      fetchDeregistrationRequests();
      fetchAdminData(); // Refresh admin data to update counts
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to approve deregistration request');
    }
  };

  // Deny deregistration request
  const handleDenyDeregistration = async (requestId: string) => {
    const notes = reviewNotes[requestId] || '';
    try {
      await axios.post(API_ENDPOINTS.ADMIN_DEREGISTRATION_REQUEST_DENY(requestId), {
        reviewNotes: notes
      }, { withCredentials: true });
      toast.success('Deregistration request denied');
      setReviewNotes({ ...reviewNotes, [requestId]: '' });
      fetchDeregistrationRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to deny deregistration request');
    }
  };

  // Fetch deregistered users
  const fetchDeregisteredUsers = useCallback(async () => {
    setIsLoadingDeregisteredUsers(true);
    try {
      const response = await axios.get(API_ENDPOINTS.VALIDATION_DEREGISTERED_USERS, { withCredentials: true });
      setDeregisteredUsers(response.data.users || []);
    } catch (error: any) {
      console.error('Error fetching deregistered users:', error);
      toast.error('Failed to fetch deregistered users');
    } finally {
      setIsLoadingDeregisteredUsers(false);
    }
  }, []);

  // Reregister a user (process registration again)
  const handleReregisterUser = async (eightBallPoolId: string, username?: string) => {
    try {
      toast.loading('Reregistering user...', { id: 'reregister-user' });
      
      // Use the eightBallPoolId as username if not provided (fallback)
      const userUsername = username || eightBallPoolId;
      
      // First, try to remove from invalid_users and registrations if they exist
      // This allows fresh registration
      try {
        // Remove from invalid_users (deregistered users table)
        await axios.delete(
          API_ENDPOINTS.ADMIN_DEREGISTERED_USER_REMOVE(eightBallPoolId),
          { withCredentials: true }
        ).catch(() => {
          // Ignore errors - user might not exist in all tables
        });
        
        // Remove from registrations if exists
        await axios.delete(
          `${API_ENDPOINTS.ADMIN_REGISTRATIONS}/${eightBallPoolId}`,
          { withCredentials: true }
        ).catch(() => {
          // Ignore errors - registration might not exist
        });
      } catch (cleanupError) {
        // Continue even if cleanup fails
        console.log('Cleanup step completed (some records may not exist)');
      }
      
      // Now register fresh
      const response = await axios.post(
        API_ENDPOINTS.ADMIN_REGISTRATIONS,
        { eightBallPoolId, username: userUsername },
        { withCredentials: true }
      );

      if (response.data.message || response.data.user) {
        toast.success('User reregistered successfully! Registration and validation triggered.', { id: 'reregister-user' });
        
        // Refresh the deregistered users list
        await fetchDeregisteredUsers();
      } else {
        toast.error(response.data.error || 'Reregistration failed', { id: 'reregister-user' });
      }
    } catch (error: any) {
      console.error('Error reregistering user:', error);
      toast.error(
        error.response?.data?.error || error.response?.data?.details || 'Failed to reregister user',
        { id: 'reregister-user' }
      );
    }
  };

  // Completely remove a user from all tables (fresh start)
  const handleRemoveUser = async (eightBallPoolId: string) => {
    try {
      const confirmed = window.confirm(
        `Are you sure you want to completely remove user ${eightBallPoolId} from all tables?\n\nThis will delete:\n- Registration\n- Deregistered user record\n- All claim records\n- All validation logs\n\nThis action cannot be undone.`
      );
      
      if (!confirmed) {
        return;
      }

      toast.loading('Removing user from all tables...', { id: 'remove-user' });
      
      const response = await axios.delete(
        API_ENDPOINTS.ADMIN_DEREGISTERED_USER_REMOVE(eightBallPoolId),
        { withCredentials: true }
      );

      if (response.data.success) {
        toast.success(`User ${eightBallPoolId} completely removed from all tables.`, { id: 'remove-user' });
        
        // Refresh the deregistered users list
        await fetchDeregisteredUsers();
      } else {
        toast.error(response.data.error || 'Failed to remove user', { id: 'remove-user' });
      }
    } catch (error: any) {
      console.error('Error removing user:', error);
      toast.error(
        error.response?.data?.error || error.response?.data?.details || 'Failed to remove user',
        { id: 'remove-user' }
      );
    }
  };

  // Fetch system integration data
  const fetchSystemIntegrationData = useCallback(async () => {
    setIsLoadingSystemIntegration(true);
    try {
      const [integrationResponse, healthResponse] = await Promise.all([
        axios.get(`${API_ENDPOINTS.BASE_URL}/8bp-rewards/api/validation/system-integration`, { withCredentials: true }).catch(() => ({ data: { success: false, message: 'Endpoint not available' } })),
        axios.get(`${API_ENDPOINTS.BASE_URL}/8bp-rewards/api/validation/system-health`, { withCredentials: true }).catch(() => ({ data: { success: false, message: 'Endpoint not available' } }))
      ]);
      
      setSystemIntegrationData(integrationResponse.data);
      setModuleHealthData(healthResponse.data);
    } catch (error: any) {
      console.error('Error fetching system integration data:', error);
      toast.error('Failed to fetch system integration data');
    } finally {
      setIsLoadingSystemIntegration(false);
    }
  }, []);

  // Terminal functions
  const checkTerminalAccess = useCallback(async () => {
    try {
      const response = await axios.get('/api/admin/terminal/check-access', { withCredentials: true });
      const hasAccess = response.data.hasAccess;
      setTerminalAccess(hasAccess);
      
      // If user doesn't have access, redirect to admin dashboard
      if (!hasAccess) {
        toast.error('Access denied. You are not authorised to access the Terminal.');
        setActiveTab('overview');
        return;
      }
      
      // If user has access, allow them to access the terminal tab
      setActiveTab('terminal');
    } catch (error: any) {
      toast.error('Failed to check terminal access');
      console.error('Error checking terminal access:', error);
      setTerminalAccess(false);
      setActiveTab('overview');
    }
  }, []);

  // Fetch admin data once on mount/authentication
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return;
    fetchAdminData();
    fetchUserIp();
    fetchTestUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isAdmin]);

  // Tab-specific data fetching
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return;
    
    logger.debug('🔄 useEffect triggered:', { isAuthenticated, isAdmin, activeTab });
    
    // Debounce rapid tab switches to prevent excessive API calls
    const timeoutId = setTimeout(() => {
      // Tab-specific data fetching
      switch (activeTab) {
        case 'tools':
          fetchBotStatus();
          fetch8BPAvatars();
          break;
        case 'logs':
          fetchLogs();
          break;
        case 'vps':
          fetchVpsStats();
          break;
        case 'screenshots':
          logger.debug('🔄 Calling fetchScreenshotFolders because activeTab is screenshots');
          fetchScreenshotFolders();
          break;
        case 'verification-images':
          fetchVerificationImages().catch((err) => logger.error('fetchVerificationImages failed', err));
          break;
        case 'terminal':
          checkTerminalAccess();
          break;
        case 'deregistered-users':
          fetchDeregisteredUsers();
          break;
        case 'deregistration-requests':
          fetchDeregistrationRequests();
          break;
        case 'public-deregister-requests':
          fetchPublicDeregRequests();
          break;
        case 'system-integration':
          fetchSystemIntegrationData();
          break;
        case 'active-services':
        case 'overview':
          fetchActiveServices();
          fetchHeartbeatData();
          break;
      }
    }, 300); // 300ms debounce to prevent rapid-fire requests
    
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isAdmin, activeTab]); // Only depend on these values, not functions

  const verifyMFA = async () => {
    // Check if user is using email or Discord/Telegram
    const usingEmail = codesSent.email && emailCode.trim();
    const usingDiscord = codesSent.discord && discordCode.trim();
    const needsTelegramCode = codesSent.telegram;
    
    // Validate based on method chosen
    if (usingEmail) {
      if (!emailCode.trim() || emailCode.trim().length !== 6) {
        toast.error('Please enter a valid 6-digit email access code');
        return;
      }
    } else {
      if (!discordCode.trim()) {
        toast.error('Please enter the Discord access code');
        return;
      }
      
      if (needsTelegramCode && !telegramCode.trim()) {
        toast.error('Please enter the Telegram access code');
        return;
      }
    }

    try {
      const response = await axios.post('/api/admin/terminal/verify-mfa', {
        discordCode: usingDiscord ? discordCode.trim() : undefined,
        telegramCode: needsTelegramCode ? telegramCode.trim() : undefined,
        emailCode: usingEmail ? emailCode.trim() : undefined
      }, { withCredentials: true });
      
      if (response.data.success) {
        setMfaVerified(true);
        const successMessage = usingEmail 
          ? 'Email code verified successfully. MFA verification complete.'
          : needsTelegramCode 
            ? 'Discord and Telegram codes verified successfully. MFA verification complete.'
            : 'Discord code verified successfully. MFA verification complete.';
        toast.success(successMessage);
      } else {
        toast.error('Invalid MFA codes');
      }
    } catch (error: any) {
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error(error.response?.data?.message || 'MFA verification failed');
      }
      console.error('Error verifying MFA:', error);
    }
  };

  const executeTerminalCommand = async () => {
    if (!terminalCommand.trim()) {
      toast.error('Please enter a command');
      return;
    }

    setIsExecutingCommand(true);
    try {
      const response = await axios.post('/api/admin/terminal/execute', {
        command: terminalCommand.trim()
      }, { withCredentials: true });
      
      if (response.data.success) {
        setTerminalOutput(response.data.output);
        setTerminalCommand('');
      } else {
        setTerminalOutput(`Error: ${response.data.error || 'Command failed'}`);
      }
    } catch (error: any) {
      setTerminalOutput(`Error: ${error.response?.data?.message || 'Failed to execute command'}`);
      console.error('Error executing command:', error);
    } finally {
      setIsExecutingCommand(false);
    }
  };

  const clearMFA = async () => {
    try {
      await axios.post('/api/admin/terminal/clear-mfa', {}, { withCredentials: true });
      setMfaVerified(false);
      setDiscordCode('');
      setTelegramCode('');
      setEmailCode('');
      setCodesSent({discord: false, telegram: false, email: false});
      toast.success('MFA verification cleared');
    } catch (error: any) {
      toast.error('Failed to clear MFA verification');
      console.error('Error clearing MFA:', error);
    }
  };

  const requestMFACodes = async (channel?: string) => {
    setIsRequestingCodes(true);
    try {
      const response = await axios.post('/api/admin/terminal/request-codes', { 
        channel: channel || undefined
      }, { withCredentials: true });
      
      if (response.data.success) {
        if (channel === 'discord') {
          if (response.data.discordSent) {
            setCodesSent(prev => ({ ...prev, discord: true }));
            toast.success('Discord access code sent!');
          } else {
            toast.error('Failed to send Discord code');
          }
        } else if (channel === 'telegram') {
          if (response.data.telegramSent) {
            setCodesSent(prev => ({ ...prev, telegram: true }));
            toast.success('Telegram access code sent!');
          } else {
            toast.error('Failed to send Telegram code');
          }
        } else if (channel === 'email') {
          if (response.data.emailSent) {
            setCodesSent(prev => ({ ...prev, email: true }));
            toast.success(`Email access code sent to ${response.data.adminEmailsCount} admin email(s)!`);
          } else {
            toast.error('Failed to send email code');
          }
        } else {
          // Fallback to sending all codes
          let codesSentCount = 0;
          let message = 'MFA codes sent: ';
          const sentMethods = [];
          
          if (response.data.discordSent) {
            setCodesSent(prev => ({ ...prev, discord: true }));
            sentMethods.push('Discord');
            codesSentCount++;
          }
          
          if (response.data.telegramSent) {
            setCodesSent(prev => ({ ...prev, telegram: true }));
            sentMethods.push('Telegram');
            codesSentCount++;
          }
          
          if (response.data.emailSent) {
            setCodesSent(prev => ({ ...prev, email: true }));
            sentMethods.push(`Email (${response.data.adminEmailsCount} recipients)`);
            codesSentCount++;
          }
          
          if (codesSentCount > 0) {
            message += sentMethods.join(', ');
            message += '. Please check your messages and enter the codes below.';
            toast.success(message);
          } else {
            toast.success('MFA codes generated. Please use the codes provided.');
          }
        }
      } else {
        toast.error('Failed to request MFA codes');
      }
    } catch (error: any) {
      if (error.response?.status === 403) {
        toast.error('Your email is not authorised for email authentication. Please use Discord/Telegram authentication.');
      } else {
        toast.error(error.response?.data?.message || 'Failed to request MFA codes');
      }
      console.error('Error requesting MFA codes:', error);
    } finally {
      setIsRequestingCodes(false);
    }
  };

  const requestEmailCode = async () => {
    await requestMFACodes('email');
  };

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/8bp-rewards/home" replace />;
  }

  const filteredRegistrations = registrations.filter(reg =>
    reg.eightBallPoolId.includes(searchQuery) ||
    reg.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredUsers = registrations.filter((reg: any) => {
    const query = userSearchQuery.toLowerCase();
    if (!query) return true;
    
    // Filter by status
    if (query.startsWith('active:')) return reg.isActive !== false && !reg.isBlocked;
    if (query.startsWith('blocked:')) return reg.isBlocked === true;
    
    return (
      reg.eightBallPoolId.includes(query) ||
      reg.username.toLowerCase().includes(query) ||
      (reg.discordId && reg.discordId.includes(query)) ||
      (reg.registrationIp && reg.registrationIp.includes(query)) ||
      (reg.deviceId && reg.deviceId.toLowerCase().includes(query)) ||
      (reg.deviceType && reg.deviceType.toLowerCase().includes(query))
    );
  });

  return (
    <div className="min-h-screen py-16 sm:py-20 px-4 sm:px-6 lg:px-8 overflow-x-hidden w-full">
      <div className="max-w-7xl mx-auto w-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10"
        >
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">
              Admin Dashboard
            </h1>
            <p className="text-text-secondary">
              Welcome back, {user?.username}! Manage the 8BP Rewards system.
            </p>
          </div>
          
          <div className="flex items-center space-x-4 mt-4 sm:mt-0">
            <div className="flex items-center space-x-2 text-sm text-text-secondary">
              <User className="w-4 h-4" />
              <span>
                {user?.username}
                {user?.discriminator && user.discriminator !== '0' && `#${user.discriminator}`}
              </span>
            </div>
            <Link
              to="/user-dashboard"
              className="btn-primary text-sm inline-flex items-center space-x-2"
            >
              <User className="w-4 h-4" />
              <span>Switch Dashboard</span>
            </Link>
            <button
              onClick={handleLogout}
              className="btn-outline text-sm inline-flex items-center space-x-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="card mb-10"
        >
          <div className="flex flex-wrap gap-3">
            {[
              { id: 'overview', label: 'Overview', icon: Activity },
              { id: 'registrations', label: 'Registrations', icon: Users },
              { id: 'users', label: 'User Management', icon: Shield },
              { id: 'deregistration-requests', label: 'Requested Deregistrations', icon: Send },
              { id: 'public-deregister-requests', label: 'De-Register Requests', icon: UserMinus },
              { id: 'deregistered-users', label: 'Deregistered Users', icon: XCircle },
              { id: 'system-integration', label: 'System Integration Map', icon: Network },
              { id: 'logs', label: 'Logs', icon: FileText },
              { id: 'tools', label: 'Tools', icon: Settings },
              { id: 'progress', label: 'Progress', icon: Monitor },
              { id: 'screenshots', label: 'Screenshots', icon: Camera },
              { id: 'verification-images', label: 'Verification Images', icon: Shield },
              { id: 'terminal', label: 'Terminal', icon: Terminal },
              { id: 'vps', label: 'VPS Monitor', icon: Server },
              { id: 'active-services', label: 'Active Services', icon: Server },
              { id: 'postgresql-db', label: 'PostgreSQL DB', icon: Database },
              { id: 'support-tickets', label: 'Support Tickets', icon: MessageSquare },
            ].map((tab) => {
              const Icon = tab.icon;
              const handleTabClick = () => {
                if (tab.id === 'vps' && !vpsAccessGranted) {
                  setShowVPSAuthModal(true);
                } else if (tab.id === 'terminal') {
                  // Check terminal access before allowing access
                  checkTerminalAccess();
                } else {
                  setActiveTab(tab.id);
                }
              };
              
              return (
                <button
                  key={tab.id}
                  onClick={handleTabClick}
                  className={`btn ${
                    activeTab === tab.id
                      ? 'btn-primary'
                      : 'btn-outline'
                  } inline-flex items-center space-x-2`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="space-y-10"
          >
            {isLoadingData ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
                <p className="text-text-secondary">Loading admin data...</p>
              </div>
            ) : overview ? (
              <>
                {/* Stats Cards */}
                <div className="grid md:grid-cols-2 lg:grid-cols-6 gap-6 lg:gap-8">
                  <div className="card text-center">
                    <Users className="w-8 h-8 text-primary-600 mx-auto mb-2" />
                    <h3 className="text-lg font-semibold text-text-primary mb-1">
                      Total Registrations
                    </h3>
                    <p className="text-2xl font-bold text-primary-600">
                      {overview.registrations.total}
                    </p>
                    <p className="text-sm text-text-secondary">
                      {overview.registrations.recent} this week
                    </p>
                  </div>
                  
                  <div className="card text-center">
                    <TrendingUp className="w-8 h-8 text-primary-600 mx-auto mb-2" />
                    <h3 className="text-lg font-semibold text-text-primary mb-1">
                      Successful Claims
                    </h3>
                    <p className="text-2xl font-bold text-green-600">
                      {overview.claims.find(c => c._id === 'success')?.count || 0}
                    </p>
                    <p className="text-sm text-text-secondary">
                      {overview.claims.find(c => c._id === 'success')?.totalitems || 0} items
                    </p>
                  </div>
                  
                  <div className="card text-center">
                    <Database className="w-8 h-8 text-primary-600 mx-auto mb-2" />
                    <h3 className="text-lg font-semibold text-text-primary mb-1">
                      Log Entries
                    </h3>
                    <p className="text-2xl font-bold text-primary-600">
                      {overview.logs.reduce((sum, log) => sum + log.count, 0)}
                    </p>
                    <p className="text-sm text-text-secondary">
                      This week
                    </p>
                  </div>
                  
                  <div className="card text-center">
                    <Server className="w-8 h-8 text-primary-600 mx-auto mb-2" />
                    <h3 className="text-lg font-semibold text-text-primary mb-1">
                      Active Services
                    </h3>
                    <p className="text-2xl font-bold text-blue-600">
                      {activeServicesData?.activeCount || 0}
                    </p>
                    <p className="text-sm text-text-secondary">
                      {activeServicesData?.totalCount || 0} total
                    </p>
                  </div>
                  
                  <div className="card text-center">
                    <FileText className="w-8 h-8 text-primary-600 mx-auto mb-2" />
                    <h3 className="text-lg font-semibold text-text-primary mb-1">
                      Active Files
                    </h3>
                    <p className="text-2xl font-bold text-green-600">
                      {heartbeatData?.totalActiveFiles || 0}
                    </p>
                    <p className="text-sm text-text-secondary">
                      Heartbeat tracking
                    </p>
                  </div>
                  
                  <div className="card text-center">
                    <XCircle className="w-8 h-8 text-primary-600 mx-auto mb-2" />
                    <h3 className="text-lg font-semibold text-text-primary mb-1">
                      Failed Claims
                    </h3>
                    <p className="text-2xl font-bold text-red-600">
                      {overview.claims.find(c => c._id === 'failed')?.count || 0}
                    </p>
                    <p className="text-sm text-text-secondary">
                      This week
                    </p>
                  </div>
                </div>

                {/* Recent Claims */}
                <div className="card">
                  <h2 className="text-xl font-semibold text-text-primary mb-6">
                    Recent Claims
                  </h2>
                  {overview.recentClaims.length === 0 ? (
                    <p className="text-text-secondary text-center py-8">
                      No recent claims found.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {overview.recentClaims.map((claim, index) => (
                        <div key={index} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-background-dark-tertiary rounded-lg border border-transparent dark:border-dark-accent-navy">
                          <div className="flex items-start gap-4 flex-1">
                            <div className="flex-1">
                              <p className="font-medium text-text-primary dark:text-text-dark-primary">
                                {claim.username || claim.eightBallPoolId}
                              </p>
                              <p className="text-xs text-text-secondary dark:text-text-dark-secondary">
                                ID: {claim.eightBallPoolId}
                              </p>
                              <p className="text-sm text-text-secondary dark:text-text-dark-secondary mt-1">
                                {claim.itemsClaimed && claim.itemsClaimed.length > 0 
                                  ? `${claim.itemsClaimed.length} item(s): ${claim.itemsClaimed.slice(0, 3).join(', ')}${claim.itemsClaimed.length > 3 ? '...' : ''}`
                                  : 'No items claimed'
                                }
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              claim.status === 'success' 
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                                : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                            }`}>
                              {claim.status}
                            </span>
                            <p className="text-sm text-text-secondary dark:text-text-dark-secondary mt-1">
                              {new Date(claim.claimedAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-text-secondary">Failed to load admin data.</p>
              </div>
            )}
          </motion.div>
        )}

        {/* Registrations Tab */}
        {activeTab === 'registrations' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="space-y-6"
          >
            {/* Search and Add */}
            <div className="card">
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="flex items-center space-x-2 flex-1">
                  <Search className="w-5 h-5 text-text-secondary" />
                  <input
                    type="text"
                    placeholder="Search registrations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input flex-1"
                  />
                </div>
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="btn-primary inline-flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Registration</span>
                </button>
              </div>
            </div>

            {/* Add Form */}
            {showAddForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="card"
              >
                <h3 className="text-lg font-semibold text-text-primary mb-4">
                  Add New Registration
                </h3>
                <form onSubmit={handleAddRegistration} className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="label">8 Ball Pool ID</label>
                      <input
                        type="text"
                        value={newRegistration.eightBallPoolId}
                        onChange={(e) => {
                          // Auto-clean: remove all non-numeric characters
                          const cleaned = e.target.value.replace(/[^0-9]/g, '');
                          setNewRegistration({
                            ...newRegistration,
                            eightBallPoolId: cleaned
                          });
                        }}
                        className="input"
                        placeholder="e.g., 1826254746"
                        required
                      />
                    </div>
                    <div>
                      <label className="label">Username</label>
                      <input
                        type="text"
                        value={newRegistration.username}
                        onChange={(e) => setNewRegistration({
                          ...newRegistration,
                          username: e.target.value
                        })}
                        className="input"
                        placeholder="Username"
                        required
                      />
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button type="submit" className="btn-primary">
                      Add Registration
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="btn-outline"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {/* Registrations List */}
            <div className="card">
              <h2 className="text-xl font-semibold text-text-primary mb-6">
                All Registrations ({filteredRegistrations.length})
              </h2>
              {filteredRegistrations.length === 0 ? (
                <p className="text-text-secondary text-center py-8">
                  No registrations found.
                </p>
              ) : (
                <div className="space-y-4">
                  {filteredRegistrations.map((reg) => (
                    <div key={reg._id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-background-dark-tertiary rounded-lg border border-transparent dark:border-dark-accent-navy">
                      <div>
                        <p className="font-medium text-text-primary dark:text-text-dark-primary">
                          {reg.username}
                        </p>
                        <p className="text-sm text-text-secondary dark:text-text-dark-secondary">
                          ID: {reg.eightBallPoolId}
                        </p>
                        <p className="text-sm text-text-secondary dark:text-text-dark-secondary">
                          Registered: {new Date(reg.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveRegistration(reg.eightBallPoolId)}
                        className="btn-outline text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 inline-flex items-center space-x-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Remove</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* User Management Tab */}
        {activeTab === 'users' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="space-y-6"
          >
            <div className="card">
              <h2 className="text-xl font-semibold text-text-primary dark:text-text-dark-primary mb-6">
                User Management
              </h2>
              <p className="text-text-secondary dark:text-text-dark-secondary mb-4">
                View and manage all users. See user status, linked Discord IDs, registration dates, and claim information.
              </p>

              {/* Search Bar */}
              <div className="mb-6">
                <div className="flex items-center space-x-2">
                  <Search className="w-5 h-5 text-text-secondary dark:text-text-dark-secondary" />
                  <input
                    type="text"
                    placeholder="Search by username, 8BP ID, Discord ID, IP address, or device type..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="input flex-1"
                  />
                </div>
                {userSearchQuery && (
                  <p className="text-sm text-text-secondary dark:text-text-dark-secondary mt-2">
                    Found {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>

              {/* Status Filter */}
              <div className="mb-6">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setUserSearchQuery('')}
                    className="btn-outline text-sm"
                  >
                    All Users
                  </button>
                  <button
                    onClick={() => setUserSearchQuery('active:')}
                    className="btn-outline text-sm"
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setUserSearchQuery('blocked:')}
                    className="btn-outline text-sm"
                  >
                    Blocked
                  </button>
                </div>
              </div>

              {isLoadingData ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
                  <p className="text-text-secondary dark:text-text-dark-secondary">Loading users...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-3 px-4 font-semibold text-text-primary dark:text-text-dark-primary">Username</th>
                        <th className="text-left py-3 px-4 font-semibold text-text-primary dark:text-text-dark-primary">8BP ID</th>
                        <th className="text-left py-3 px-4 font-semibold text-text-primary dark:text-text-dark-primary">Status</th>
                        <th className="text-left py-3 px-4 font-semibold text-text-primary dark:text-text-dark-primary">Discord ID</th>
                        <th className="text-left py-3 px-4 font-semibold text-text-primary dark:text-text-dark-primary">Registration Date</th>
                        <th className="text-left py-3 px-4 font-semibold text-text-primary dark:text-text-dark-primary">Successful Claims</th>
                        <th className="text-left py-3 px-4 font-semibold text-text-primary dark:text-text-dark-primary">Failed Claims</th>
                        <th className="text-left py-3 px-4 font-semibold text-text-primary dark:text-text-dark-primary">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((reg: any) => {
                        // Determine user status
                        const userStatus = reg.isBlocked ? 'Blocked' : (reg.isActive === false ? 'Inactive' : 'Active');
                        const statusColor = userStatus === 'Active' 
                          ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                          : userStatus === 'Blocked'
                          ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                          : 'bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200';

                        return (
                          <tr key={reg._id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                            <td className="py-3 px-4">
                              <div>
                                <p className="font-medium text-text-primary dark:text-text-dark-primary">
                                  {reg.username || 'Unknown'}
                                </p>
                                {reg.registrationIp && (
                                  <p className="text-xs text-text-secondary dark:text-text-dark-secondary font-mono">
                                    IP: {reg.registrationIp}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-mono text-text-primary dark:text-text-dark-primary">
                                {reg.eightBallPoolId}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${statusColor}`}>
                                {userStatus}
                              </span>
                              {reg.isBlocked && reg.blockedReason && (
                                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                  {reg.blockedReason}
                                </p>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {reg.discordId ? (
                                <span className="font-mono text-text-primary dark:text-text-dark-primary">
                                  {reg.discordId}
                                </span>
                              ) : (
                                <span className="text-text-secondary dark:text-text-dark-secondary text-sm">
                                  Not linked
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span className="text-text-secondary dark:text-text-dark-secondary text-sm">
                                {reg.createdAt ? new Date(reg.createdAt).toLocaleDateString() : 'Unknown'}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-semibold text-green-600 dark:text-green-400">
                                {reg.successfulClaims !== undefined ? reg.successfulClaims : '-'}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-semibold text-red-600 dark:text-red-400">
                                {reg.failedClaims !== undefined ? reg.failedClaims : '-'}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <button
                                onClick={async () => {
                                  const reason = reg.isBlocked ? '' : prompt('Reason for blocking this user?');
                                  if (reg.isBlocked || (reason !== null && reason.trim())) {
                                    try {
                                      await axios.post(getAdminUserBlockEndpoint(reg.eightBallPoolId), {
                                        isBlocked: !reg.isBlocked,
                                        reason: reason?.trim()
                                      }, { withCredentials: true });
                                      toast.success(reg.isBlocked ? 'User unblocked' : 'User blocked');
                                      fetchAdminData();
                                    } catch (error) {
                                      toast.error('Failed to update block status');
                                    }
                                  }
                                }}
                                className={`btn ${reg.isBlocked ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'} text-sm inline-flex items-center space-x-2`}
                              >
                                <Shield className="w-4 h-4" />
                                <span>{reg.isBlocked ? 'Unblock' : 'Block'}</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredUsers.length === 0 && (
                    <div className="text-center py-8 text-text-secondary dark:text-text-dark-secondary">
                      <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                      <p>No users found</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Requested Deregistrations Tab */}
        {activeTab === 'deregistration-requests' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="space-y-6"
          >
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-text-primary dark:text-text-dark-primary flex items-center">
                  <Send className="w-8 h-8 text-orange-500 mr-3" />
                  Requested Deregistrations
                </h2>
                <button
                  onClick={fetchDeregistrationRequests}
                  disabled={isLoadingDeregistrationRequests}
                  className="btn-primary flex items-center"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingDeregistrationRequests ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {isLoadingDeregistrationRequests ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                  <p className="text-text-secondary dark:text-text-dark-secondary mt-2">Loading deregistration requests...</p>
                </div>
              ) : deregistrationRequests.length === 0 ? (
                <div className="text-center py-12">
                  <Send className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <p className="text-text-secondary dark:text-text-dark-secondary text-lg">No pending deregistration requests</p>
                  <p className="text-text-secondary dark:text-text-dark-secondary text-sm mt-2">All requests have been processed</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {deregistrationRequests.map((request: any) => (
                    <div key={request.id} className="p-6 bg-gray-50 dark:bg-background-dark-tertiary rounded-lg border border-gray-200 dark:border-dark-accent-navy">
                      <div className="grid md:grid-cols-2 gap-6">
                        {/* Left Column - Request Info */}
                        <div className="space-y-4">
                          <div>
                            <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-3">
                              Request Details
                            </h3>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-text-secondary dark:text-text-dark-secondary">8 Ball Pool ID:</span>
                                <span className="font-mono text-text-primary dark:text-text-dark-primary">{request.eight_ball_pool_id}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-text-secondary dark:text-text-dark-secondary">Username:</span>
                                <span className="text-text-primary dark:text-text-dark-primary">{request.username || 'Unknown'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-text-secondary dark:text-text-dark-secondary">Discord ID:</span>
                                <span className="font-mono text-text-primary dark:text-text-dark-primary">{request.discord_id || 'Not linked'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-text-secondary dark:text-text-dark-secondary">Date Requested:</span>
                                <span className="text-text-primary dark:text-text-dark-primary">
                                  {new Date(request.requested_at).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-text-secondary dark:text-text-dark-secondary">Status:</span>
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  request.status === 'pending' ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200' :
                                  request.status === 'approved' ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' :
                                  'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                                }`}>
                                  {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                                </span>
                              </div>
                              {request.ip_address && (
                                <div className="flex justify-between">
                                  <span className="text-text-secondary dark:text-text-dark-secondary">IP Address:</span>
                                  <span className="font-mono text-text-primary dark:text-text-dark-primary">{request.ip_address}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Claim Statistics */}
                          <div className="pt-4 border-t border-gray-200 dark:border-dark-accent-navy">
                            <h4 className="text-md font-semibold text-text-primary dark:text-text-dark-primary mb-2">
                              Claim Statistics
                            </h4>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="text-text-secondary dark:text-text-dark-secondary">Successful:</span>
                                <span className="ml-2 font-semibold text-green-600 dark:text-green-400">{request.successfulClaims || 0}</span>
                              </div>
                              <div>
                                <span className="text-text-secondary dark:text-text-dark-secondary">Failed:</span>
                                <span className="ml-2 font-semibold text-red-600 dark:text-red-400">{request.failedClaims || 0}</span>
                              </div>
                            </div>
                          </div>

                          {/* Screenshot */}
                          {request.screenshotUrl && (
                            <div className="pt-4 border-t border-gray-200 dark:border-dark-accent-navy">
                              <h4 className="text-md font-semibold text-text-primary dark:text-text-dark-primary mb-2">
                                Confirmation Screenshot
                              </h4>
                              <img
                                src={request.screenshotUrl}
                                alt={`Confirmation for ${request.eight_ball_pool_id}`}
                                className="w-full max-w-md rounded-lg border border-gray-200 dark:border-dark-accent-navy cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => window.open(request.screenshotUrl, '_blank')}
                              />
                            </div>
                          )}
                        </div>

                        {/* Right Column - Actions */}
                        <div className="space-y-4">
                          <div>
                            <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-3">
                              Review Notes
                            </h3>
                            <textarea
                              value={reviewNotes[request.id] || ''}
                              onChange={(e) => setReviewNotes({ ...reviewNotes, [request.id]: e.target.value })}
                              placeholder="Add review notes (optional)..."
                              className="input w-full h-32 resize-none"
                              rows={5}
                            />
                          </div>

                          <div className="flex flex-col sm:flex-row gap-3 pt-4">
                            <button
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to approve the deregistration request for ${request.eight_ball_pool_id}? This will permanently delete the account.`)) {
                                  handleApproveDeregistration(request.id, request.eight_ball_pool_id);
                                }
                              }}
                              className="btn-primary flex-1 inline-flex items-center justify-center space-x-2"
                            >
                              <CheckCircle className="w-4 h-4" />
                              <span>Approve</span>
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to deny the deregistration request for ${request.eight_ball_pool_id}?`)) {
                                  handleDenyDeregistration(request.id);
                                }
                              }}
                              className="btn-outline border-red-500 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex-1 inline-flex items-center justify-center space-x-2"
                            >
                              <XCircle className="w-4 h-4" />
                              <span>Deny</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Deregistered Users Tab */}
        {activeTab === 'deregistered-users' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="space-y-6"
          >
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-text-primary dark:text-text-dark-primary flex items-center">
                  <XCircle className="w-8 h-8 text-red-500 mr-3" />
                  Deregistered Users
                </h2>
                <button
                  onClick={fetchDeregisteredUsers}
                  disabled={isLoadingDeregisteredUsers}
                  className="btn-primary flex items-center"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingDeregisteredUsers ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {/* Filters */}
              <div className="grid md:grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="label">Source Module</label>
                  <select
                    value={deregisteredUsersFilter.sourceModule}
                    onChange={(e) => setDeregisteredUsersFilter({...deregisteredUsersFilter, sourceModule: e.target.value})}
                    className="input"
                  >
                    <option value="">All Modules</option>
                    <option value="playwright-claimer-discord">Playwright Claimer Discord</option>
                    <option value="playwright-claimer">Playwright Claimer</option>
                    <option value="first-time-claimer">First Time Claimer</option>
                    <option value="8bp-claimer-ts">8BP Claimer TS</option>
                    <option value="simple-claimer">Simple Claimer</option>
                    <option value="scheduler-service">Scheduler Service</option>
                    <option value="registration-api">Registration API</option>
                  </select>
                </div>
                <div>
                  <label className="label">Reason</label>
                  <select
                    value={deregisteredUsersFilter.reason}
                    onChange={(e) => setDeregisteredUsersFilter({...deregisteredUsersFilter, reason: e.target.value})}
                    className="input"
                  >
                    <option value="">All Reasons</option>
                    <option value="invalid_format">Invalid Format</option>
                    <option value="database_invalid">Database Invalid</option>
                    <option value="api_failed">API Failed</option>
                    <option value="validation_error">Validation Error</option>
                  </select>
                </div>
                <div>
                  <label className="label">Search</label>
                  <input
                    type="text"
                    placeholder="Search by user ID..."
                    value={deregisteredUsersFilter.search}
                    onChange={(e) => setDeregisteredUsersFilter({...deregisteredUsersFilter, search: e.target.value})}
                    className="input"
                  />
                </div>
              </div>

              {/* Users Table */}
              {isLoadingDeregisteredUsers ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                  <p className="text-text-secondary dark:text-text-dark-secondary mt-2">Loading deregistered users...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-3 px-4 font-semibold text-text-primary dark:text-text-dark-primary">User ID</th>
                        <th className="text-left py-3 px-4 font-semibold text-text-primary dark:text-text-dark-primary">Source Module</th>
                        <th className="text-left py-3 px-4 font-semibold text-text-primary dark:text-text-dark-primary">Reason</th>
                        <th className="text-left py-3 px-4 font-semibold text-text-primary dark:text-text-dark-primary">Error Message</th>
                        <th className="text-left py-3 px-4 font-semibold text-text-primary dark:text-text-dark-primary">Deregistered At</th>
                        <th className="text-left py-3 px-4 font-semibold text-text-primary dark:text-text-dark-primary">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deregisteredUsers
                        .filter(user => {
                          if (deregisteredUsersFilter.sourceModule && user.source_module !== deregisteredUsersFilter.sourceModule) return false;
                          if (deregisteredUsersFilter.reason && user.deregistration_reason !== deregisteredUsersFilter.reason) return false;
                          if (deregisteredUsersFilter.search && !user.eight_ball_pool_id.includes(deregisteredUsersFilter.search)) return false;
                          return true;
                        })
                        .map((user, index) => (
                        <tr key={index} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="py-3 px-4 text-text-primary dark:text-text-dark-primary font-mono">{user.eight_ball_pool_id}</td>
                          <td className="py-3 px-4 text-text-primary dark:text-text-dark-primary">
                            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-sm">
                              {user.source_module}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-text-primary dark:text-text-dark-primary">
                            <span className={`px-2 py-1 rounded text-sm ${
                              user.deregistration_reason === 'invalid_format' ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200' :
                              user.deregistration_reason === 'database_invalid' ? 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200' :
                              user.deregistration_reason === 'api_failed' ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200' :
                              'bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200'
                            }`}>
                              {user.deregistration_reason}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-text-secondary dark:text-text-dark-secondary text-sm max-w-xs truncate" title={user.error_message}>
                            {user.error_message}
                          </td>
                          <td className="py-3 px-4 text-text-secondary dark:text-text-dark-secondary text-sm">
                            {new Date(user.deregistered_at).toLocaleString()}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleReregisterUser(user.eight_ball_pool_id, user.eight_ball_pool_id)}
                                className="btn-secondary text-sm hover:bg-green-100 dark:hover:bg-green-900 px-3 py-1"
                                title={`Reregister user ${user.eight_ball_pool_id}`}
                              >
                                Reregister
                              </button>
                              <button
                                onClick={() => handleRemoveUser(user.eight_ball_pool_id)}
                                className="btn-secondary text-sm hover:bg-red-100 dark:hover:bg-red-900 px-3 py-1 text-red-600 dark:text-red-400"
                                title={`Completely remove user ${user.eight_ball_pool_id} from all tables`}
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {deregisteredUsers.length === 0 && (
                    <div className="text-center py-8 text-text-secondary dark:text-text-dark-secondary">
                      <XCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                      <p>No deregistered users found</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* System Integration Map Tab */}
        {activeTab === 'system-integration' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="space-y-6"
          >
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-text-primary dark:text-text-dark-primary flex items-center">
                  <Network className="w-8 h-8 text-blue-500 mr-3" />
                  System Integration Map
                </h2>
                <button
                  onClick={fetchSystemIntegrationData}
                  disabled={isLoadingSystemIntegration}
                  className="btn-primary flex items-center"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingSystemIntegration ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {isLoadingSystemIntegration ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                  <p className="text-text-secondary dark:text-text-dark-secondary mt-2">Loading system integration data...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Module Status Overview */}
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-4">Module Integration Status</h3>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {moduleHealthData?.moduleStats && Object.entries(moduleHealthData.moduleStats).map(([module, stats]: [string, any]) => (
                        <div key={module} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-text-primary dark:text-text-dark-primary">{module}</h4>
                            <div className={`w-3 h-3 rounded-full ${
                              stats.validation_error > 0 ? 'bg-red-500' :
                              stats.validation_failure > 0 ? 'bg-yellow-500' :
                              'bg-green-500'
                            }`}></div>
                          </div>
                          <div className="space-y-1 text-sm text-text-secondary dark:text-text-dark-secondary">
                            <div>Attempts: {stats.validation_attempt || 0}</div>
                            <div>Success: {stats.validation_success || 0}</div>
                            <div>Failures: {stats.validation_failure || 0}</div>
                            <div>Errors: {stats.validation_error || 0}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* System Health Metrics */}
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-4">System Health Metrics</h3>
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-center">
                        <div className="text-2xl font-bold text-text-primary dark:text-text-dark-primary">
                          {moduleHealthData?.data?.cacheSize || moduleHealthData?.data?.heartbeat?.totalActiveFiles || 0}
                        </div>
                        <div className="text-sm text-text-secondary dark:text-text-dark-secondary">Cache Entries</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-center">
                        <div className="text-2xl font-bold text-text-primary dark:text-text-dark-primary">
                          {moduleHealthData?.data?.errorCounts || 0}
                        </div>
                        <div className="text-sm text-text-secondary dark:text-text-dark-secondary">Error Counts</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-center">
                        <div className="text-2xl font-bold text-text-primary dark:text-text-dark-primary">
                          {Object.keys(moduleHealthData?.data?.moduleStats || {}).length}
                        </div>
                        <div className="text-sm text-text-secondary dark:text-text-dark-secondary">Active Modules</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-center">
                        <div className={`text-2xl font-bold ${
                          moduleHealthData?.data?.status === 'online' ? 'text-green-500' : 'text-red-500'
                        }`}>
                          {moduleHealthData?.data?.status === 'online' || moduleHealthData?.data?.timestamp ? 'Online' : 'Offline'}
                        </div>
                        <div className="text-sm text-text-secondary dark:text-text-dark-secondary">Status</div>
                      </div>
                    </div>
                  </div>

                  {/* Integration Map */}
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-4">Integration Map</h3>
                    <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg">
                      {systemIntegrationData?.data?.modulesByCategory ? (
                        <div className="grid md:grid-cols-2 gap-6">
                          {Object.entries(systemIntegrationData.data.modulesByCategory).map(([category, modules]: [string, any]) => (
                            <div key={category}>
                              <h4 className="font-semibold text-text-primary dark:text-text-dark-primary mb-3">{category}</h4>
                              <div className="space-y-2">
                                {modules.map((module: any) => {
                                  const isOnline = module.status === 'integrated' || module.isLive;
                                  const hasStats = module.stats && (
                                    module.stats.validation_attempt > 0 ||
                                    module.stats.validation_success > 0 ||
                                    module.stats.validation_failure > 0 ||
                                    module.stats.validation_error > 0
                                  );
                                  const isActive = isOnline && hasStats;
                                  
                                  return (
                                    <div key={module.name} className="flex items-center justify-between p-2 bg-white dark:bg-gray-700 rounded">
                                      <span className="text-sm text-text-primary dark:text-text-dark-primary">{module.name}</span>
                                      {isActive ? (
                                        <div title="Online">
                                          <CheckCircle className="w-4 h-4 text-green-500" />
                                        </div>
                                      ) : isOnline ? (
                                        <div className="w-4 h-4 rounded-full bg-yellow-500" title="Detected but no activity" />
                                      ) : (
                                        <div title="Offline">
                                          <XCircle className="w-4 h-4 text-gray-400" />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-text-secondary dark:text-text-dark-secondary">
                          <p>No integration data available. Please refresh to load service status.</p>
                        </div>
                      )}
                      {systemIntegrationData?.data?.heartbeat && (
                        <div className="mt-6 pt-6 border-t border-gray-300 dark:border-gray-600">
                          <h4 className="font-semibold text-text-primary dark:text-text-dark-primary mb-3">Heartbeat Status</h4>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <div className="text-text-secondary dark:text-text-dark-secondary">Active Files</div>
                              <div className="text-lg font-bold text-text-primary dark:text-text-dark-primary">
                                {systemIntegrationData.data.heartbeat.totalActiveFiles || 0}
                              </div>
                            </div>
                            <div>
                              <div className="text-text-secondary dark:text-text-dark-secondary">Active Processes</div>
                              <div className="text-lg font-bold text-text-primary dark:text-text-dark-primary">
                                {systemIntegrationData.data.heartbeat.activeProcesses || 0}
                              </div>
                            </div>
                            <div>
                              <div className="text-text-secondary dark:text-text-dark-secondary">Active Services</div>
                              <div className="text-lg font-bold text-text-primary dark:text-text-dark-primary">
                                {systemIntegrationData.data.heartbeat.activeServices?.length || 0}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="space-y-6"
          >
            {/* Filters */}
            <div className="card">
              <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-4">
                Filter Logs
              </h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="label">Level</label>
                  <select
                    value={logFilters.level}
                    onChange={(e) => {
                      setLogFilters({...logFilters, level: e.target.value});
                      fetchLogs();
                    }}
                    className="input"
                  >
                    <option value="">All Levels</option>
                    <option value="info">Info</option>
                    <option value="warn">Warning</option>
                    <option value="error">Error</option>
                  </select>
                </div>
                <div>
                  <label className="label">Action</label>
                  <input
                    type="text"
                    placeholder="e.g. admin_access, oauth_success"
                    value={logFilters.action}
                    onChange={(e) => setLogFilters({...logFilters, action: e.target.value})}
                    className="input"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={fetchLogs}
                    className="btn-primary w-full inline-flex items-center justify-center space-x-2"
                  >
                    <Filter className="w-4 h-4" />
                    <span>Apply Filters</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Logs List */}
            <div className="card">
              <h2 className="text-xl font-semibold text-text-primary dark:text-text-dark-primary mb-6">
                System Logs ({logs.length})
              </h2>
              {logs.length === 0 ? (
                <p className="text-text-secondary dark:text-text-dark-secondary text-center py-8">
                  No logs found.
                </p>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {logs.map((log, index) => (
                    <div key={index} className="p-3 bg-gray-50 dark:bg-background-dark-tertiary rounded-lg border border-transparent dark:border-dark-accent-navy">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              log.level === 'error' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400' :
                              log.level === 'warn' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400' :
                              'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
                            }`}>
                              {log.level || 'info'}
                            </span>
                            {log.action && (
                              <span className="text-xs text-text-secondary dark:text-text-dark-secondary font-mono">
                                {log.action}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-text-primary dark:text-text-dark-primary font-mono">
                            {log.message}
                          </p>
                          {log.userId && (
                            <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">
                              User: {log.userId}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-text-secondary dark:text-text-dark-secondary whitespace-nowrap ml-4">
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Tools Tab */}
        {activeTab === 'tools' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="space-y-6"
          >
            <div className="grid md:grid-cols-2 gap-6">
              <div className="card">
                <h3 className="text-lg font-semibold text-text-primary mb-4">
                  Manual Actions
                </h3>
                <div className="space-y-4">
                  {/* Claim All Users */}
                  <button
                    onClick={handleManualClaim}
                    className="btn-primary w-full inline-flex items-center justify-center space-x-2"
                  >
                    <Play className="w-4 h-4" />
                    <span>Claim All Users</span>
                  </button>
                  
                  {/* Single User Claim */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-text-primary">
                      Claim Single User
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        placeholder="Enter User ID"
                        value={singleUserId}
                        onChange={(e) => {
                          // Only allow numbers
                          const value = e.target.value.replace(/[^0-9]/g, '');
                          setSingleUserId(value);
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-text-primary dark:text-text-dark-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={handleSingleUserClaim}
                        disabled={!singleUserId.trim()}
                        className="btn-secondary inline-flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Play className="w-4 h-4" />
                        <span>Claim</span>
                      </button>
                    </div>
                  </div>

                  {/* Test Users Quick Claim */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-text-primary">
                      Quick Test Claims
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      {testUsers.map((user) => (
                        <button
                          key={user.id}
                          onClick={() => handleTestUserClaim(user.id)}
                          className="btn-secondary text-left inline-flex items-center justify-between space-x-2 text-sm"
                        >
                          <span>{user.username} ({user.id})</span>
                          <Play className="w-3 h-3" />
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Reset Leaderboard */}
                  <button
                    onClick={() => {
                      if (resetAccessGranted) {
                        setShowResetModal(true);
                      } else {
                        setShowResetAuthModal(true);
                      }
                    }}
                    className="btn-primary w-full inline-flex items-center justify-center space-x-2"
                    style={{ marginTop: '8px' }}
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Reset Leaderboard</span>
                  </button>
                  
                </div>
              </div>

              {/* Bot Status Control */}
              <div className="card">
                <h3 className="text-lg font-semibold text-text-primary mb-4">
                  Bot Status Control
                </h3>
                <div className="space-y-4">
                  {/* Current Status Display */}
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Bot className="w-5 h-5 text-text-secondary" />
                      <div>
                        <p className="text-sm text-text-secondary">Current Status</p>
                        <div className="flex items-center space-x-2">
                          {botStatus && botStatus.currentStatus ? (
                            <>
                              {getStatusIcon(botStatus.currentStatus)}
                              <span className={`font-medium ${getStatusColor(botStatus.currentStatus)}`}>
                                {botStatus.currentStatus.toUpperCase()}
                              </span>
                            </>
                          ) : (
                            <span className="text-gray-400">Loading...</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {isLoadingBotStatus && (
                      <RefreshCw className="w-4 h-4 animate-spin text-text-secondary" />
                    )}
                  </div>

                  {/* Bot On/Off Toggle */}
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Bot className="w-5 h-5 text-text-secondary" />
                      <div>
                        <p className="text-sm text-text-secondary">Bot Control</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {isBotEnabled ? 'Bot is enabled and running' : 'Bot is disabled'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={toggleBot}
                      disabled={isTogglingBot}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                        isBotEnabled ? 'bg-green-600' : 'bg-gray-200 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isBotEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Status Change Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => changeBotStatus('online')}
                      disabled={isChangingBotStatus}
                      className="btn-primary text-sm py-2 px-3 inline-flex items-center justify-center space-x-1"
                    >
                      <CircleDot className="w-3 h-3 text-green-500" />
                      <span>Online</span>
                    </button>
                    <button
                      onClick={() => changeBotStatus('idle')}
                      disabled={isChangingBotStatus}
                      className="btn-primary text-sm py-2 px-3 inline-flex items-center justify-center space-x-1"
                    >
                      <Circle className="w-3 h-3 text-yellow-500" />
                      <span>Idle</span>
                    </button>
                    <button
                      onClick={() => changeBotStatus('dnd')}
                      disabled={isChangingBotStatus}
                      className="btn-primary text-sm py-2 px-3 inline-flex items-center justify-center space-x-1"
                    >
                      <Circle className="w-3 h-3 text-red-500" />
                      <span>DND</span>
                    </button>
                    <button
                      onClick={() => changeBotStatus('invisible')}
                      disabled={isChangingBotStatus}
                      className="btn-primary text-sm py-2 px-3 inline-flex items-center justify-center space-x-1"
                    >
                      <Circle className="w-3 h-3 text-gray-500" />
                      <span>Offline</span>
                    </button>
                  </div>

                  {/* Refresh Button */}
                  <button
                    onClick={fetchBotStatus}
                    disabled={isLoadingBotStatus}
                    className="w-full btn-secondary text-sm py-2 inline-flex items-center justify-center space-x-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingBotStatus ? 'animate-spin' : ''}`} />
                    <span>Refresh Status</span>
                  </button>
                </div>
              </div>

              <div className="card">
                <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-4">
                  System Information
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-secondary dark:text-text-dark-secondary">Admin User:</span>
                    <span className="text-text-primary dark:text-text-dark-primary">{user?.username}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary dark:text-text-dark-secondary">Discord ID:</span>
                    <span className="text-text-primary dark:text-text-dark-primary">{user?.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary dark:text-text-dark-secondary">Your IP Address:</span>
                    <span className="text-text-primary dark:text-text-dark-primary font-mono">{userIp}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary dark:text-text-dark-secondary">Last Login:</span>
                    <span className="text-text-primary dark:text-text-dark-primary">Now</span>
                  </div>
                </div>
              </div>

              {/* Avatar Assignment */}
              <div className="card md:col-span-2">
                <h3 className="text-lg font-semibold text-text-primary mb-4">
                  Avatar Assignment
                </h3>
                <div className="space-y-4">
                  {/* User Search and Selection */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-text-primary">
                      Select Users
                    </label>
                    <input
                      type="text"
                      placeholder="Search by username or ID..."
                      value={avatarAssignmentSearchQuery}
                      onChange={(e) => setAvatarAssignmentSearchQuery(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-text-primary dark:text-text-dark-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="max-h-48 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700">
                      {registrations
                        .filter((reg) => {
                          const query = avatarAssignmentSearchQuery.toLowerCase();
                          return (
                            reg.username?.toLowerCase().includes(query) ||
                            reg.eightBallPoolId?.toLowerCase().includes(query)
                          );
                        })
                        .map((reg) => {
                          const isSelected = avatarAssignmentSelectedUsers.includes(reg.eightBallPoolId);
                          return (
                            <div
                              key={reg.eightBallPoolId}
                              className="flex items-center space-x-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer"
                              onClick={() => {
                                if (isSelected) {
                                  setAvatarAssignmentSelectedUsers(
                                    avatarAssignmentSelectedUsers.filter((id) => id !== reg.eightBallPoolId)
                                  );
                                } else {
                                  setAvatarAssignmentSelectedUsers([
                                    ...avatarAssignmentSelectedUsers,
                                    reg.eightBallPoolId
                                  ]);
                                }
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                              />
                              <span className="text-sm text-text-primary">
                                {reg.username} ({reg.eightBallPoolId})
                              </span>
                            </div>
                          );
                        })}
                    </div>
                    {avatarAssignmentSelectedUsers.length > 0 && (
                      <p className="text-xs text-text-secondary">
                        {avatarAssignmentSelectedUsers.length} user(s) selected
                      </p>
                    )}
                  </div>

                  {/* Avatar Selection */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-text-primary">
                      Select Avatar
                    </label>
                    <select
                      value={avatarAssignmentSelectedAvatar}
                      onChange={(e) => setAvatarAssignmentSelectedAvatar(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-text-primary dark:text-text-dark-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- Select Avatar --</option>
                      <option value="random">Random</option>
                      {available8BPAvatars.map((avatar) => (
                        <option key={avatar} value={avatar}>
                          {avatar}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleAssignAvatars}
                      disabled={
                        isAssigningAvatars ||
                        avatarAssignmentSelectedUsers.length === 0 ||
                        !avatarAssignmentSelectedAvatar
                      }
                      className="btn-primary inline-flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>{isAssigningAvatars ? 'Assigning...' : 'Assign'}</span>
                    </button>
                    <button
                      onClick={() => {
                        setAvatarAssignmentSelectedUsers([]);
                        setAvatarAssignmentSelectedAvatar('');
                        setAvatarAssignmentSearchQuery('');
                      }}
                      className="btn-secondary inline-flex items-center space-x-2"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Clear</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Progress Tab */}
        {activeTab === 'progress' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="space-y-6"
          >
            <div className="card">
              <h2 className="text-xl font-semibold text-text-primary dark:text-text-dark-primary mb-6">
                Claim Progress Tracker
              </h2>
              
              <div className="space-y-4">
                <p className="text-text-secondary dark:text-text-dark-secondary">
                  Monitor real-time progress of manual claim processes. Click the button below to start tracking a claim process.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={handleManualClaim}
                    className="btn-primary inline-flex items-center justify-center space-x-2"
                  >
                    <Play className="w-4 h-4" />
                    <span>Trigger Manual Claim</span>
                  </button>
                  
                  <button
                    onClick={fetchActiveProcesses}
                    disabled={isLoadingProcesses}
                    className="btn-secondary inline-flex items-center justify-center space-x-2"
                  >
                    {isLoadingProcesses ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Activity className="w-4 h-4" />
                    )}
                    <span>View Active Progress</span>
                  </button>
                  
                  {currentProcessId && (
                    <button
                      onClick={() => setShowProgressTracker(true)}
                      className="btn-secondary inline-flex items-center justify-center space-x-2"
                    >
                      <Monitor className="w-4 h-4" />
                      <span>View Progress Tracker</span>
                    </button>
                  )}
                </div>
                
                {currentProcessId && (
                  <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Activity className="w-5 h-5 text-green-600" />
                      <span className="text-sm font-medium text-green-800 dark:text-green-200">
                        Active Process ID: {currentProcessId}
                      </span>
                    </div>
                    <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                      Click "View Progress Tracker" to monitor the claim process in real-time
                    </p>
                  </div>
                )}

                {activeProcesses.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-4">
                      Active Claim Processes ({activeProcesses.length})
                    </h4>
                    <div className="space-y-3">
                      {activeProcesses.map((process) => (
                        <div key={process.processId} className="card p-4">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
                            <div className="flex items-center space-x-3">
                              <div className="flex items-center space-x-2">
                                {process.status === 'running' ? (
                                  <Activity className="w-5 h-5 text-blue-500" />
                                ) : process.status === 'completed' ? (
                                  <CheckCircle className="w-5 h-5 text-green-500" />
                                ) : (
                                  <XCircle className="w-5 h-5 text-red-500" />
                                )}
                                <span className="font-medium text-text-primary dark:text-text-dark-primary">
                                  Process ID: {process.processId}
                                </span>
                              </div>
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                process.status === 'running' ? 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100' :
                                process.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' :
                                'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
                              }`}>
                                {process.status}
                              </span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
                              <div className="text-sm text-text-secondary dark:text-text-dark-secondary">
                                <div className="flex justify-between sm:block sm:text-right">
                                  <span>Total: {process.totalUsers || 0}</span>
                                  <span className="sm:block">Completed: {process.completedUsers || 0}</span>
                                  <span className="sm:block">Failed: {process.failedUsers || 0}</span>
                                </div>
                              </div>
                              <button
                                onClick={() => connectToProcess(process.processId)}
                                className="btn-primary text-sm px-3 py-1 w-full sm:w-auto"
                              >
                                Connect
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Verification Images Tab */}
        {activeTab === 'verification-images' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="space-y-6"
          >
            <div className="card">
              <h2 className="text-xl font-semibold text-text-primary dark:text-text-dark-primary mb-6">
                Verification Images Management
              </h2>
              <p className="text-text-secondary dark:text-text-dark-secondary mb-6">
                View all verification images submitted by users. Search by Discord ID, Unique ID, level, or rank name.
              </p>

              {/* Search Bar */}
              <div className="mb-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search by Discord ID, Unique ID, Level, or Rank..."
                    value={verificationImageSearchQuery}
                    onChange={(e) => setVerificationImageSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white dark:bg-background-dark-tertiary border border-gray-200 dark:border-white/10 text-text-primary dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-dark-accent-blue"
                  />
                  {verificationImageSearchQuery && (
                    <button
                      onClick={() => setVerificationImageSearchQuery('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Loading State */}
              {isLoadingVerificationImages ? (
                <div className="card p-12 text-center">
                  <RefreshCw className="w-10 h-10 text-gray-400 dark:text-gray-500 mx-auto mb-4 animate-spin" />
                  <p className="text-text-secondary dark:text-text-dark-secondary">Loading verification images...</p>
                </div>
              ) : filteredVerificationImages.length === 0 ? (
                <div className="card p-12 text-center">
                  <div className="w-20 h-20 bg-gray-100 dark:bg-background-dark-tertiary rounded-full flex items-center justify-center mx-auto mb-6">
                    <Shield className="w-10 h-10 text-gray-400 dark:text-gray-500" />
                  </div>
                  <h3 className="text-xl font-bold text-text-primary dark:text-white mb-2">
                    {verificationImageSearchQuery ? 'No Matching Verification Images' : 'No Verification Images Yet'}
                  </h3>
                  <p className="text-text-secondary dark:text-text-dark-secondary max-w-md mx-auto">
                    {verificationImageSearchQuery 
                      ? 'Try adjusting your search criteria.'
                      : 'Verification images will appear here after users submit verification screenshots via Discord.'}
                  </p>
                  {verificationImageSearchQuery && (
                    <button
                      onClick={() => setVerificationImageSearchQuery('')}
                      className="mt-4 btn btn-primary"
                    >
                      Clear Search
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <p className="text-text-secondary dark:text-text-dark-secondary">
                      Showing {filteredVerificationImages.length} of {verificationImages.length} verification images
                    </p>
                    <button
                      onClick={fetchVerificationImages}
                      disabled={isLoadingVerificationImages}
                      className="btn btn-secondary flex items-center space-x-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoadingVerificationImages ? 'animate-spin' : ''}`} />
                      <span>Refresh</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredVerificationImages.map((image) => (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        key={image.filename}
                        className="group relative aspect-[9/16] rounded-2xl overflow-hidden bg-gray-100 dark:bg-background-dark-tertiary shadow-lg border border-white/20 dark:border-white/5"
                      >
                        <img
                          src={`${image.imageUrl}?t=${Date.now()}`}
                          alt={`Verification for ${image.uniqueId || image.discordId || 'account'}`}
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          loading="lazy"
                          crossOrigin="anonymous"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const fallback = target.nextElementSibling as HTMLElement;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                        <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-gray-100 dark:bg-background-dark-tertiary" style={{ display: 'none' }}>
                          <div className="text-center text-gray-500 dark:text-gray-400">
                            <Shield className="w-8 h-8 mx-auto mb-2" />
                            <p className="text-sm">Image not found</p>
                          </div>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                          {image.discordId && (
                            <p className="text-white text-xs font-medium mb-1">
                              Discord ID: {image.discordId}
                            </p>
                          )}
                          {image.uniqueId && (
                            <p className="text-white text-xs font-medium mb-1">
                              Unique ID: {image.uniqueId}
                            </p>
                          )}
                          {image.level && (
                            <p className="text-white text-xs font-medium mb-1">
                              Level: {image.level}
                            </p>
                          )}
                          {image.rankName && (
                            <p className="text-white text-xs font-medium mb-1">
                              Rank: {image.rankName}
                            </p>
                          )}
                          {image.capturedAt && (
                            <p className="text-white text-xs font-medium mb-1">
                              {new Date(image.capturedAt).toLocaleDateString()}
                            </p>
                          )}
                          <button 
                            onClick={() => window.open(image.imageUrl, '_blank')}
                            className="w-full btn bg-white/20 backdrop-blur-md text-white hover:bg-white/30 border-none text-xs py-2 mt-2"
                          >
                            View Full Size
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Screenshots Tab */}
        {activeTab === 'screenshots' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="space-y-6"
          >
            <div className="card">
              <h2 className="text-xl font-semibold text-text-primary dark:text-text-dark-primary mb-6">
                Screenshot Management
              </h2>
              <p className="text-text-secondary dark:text-text-dark-secondary mb-6">
                Manage screenshots taken during the claiming process. Clear specific user screenshots or all screenshots at once.
              </p>

              {/* Clear Specific User Screenshots */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-4">
                  Clear Specific User Screenshots
                </h3>
                <p className="text-text-secondary dark:text-text-dark-secondary mb-4">
                  Enter a user ID or username to clear all screenshots for that specific user.
                </p>
                
                <div className="flex gap-4 items-end">
                  <div className="flex-1">
                    <label className="label">User ID or Username</label>
                    <input
                      type="text"
                      value={screenshotUserQuery}
                      onChange={(e) => setScreenshotUserQuery(e.target.value)}
                      placeholder="Enter user ID or username..."
                      className="input"
                      disabled={isClearingScreenshots}
                    />
                  </div>
                  <button
                    onClick={clearUserScreenshots}
                    disabled={isClearingScreenshots || !screenshotUserQuery.trim()}
                    className="btn btn-primary inline-flex items-center space-x-2"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{isClearingScreenshots ? 'Clearing...' : 'Clear User Screenshots'}</span>
                  </button>
                </div>
              </div>

              {/* Clear All Screenshots */}
              <div className="border-t border-gray-200 dark:border-dark-accent-navy pt-6">
                <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-4">
                  Clear All Screenshots
                </h3>
                <p className="text-text-secondary dark:text-text-dark-secondary mb-4">
                  <span className="text-red-500 font-medium">Warning:</span> This will delete ALL screenshots from all users. This action cannot be undone.
                </p>
                
                <button
                  onClick={clearAllScreenshots}
                  disabled={isClearingScreenshots}
                  className="btn btn-outline border-red-500 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 inline-flex items-center space-x-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isClearingScreenshots ? 'Clearing All...' : 'Clear All Screenshots'}</span>
                </button>
              </div>
            </div>

            {/* Screenshot Folders Display */}
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-text-primary dark:text-text-dark-primary">
                  Screenshot Folders
                </h2>
                <div className="flex items-center space-x-3">
                  {/* Search by User ID */}
                  <div className="relative">
                    <input
                      type="text"
                      value={screenshotSearchQuery}
                      onChange={(e) => handleScreenshotSearch(e.target.value)}
                      placeholder="Search by user ID..."
                      className="input pr-10 w-48"
                      disabled={isLoadingScreenshots}
                    />
                    {screenshotSearchQuery && (
                      <button
                        onClick={() => handleScreenshotSearch('')}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-text-primary"
                        title="Clear search"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={fetchScreenshotFolders}
                    disabled={isLoadingScreenshots}
                    className="btn btn-outline inline-flex items-center space-x-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingScreenshots ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* Search Results Info */}
              {screenshotSearchQuery && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    <Search className="w-4 h-4 inline mr-1" />
                    Showing screenshots for user ID: <span className="font-medium">{screenshotSearchQuery}</span>
                    <button
                      onClick={() => handleScreenshotSearch('')}
                      className="ml-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 underline"
                    >
                      Clear filter
                    </button>
                  </p>
                </div>
              )}

              {isLoadingScreenshots ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto"></div>
                  <p className="text-text-secondary dark:text-text-dark-secondary mt-2">Loading screenshots...</p>
                </div>
              ) : screenshotFolders.length === 0 ? (
                <div className="text-center py-8">
                  <Camera className="w-12 h-12 text-text-secondary dark:text-text-dark-secondary mx-auto mb-4" />
                  <p className="text-text-secondary dark:text-text-dark-secondary">
                    {screenshotSearchQuery ? `No screenshots found for user ID: ${screenshotSearchQuery}` : 'No screenshots found'}
                  </p>
                  {screenshotSearchQuery && (
                    <button
                      onClick={() => handleScreenshotSearch('')}
                      className="mt-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 underline text-sm"
                    >
                      View all screenshots
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {screenshotFolders.map((folder) => (
                    <div key={folder.name} className="border border-gray-200 dark:border-dark-accent-navy rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary">
                          {folder.displayName}
                        </h3>
                        <span className="text-sm text-text-secondary dark:text-text-dark-secondary">
                          {folder.files.length} files
                        </span>
                      </div>
                      
                      {folder.files.length === 0 ? (
                        <p className="text-text-secondary dark:text-text-dark-secondary text-sm">No screenshots in this folder</p>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                          {folder.files.map((file: any) => (
                            <div key={file.name} className="group relative">
                              <div className="aspect-video bg-gray-100 dark:bg-background-dark-tertiary rounded-lg overflow-hidden border border-gray-200 dark:border-dark-accent-navy">
                                <img
                                  src={`/8bp-rewards/api/admin/screenshots/view/${folder.name}/${file.name}`}
                                  alt={file.name}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const fallback = target.nextElementSibling as HTMLElement;
                                    if (fallback) fallback.style.display = 'flex';
                                  }}
                                />
                                <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-background-dark-tertiary" style={{ display: 'none' }}>
                                  <div className="text-center text-gray-500 dark:text-gray-400">
                                    <Camera className="w-8 h-8 mx-auto mb-2" />
                                    <p className="text-sm">Image not found</p>
                                  </div>
                                </div>
                              </div>
                              <div className="mt-2">
                                <p className="text-xs text-text-secondary dark:text-text-dark-secondary truncate">
                                  {file.name}
                                </p>
                                <p className="text-xs text-text-secondary dark:text-text-dark-secondary">
                                  {file.size}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Terminal Tab */}
        {activeTab === 'terminal' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="space-y-6"
          >
            {terminalAccess === null ? (
              <div className="card text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-4"></div>
                <p className="text-text-secondary dark:text-text-dark-secondary">Checking terminal access...</p>
              </div>
            ) : !terminalAccess ? (
              <div className="card text-center py-8">
                <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">Access Denied</h2>
                <p className="text-text-secondary dark:text-text-dark-secondary mb-4">
                  You do not have permission to access the Terminal.
                </p>
                <p className="text-sm text-text-secondary dark:text-text-dark-secondary">
                  Only users listed in VPS_OWNERS environment variable can access this feature.
                </p>
              </div>
            ) : !mfaVerified ? (
              <div className="max-w-md mx-auto">
                <div className="card text-center">
                  <h2 className="text-xl font-semibold text-text-primary dark:text-text-dark-primary mb-6">
                    Multi-Factor Authentication Required
                  </h2>
                  <p className="text-text-secondary dark:text-text-dark-secondary mb-6">
                    Please verify your codes to access the Terminal. You can use either Discord/Telegram codes OR email code.
                  </p>
                  
                  {/* Request Access Codes Section */}
                  <div className="mb-6">
                    <div className="flex items-center justify-center mb-4">
                      <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                        <Send className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                      </div>
                    </div>
                    <h3 className="text-lg font-medium text-text-primary dark:text-text-dark-primary mb-2">
                      Request Access Codes
                    </h3>
                    <p className="text-text-secondary dark:text-text-dark-secondary mb-6">
                      Request access codes via Discord, Telegram, or Email. You'll need the provided code to access the Terminal.
                    </p>
                  </div>
                  
                  {/* Authentication Buttons */}
                  <div className="space-y-4 mb-6">
                    {/* Discord Button */}
                    <button
                      onClick={() => requestMFACodes('discord')}
                      disabled={isRequestingCodes || codesSent.discord}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center space-x-2"
                    >
                      <Send className="w-4 h-4" />
                      <span>{codesSent.discord ? 'Discord Code Sent ✓' : 'Send Discord Code'}</span>
                    </button>
                    
                    {/* Telegram Button */}
                    <button
                      onClick={() => requestMFACodes('telegram')}
                      disabled={isRequestingCodes || codesSent.telegram}
                      className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center space-x-2"
                    >
                      <Send className="w-4 h-4" />
                      <span>{codesSent.telegram ? 'Telegram Code Sent ✓' : 'Send Telegram Code'}</span>
                    </button>
                    
                    {/* Divider */}
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
                      </div>
                      <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-white dark:bg-background-dark-secondary text-text-secondary dark:text-text-dark-secondary">
                          or
                        </span>
                      </div>
                    </div>
                    
                    {/* Email Button */}
                    <button
                      onClick={requestEmailCode}
                      disabled={isRequestingCodes || codesSent.email}
                      className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center space-x-2"
                    >
                      <Send className="w-4 h-4" />
                      <span>{codesSent.email ? 'Email Code Sent ✓' : 'Send Email Code (6-Digit PIN)'}</span>
                    </button>
                  </div>
                  
                  {/* Input Fields - Only show when codes are sent */}
                  {(codesSent.discord || codesSent.telegram || codesSent.email) && (
                    <div className="space-y-4">
                      {/* Discord Code Input */}
                      {codesSent.discord && (
                        <div>
                          <label className="label">Discord Code (16 digits)</label>
                          <input
                            type="text"
                            value={discordCode}
                            onChange={(e) => setDiscordCode(e.target.value)}
                            placeholder="Enter 16-digit Discord code..."
                            className="input"
                            maxLength={16}
                          />
                        </div>
                      )}
                      
                      {/* Telegram Code Input */}
                      {codesSent.telegram && (
                        <div>
                          <label className="label">Telegram Code (16 digits)</label>
                          <input
                            type="text"
                            value={telegramCode}
                            onChange={(e) => setTelegramCode(e.target.value)}
                            placeholder="Enter 16-digit Telegram code..."
                            className="input"
                            maxLength={16}
                          />
                        </div>
                      )}
                      
                      {/* Email Code Input */}
                      {codesSent.email && (
                        <div>
                          <div className="text-xs text-text-secondary dark:text-text-dark-secondary text-center mb-2">
                            📧 Code sent to admin email(s)
                          </div>
                          <label className="label">Email Access Code (6 digits)</label>
                          <input
                            type="text"
                            value={emailCode}
                            onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="Enter 6-digit code"
                            className="input text-center text-2xl tracking-widest font-mono"
                            maxLength={6}
                          />
                        </div>
                      )}
                      
                      {/* Verify Button */}
                      <button
                        onClick={verifyMFA}
                        disabled={
                          isRequestingCodes || 
                          (codesSent.email && emailCode.trim().length !== 6) ||
                          (!codesSent.email && (!discordCode.trim() || (codesSent.telegram && !telegramCode.trim())))
                        }
                        className="btn btn-primary inline-flex items-center space-x-2"
                      >
                        <Shield className="w-4 h-4" />
                        <span>Verify MFA</span>
                      </button>
                      
                      {/* Error Messages */}
                      {(discordCode.length > 0 && discordCode.length !== 16) || (telegramCode.length > 0 && telegramCode.length !== 16) || (emailCode.length > 0 && emailCode.length !== 6) ? (
                        <div className="text-sm text-red-600 dark:text-red-400">
                          ⚠️ {codesSent.email ? 'Email code must be exactly 6 digits' : 'Discord and Telegram codes must be exactly 16 digits'}
                        </div>
                      ) : null}
                    </div>
                  )}
                  
                  {/* Footer */}
                  <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-text-secondary dark:text-text-dark-secondary text-center">
                      🔒 Secure authentication via Discord, Telegram, or Email • Codes expire in 5 minutes
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Terminal Header */}
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-text-primary dark:text-text-dark-primary">
                      Terminal
                    </h2>
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1 text-green-600 dark:text-green-400">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-sm">MFA Verified</span>
                      </div>
                      <button
                        onClick={clearMFA}
                        className="btn btn-outline text-sm"
                      >
                        Clear MFA
                      </button>
                    </div>
                  </div>
                  
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                    <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">What This Terminal Can Do:</h3>
                    <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                      <li>• Monitor system status (CPU, memory, disk usage)</li>
                      <li>• Check running processes and services</li>
                      <li>• Manage Docker containers and images</li>
                      <li>• View logs and system information</li>
                      <li>• Navigate directories and view files</li>
                      <li>• Monitor application status (Node.js, databases)</li>
                      <li>• Check network connections and ports</li>
                    </ul>
                  </div>
                  
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
                    <h3 className="font-semibold text-red-800 dark:text-red-200 mb-2">⚠️ Important Risks & Limitations:</h3>
                    <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                      <li>• <strong>Commands execute on the live VPS server</strong> - any mistakes can affect the entire system</li>
                      <li>• <strong>Only safe commands are allowed</strong> - dangerous commands like rm, sudo, shutdown are blocked</li>
                      <li>• <strong>30-second timeout</strong> - long-running commands will be terminated</li>
                      <li>• <strong>All commands are logged</strong> - your actions are recorded for security</li>
                      <li>• <strong>MFA expires after 1 hour</strong> - you'll need to re-verify periodically</li>
                      <li>• <strong>No file modification</strong> - commands are read-only for safety</li>
                    </ul>
                  </div>
                  
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      <strong>Security Note:</strong> This terminal is restricted to Discord user IDs listed in VPS_OWNERS environment variable and requires multi-factor authentication.
                    </p>
                  </div>
                </div>

                {/* Real Terminal Interface */}
                <div className="card p-0 overflow-hidden">
                  {/* Terminal Header */}
                  <div className="bg-gray-900 text-green-400 font-mono p-4 rounded-t-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center">
                        <div className="flex space-x-2">
                          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                          <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        </div>
                        <span className="ml-4 text-sm text-gray-300">Terminal - 8BP VPS</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-xs text-gray-400">
                          {new Date().toLocaleTimeString()}
                        </div>
                        <button
                          onClick={() => setShowCommandHelp(true)}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          help
                        </button>
                      </div>
                    </div>
                    
                    {/* Terminal Content */}
                    <div className="space-y-1 min-h-80 max-h-96 overflow-y-auto">
                      {/* Welcome message */}
                      <div className="text-blue-400 mb-2">
                        Welcome to 8BP VPS Terminal
                      </div>
                      <div className="text-gray-400 text-sm mb-4">
                        Type 'help' for available commands. Use 'clear' to clear the terminal.
                      </div>
                      
                      {/* Command history and output */}
                      {terminalOutput && (
                        <div className="whitespace-pre-wrap text-sm">
                          {terminalOutput}
                        </div>
                      )}
                      
                      {/* Current command line */}
                      <div className="flex items-center mt-2">
                        <span className="text-blue-400">blake@8bp-vps</span>
                        <span className="text-white mx-1">:</span>
                        <span className="text-yellow-400">~</span>
                        <span className="text-white mx-1">$</span>
                        <span className="text-white">{terminalCommand}</span>
                        <span className="animate-pulse bg-green-400 w-2 h-4 ml-1"></span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Command input */}
                  <div className="bg-gray-800 p-4 rounded-b-lg">
                    <div className="flex items-center space-x-2">
                      <span className="text-green-400 font-mono">$</span>
                      <input
                        type="text"
                        value={terminalCommand}
                        onChange={(e) => setTerminalCommand(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            executeTerminalCommand();
                          }
                        }}
                        placeholder="Enter command..."
                        className="flex-1 bg-transparent text-green-400 font-mono outline-none placeholder-gray-500"
                        disabled={isExecutingCommand}
                        autoFocus
                      />
                      {isExecutingCommand && (
                        <span className="text-yellow-400 text-sm">Executing...</span>
                      )}
                    </div>
                    
                    <div className="mt-3 text-xs text-gray-400">
										<p><strong>Allowed commands:</strong> ls, pwd, whoami, date, uptime, df, free, ps, top, htop, systemctl, docker, git, npm, node, nginx, apache2, tail, head, grep, find, cat, less, more</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Command Help Modal */}
        {showCommandHelp && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-background-dark-primary rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-accent-navy">
                <h2 className="text-2xl font-bold text-text-primary dark:text-text-dark-primary">
                  Command Help Reference
                </h2>
                <button
                  onClick={() => setShowCommandHelp(false)}
                  className="text-text-secondary dark:text-text-dark-secondary hover:text-text-primary dark:hover:text-text-dark-primary"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                <div className="space-y-6">
                  {/* System Information */}
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-3 flex items-center">
                      <Server className="w-5 h-5 mr-2" />
                      System Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">whoami</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Show current user</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">pwd</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Show current directory</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">date</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Show current date/time</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">uptime</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Show system uptime</p>
                      </div>
                    </div>
                  </div>

                  {/* File System */}
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-3 flex items-center">
                      <HardDrive className="w-5 h-5 mr-2" />
                      File System & Navigation
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">ls</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">List directory contents</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">ls -la</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">List with details</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">df -h</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Show disk usage</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">find . -name "*.log"</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Find log files</p>
                      </div>
                    </div>
                  </div>

                  {/* System Resources */}
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-3 flex items-center">
                      <Cpu className="w-5 h-5 mr-2" />
                      System Resources
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">free -h</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Show memory usage</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">ps aux</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Show running processes</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">top</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Interactive process monitor</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">htop</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Enhanced process monitor</p>
                      </div>
                    </div>
                  </div>

                  {/* Docker Commands */}
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-3 flex items-center">
                      <Terminal className="w-5 h-5 mr-2" />
                      Docker Management
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">docker ps</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Show running containers</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">docker ps -a</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Show all containers</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">docker images</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Show Docker images</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">docker logs [container]</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Show container logs</p>
                      </div>
                    </div>
                  </div>

                  {/* Service Management */}
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-3 flex items-center">
                      <Settings className="w-5 h-5 mr-2" />
                      Service Management
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">systemctl status nginx</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Check nginx status</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">systemctl status docker</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Check Docker status</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
											<code className="text-sm font-mono text-blue-600 dark:text-blue-400">docker compose ps</code>
											<p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Check container status</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
											<code className="text-sm font-mono text-blue-600 dark:text-blue-400">docker compose logs backend</code>
											<p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Tail backend logs</p>
                      </div>
                    </div>
                  </div>

                  {/* Database Management */}
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-3 flex items-center">
                      <Database className="w-5 h-5 mr-2" />
                      Database Management
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">clear-failed-claims</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Remove all failed claim records from database</p>
                      </div>
                    </div>
                  </div>

                  {/* Log Viewing */}
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-3 flex items-center">
                      <FileText className="w-5 h-5 mr-2" />
                      Log Viewing
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">tail -f backend.log</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Follow backend logs</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">tail -n 50 backend.log</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Last 50 lines</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">grep "ERROR" backend.log</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Find error messages</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">cat package.json</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">View file contents</p>
                      </div>
                    </div>
                  </div>

                  {/* Network & Ports */}
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-3 flex items-center">
                      <Wifi className="w-5 h-5 mr-2" />
                      Network & Ports
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">netstat -tulpn</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Show listening ports</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">ss -tulpn</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Modern port listing</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">curl localhost:2600</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Test backend API</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-background-dark-secondary p-3 rounded-lg">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">ping google.com</code>
                        <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">Test connectivity</p>
                      </div>
                    </div>
                  </div>

                  {/* Quick Tips */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">💡 Quick Tips:</h3>
                    <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                      <li>• Use <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">Tab</code> for command completion</li>
                      <li>• Press <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">Ctrl+C</code> to cancel long-running commands</li>
                      <li>• Use <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">|</code> to pipe output between commands</li>
                      <li>• Add <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">-h</code> flag for human-readable output</li>
                      <li>• Use <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">grep</code> to filter command output</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VPS Monitor Tab */}
        {activeTab === 'vps' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="space-y-6"
          >
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <h2 className="text-xl font-semibold text-text-primary dark:text-text-dark-primary">
                    VPS Monitor
                  </h2>
                  {wsConnected && wsStatus === 'connected' ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                        Live Updates
                      </span>
                    </div>
                  ) : wsStatus === 'connecting' ? (
                    <div className="flex items-center space-x-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-yellow-600 dark:text-yellow-400" />
                      <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                        Connecting...
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                      <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                        Disconnected
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={fetchVpsStats}
                    disabled={isLoadingVpsStats}
                    className="btn-secondary text-sm px-3 py-1 inline-flex items-center space-x-1"
                  >
                    {isLoadingVpsStats ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {isLoadingVpsStats && !vpsStats ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
                  <p className="text-text-secondary">Loading VPS statistics...</p>
                </div>
              ) : vpsStats ? (
                <div className="space-y-6">
                  {/* System Overview */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="card p-4">
                      <div className="flex items-center space-x-3">
                        <Server className="w-8 h-8 text-blue-500" />
                        <div>
                          <h3 className="font-semibold text-text-primary dark:text-text-dark-primary">System</h3>
                          <p className="text-sm text-text-secondary dark:text-text-dark-secondary">{vpsStats.system.hostname}</p>
                          <p className="text-xs text-text-secondary dark:text-text-dark-secondary">{vpsStats.system.platform} {vpsStats.system.arch}</p>
                        </div>
                      </div>
                    </div>

                    <div className="card p-4">
                      <div className="flex items-center space-x-3">
                        <Clock className="w-8 h-8 text-green-500" />
                        <div>
                          <h3 className="font-semibold text-text-primary dark:text-text-dark-primary">Uptime</h3>
                          <p className="text-sm text-text-secondary dark:text-text-dark-secondary">{vpsStats.uptime}</p>
                        </div>
                      </div>
                    </div>

                    <div className="card p-4">
                      <div className="flex items-center space-x-3">
                        <Cpu className="w-8 h-8 text-purple-500" />
                        <div>
                          <h3 className="font-semibold text-text-primary dark:text-text-dark-primary">CPU</h3>
                          <p className="text-sm text-text-secondary dark:text-text-dark-secondary">{vpsStats.cpu.usage.toFixed(1)}%</p>
                          <p className="text-xs text-text-secondary dark:text-text-dark-secondary">{vpsStats.cpu.cores} cores</p>
                        </div>
                      </div>
                    </div>

                    <div className="card p-4">
                      <div className="flex items-center space-x-3">
                        <HardDrive className="w-8 h-8 text-orange-500" />
                        <div>
                          <h3 className="font-semibold text-text-primary dark:text-text-dark-primary">Memory</h3>
                          <p className="text-sm text-text-secondary dark:text-text-dark-secondary">{vpsStats.memory.usagePercent.toFixed(1)}%</p>
                          <p className="text-xs text-text-secondary dark:text-text-dark-secondary">
                            {(vpsStats.memory.used / 1024 / 1024 / 1024).toFixed(1)}GB / {(vpsStats.memory.total / 1024 / 1024 / 1024).toFixed(1)}GB
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Real-time Charts */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    {/* CPU Usage Chart */}
                    <div className="card p-6">
                      <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-4 flex items-center space-x-2">
                        <Cpu className="w-5 h-5" />
                        <span>CPU Usage (Real-time)</span>
                      </h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis 
                              dataKey="time" 
                              stroke="#9CA3AF"
                              fontSize={12}
                              interval={0}
                              tick={{ fontSize: 10 }}
                            />
                            <YAxis 
                              domain={[0, 100]}
                              stroke="#9CA3AF"
                              fontSize={12}
                              label={{ value: '%', angle: -90, position: 'insideLeft' }}
                            />
                            <Tooltip 
                              contentStyle={{
                                backgroundColor: '#1F2937',
                                border: '1px solid #374151',
                                borderRadius: '8px',
                                color: '#F9FAFB'
                              }}
                              labelStyle={{ color: '#F9FAFB' }}
                              formatter={(value: number, name: string) => [
                                `${value.toFixed(1)}%`, 
                                name === 'cpu' ? 'CPU' : 'Memory'
                              ]}
                            />
                            <Area
                              type="monotone"
                              dataKey="cpu"
                              stroke="#8B5CF6"
                              fill="#8B5CF6"
                              fillOpacity={0.3}
                              strokeWidth={2}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Memory Usage Chart */}
                    <div className="card p-6">
                      <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-4 flex items-center space-x-2">
                        <HardDrive className="w-5 h-5" />
                        <span>Memory Usage (Real-time)</span>
                      </h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis 
                              dataKey="time" 
                              stroke="#9CA3AF"
                              fontSize={12}
                              interval={0}
                              tick={{ fontSize: 10 }}
                            />
                            <YAxis 
                              domain={[0, 100]}
                              stroke="#9CA3AF"
                              fontSize={12}
                              label={{ value: '%', angle: -90, position: 'insideLeft' }}
                            />
                            <Tooltip 
                              contentStyle={{
                                backgroundColor: '#1F2937',
                                border: '1px solid #374151',
                                borderRadius: '8px',
                                color: '#F9FAFB'
                              }}
                              labelStyle={{ color: '#F9FAFB' }}
                              formatter={(value: number, name: string) => [
                                `${value.toFixed(1)}%`, 
                                name === 'memory' ? 'Memory' : 'CPU'
                              ]}
                            />
                            <Area
                              type="monotone"
                              dataKey="memory"
                              stroke="#F59E0B"
                              fill="#F59E0B"
                              fillOpacity={0.3}
                              strokeWidth={2}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Combined CPU & Memory Chart */}
                  <div className="card p-6 mb-6">
                    <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-4 flex items-center space-x-2">
                      <Activity className="w-5 h-5" />
                      <span>CPU & Memory Usage Comparison</span>
                      <span className="text-xs text-gray-500 ml-2">({chartData.length} points)</span>
                    </h3>
                    <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          {console.log('Chart rendering with data:', chartData)}
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="time" 
                            tick={{ fontSize: 12 }}
                            interval="preserveStartEnd"
                          />
                          <YAxis 
                            domain={[0, 100]} 
                            tick={{ fontSize: 12 }}
                          />
                          <Tooltip />
                          <Line type="monotone" dataKey="cpu" stroke="#8B5CF6" strokeWidth={2} />
                          <Line type="monotone" dataKey="memory" stroke="#F59E0B" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Detailed Stats */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Memory Details */}
                    <div className="card p-6">
                      <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-4 flex items-center space-x-2">
                        <HardDrive className="w-5 h-5" />
                        <span>Memory Usage</span>
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary dark:text-text-dark-secondary">Used</span>
                          <span className="font-medium">{(vpsStats.memory.used / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary dark:text-text-dark-secondary">Available</span>
                          <span className="font-medium">{(vpsStats.memory.available / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary dark:text-text-dark-secondary">Swap Used</span>
                          <span className="font-medium">{(vpsStats.memory.swap.used / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${vpsStats.memory.usagePercent}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    {/* Disk Details */}
                    <div className="card p-6">
                      <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-4 flex items-center space-x-2">
                        <HardDrive className="w-5 h-5" />
                        <span>Disk Usage</span>
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary dark:text-text-dark-secondary">Used</span>
                          <span className="font-medium">{(vpsStats.disk.used / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary dark:text-text-dark-secondary">Free</span>
                          <span className="font-medium">{(vpsStats.disk.free / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary dark:text-text-dark-secondary">Total</span>
                          <span className="font-medium">{(vpsStats.disk.total / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${vpsStats.disk.usagePercent}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    {/* Network & Ping */}
                    <div className="card p-6">
                      <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-4 flex items-center space-x-2">
                        <Wifi className="w-5 h-5" />
                        <span>Network & Ping</span>
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary dark:text-text-dark-secondary">Google</span>
                          <span className={`font-medium ${vpsStats.ping.google > 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {vpsStats.ping.google > 0 ? `${vpsStats.ping.google.toFixed(2)}ms` : 'Failed'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary dark:text-text-dark-secondary">Cloudflare</span>
                          <span className={`font-medium ${vpsStats.ping.cloudflare > 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {vpsStats.ping.cloudflare > 0 ? `${vpsStats.ping.cloudflare.toFixed(2)}ms` : 'Failed'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary dark:text-text-dark-secondary">Localhost</span>
                          <span className={`font-medium ${vpsStats.ping.localhost > 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {vpsStats.ping.localhost > 0 ? `${vpsStats.ping.localhost.toFixed(2)}ms` : 'Failed'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary dark:text-text-dark-secondary">Active Connections</span>
                          <span className="font-medium">{vpsStats.network.connections}</span>
                        </div>
                      </div>
                    </div>

                    {/* Processes & Services */}
                    <div className="card p-6">
                      <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-4 flex items-center space-x-2">
                        <Activity className="w-5 h-5" />
                        <span>Processes & Services</span>
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary dark:text-text-dark-secondary">Total Processes</span>
                          <span className="font-medium">{vpsStats.processes.total}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary dark:text-text-dark-secondary">Running</span>
                          <span className="font-medium text-green-500">{vpsStats.processes.running}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary dark:text-text-dark-secondary">Sleeping</span>
                          <span className="font-medium text-blue-500">{vpsStats.processes.sleeping}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary dark:text-text-dark-secondary">Services</span>
                          <span className="font-medium">{vpsStats.services.length}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Services Table */}
                  {vpsStats.services.length > 0 && (
                    <div className="card p-6">
                      <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-4 flex items-center space-x-2">
                        <Server className="w-5 h-5" />
                        <span>Running Services</span>
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-700">
                              <th className="text-left py-2 text-text-secondary dark:text-text-dark-secondary">Service</th>
                              <th className="text-left py-2 text-text-secondary dark:text-text-dark-secondary">Status</th>
                              <th className="text-left py-2 text-text-secondary dark:text-text-dark-secondary">Uptime</th>
                            </tr>
                          </thead>
                          <tbody>
                            {vpsStats.services.slice(0, 10).map((service, index) => (
                              <tr key={index} className="border-b border-gray-100 dark:border-gray-800">
                                <td className="py-2 text-text-primary dark:text-text-dark-primary font-medium">
                                  {service.name}
                                </td>
                                <td className="py-2">
                                  <span className={`px-2 py-1 rounded-full text-xs ${
                                    service.status === 'active' 
                                      ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
                                      : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100'
                                  }`}>
                                    {service.status}
                                  </span>
                                </td>
                                <td className="py-2 text-text-secondary dark:text-text-dark-secondary">
                                  {service.uptime}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="text-center text-xs text-text-secondary dark:text-text-dark-secondary">
                    Last updated: {new Date(vpsStats.timestamp).toLocaleString()}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                  <p className="text-text-secondary dark:text-text-dark-secondary">Failed to load VPS statistics</p>
                  <button
                    onClick={fetchVpsStats}
                    className="btn-primary mt-4"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Active Services Tab */}
        {activeTab === 'active-services' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="space-y-6"
          >
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-text-primary dark:text-text-dark-primary">
                  Active Services
                </h2>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => fetchActiveServices()}
                    disabled={isLoadingActiveServices}
                    className="btn-secondary text-sm px-3 py-1 inline-flex items-center space-x-1"
                  >
                    {isLoadingActiveServices ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    <span>Refresh</span>
                  </button>
                  <div className="text-sm text-text-secondary dark:text-text-dark-secondary">
                    Auto-refresh every 30s
                  </div>
                </div>
              </div>
              
              {isLoadingActiveServices ? (
                <div className="text-center py-8">
                  <RefreshCw className="w-8 h-8 text-primary-500 mx-auto mb-4 animate-spin" />
                  <p className="text-text-secondary dark:text-text-dark-secondary">
                    Loading active services...
                  </p>
                </div>
              ) : activeServicesData ? (
                <div className="space-y-4">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                        <span className="text-sm font-medium text-green-800 dark:text-green-200">
                          Running Services
                        </span>
                      </div>
                      <div className="text-2xl font-bold text-green-900 dark:text-green-100 mt-1">
                        {activeServicesData.activeCount}
                      </div>
                    </div>
                    
                    <div className="bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                      <div className="flex items-center space-x-2">
                        <Pause className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                          Total Services
                        </span>
                      </div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                        {activeServicesData.totalCount}
                      </div>
                    </div>
                    
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <div className="flex items-center space-x-2">
                        <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                          Last Updated
                        </span>
                      </div>
                      <div className="text-sm text-blue-900 dark:text-blue-100 mt-1">
                        {new Date(activeServicesData.lastUpdated).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>

                  {/* Search Bar */}
                  <div className="mb-6">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search services..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full px-4 py-2 pl-10 bg-white dark:bg-background-dark-secondary border border-gray-200 dark:border-background-dark-quaternary rounded-lg text-text-primary dark:text-text-dark-primary placeholder-text-secondary dark:placeholder-text-dark-secondary focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                      <Search className="absolute left-3 top-2.5 w-4 h-4 text-text-secondary dark:text-text-dark-secondary" />
                    </div>
                  </div>

                  {/* Categorized Services */}
                  {activeServicesData.categorizedServices && (
                    <div className="space-y-4">
                      {Object.entries(activeServicesData.categorizedServices).map(([category, services], categoryIndex) => {
                        if ((services as any[]).length === 0) return null;
                        
                        // Filter services based on search query
                        const filteredServices = (services as any[]).filter(service => 
                          service.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          service.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          service.language.toLowerCase().includes(searchQuery.toLowerCase())
                        );
                        
                        if (filteredServices.length === 0 && searchQuery) return null;
                        
                        return (
                          <motion.div
                            key={category}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: categoryIndex * 0.1 }}
                            className="bg-white dark:bg-background-dark-secondary border border-gray-200 dark:border-background-dark-quaternary rounded-lg"
                          >
                            {/* Category Header */}
                            <div 
                              className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-background-dark-tertiary transition-colors"
                              onClick={() => toggleCategory(category)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                  <ChevronDown 
                                    className={`w-5 h-5 text-text-secondary dark:text-text-dark-secondary transition-transform ${
                                      expandedCategories[category] ? 'rotate-0' : '-rotate-90'
                                    }`} 
                                  />
                                  <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary">
                                    {category}
                                  </h3>
                                  <span className="bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200 px-2 py-1 rounded-full text-xs">
                                    {filteredServices.length}
                                  </span>
                                </div>
                                <div className="text-sm text-text-secondary dark:text-text-dark-secondary">
                                  {expandedCategories[category] ? 'Collapse' : 'Expand'}
                                </div>
                              </div>
                            </div>
                            
                            {/* Services List */}
                            {expandedCategories[category] && (
                              <div className="border-t border-gray-200 dark:border-background-dark-quaternary">
                                {filteredServices.map((service: any, index: number) => {
                                  const serviceId = `${service.pid}-${index}`;
                                  const isExpanded = expandedServices[serviceId];
                                  const statusBadge = getStatusBadge(service.status);
                                  
                                  return (
                                    <motion.div
                                      key={serviceId}
                                      initial={{ opacity: 0, x: -20 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ duration: 0.3, delay: index * 0.05 }}
                                      className="border-b border-gray-100 dark:border-background-dark-quaternary last:border-b-0"
                                    >
                                      {/* Service Header */}
                                      <div 
                                        className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-background-dark-tertiary transition-colors"
                                        onClick={() => toggleService(serviceId)}
                                      >
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center space-x-3 flex-1 min-w-0">
                                            <div className={`p-2 rounded-lg flex-shrink-0 ${
                                              service.status === 'running' 
                                                ? 'bg-green-100 dark:bg-green-900/30' 
                                                : 'bg-gray-100 dark:bg-gray-800'
                                            }`}>
                                              {service.status === 'running' ? (
                                                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                                              ) : (
                                                <Pause className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                              )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center space-x-2">
                                                <h4 className="font-semibold text-text-primary dark:text-text-dark-primary truncate">
                                                  {service.filename}
                                                </h4>
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge.color}`}>
                                                  {statusBadge.text}
                                                </span>
                                              </div>
                                              <p className="text-sm text-text-secondary dark:text-text-dark-secondary truncate">
                                                {service.description}
                                              </p>
                                            </div>
                                          </div>
                                          <div className="flex items-center space-x-2">
                                            <div className="text-right text-sm text-text-secondary dark:text-text-dark-secondary">
                                              <div>PID: {service.pid}</div>
                                              <div>CPU: {service.cpu}%</div>
                                            </div>
                                            <ChevronDown 
                                              className={`w-4 h-4 text-text-secondary dark:text-text-dark-secondary transition-transform ${
                                                isExpanded ? 'rotate-0' : '-rotate-90'
                                              }`} 
                                            />
                                          </div>
                                        </div>
                                      </div>
                                      
                                      {/* Expandable Details */}
                                      {isExpanded && (
                                        <motion.div
                                          initial={{ opacity: 0, height: 0 }}
                                          animate={{ opacity: 1, height: 'auto' }}
                                          exit={{ opacity: 0, height: 0 }}
                                          className="px-4 pb-4 bg-gray-50 dark:bg-background-dark-tertiary"
                                        >
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Basic Info */}
                                            <div className="space-y-2">
                                              <h5 className="font-medium text-text-primary dark:text-text-dark-primary">Basic Information</h5>
                                              <div className="text-sm space-y-1">
                                                <div><span className="font-medium">Language:</span> {service.language}</div>
                                                <div><span className="font-medium">User:</span> {service.user}</div>
                                                <div><span className="font-medium">Memory:</span> {service.memory}%</div>
                                                <div><span className="font-medium">Last Run:</span> {new Date(service.lastRun).toLocaleString()}</div>
                                              </div>
                                            </div>
                                            
                                            {/* Category-specific Details */}
                                            <div className="space-y-2">
                                              <h5 className="font-medium text-text-primary dark:text-text-dark-primary">Details</h5>
                                              <div className="text-sm space-y-1">
                                                {category === 'Claimers' && (
                                                  <>
                                                    <div><span className="font-medium">Status:</span> {service.details.status}</div>
                                                    <div><span className="font-medium">Logs:</span> {service.details.logs}</div>
                                                    <div><span className="font-medium">Last Activity:</span> {new Date(service.details.lastActivity).toLocaleString()}</div>
                                                  </>
                                                )}
                                                {category === 'Discord Services' && (
                                                  <>
                                                    <div><span className="font-medium">Bot Name:</span> {service.details.botName}</div>
                                                    <div><span className="font-medium">Event Listeners:</span> {service.details.eventListeners.join(', ')}</div>
                                                    <div><span className="font-medium">Command Types:</span> {service.details.commandTypes.join(', ')}</div>
                                                  </>
                                                )}
                                                {category === 'Website' && (
                                                  <>
                                                    <div><span className="font-medium">Route Path:</span> {service.details.routePath}</div>
                                                    <div><span className="font-medium">Module:</span> {service.details.moduleName}</div>
                                                    <div><span className="font-medium">Type:</span> {service.details.isStatic ? 'Static' : 'Dynamic'}</div>
                                                  </>
                                                )}
                                                {category === 'Other / System' && (
                                                  <>
                                                    <div><span className="font-medium">Role:</span> {service.details.role}</div>
                                                    <div><span className="font-medium">Type:</span> {service.type}</div>
                                                  </>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                          
                                          {/* Full Command */}
                                          <div className="mt-4">
                                            <h5 className="font-medium text-text-primary dark:text-text-dark-primary mb-2">Full Command</h5>
                                            <div className="bg-gray-100 dark:bg-background-dark-quaternary p-3 rounded-lg">
                                              <code className="text-xs text-text-secondary dark:text-text-dark-secondary break-all">
                                                {service.fullPath}
                                              </code>
                                            </div>
                                          </div>
                                        </motion.div>
                                      )}
                                    </motion.div>
                                  );
                                })}
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                  
                  {/* Fallback for old format */}
                  {!activeServicesData.categorizedServices && (
                    <div className="space-y-3">
                      {activeServicesData.services.map((service: any, index: number) => (
                        <motion.div
                          key={`${service.fileName}-${service.pid || index}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.05 }}
                          className="bg-white dark:bg-background-dark-secondary border border-gray-200 dark:border-background-dark-quaternary rounded-lg p-4"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className={`p-2 rounded-lg ${
                                service.status === 'running' 
                                  ? 'bg-green-100 dark:bg-green-900/30' 
                                  : 'bg-gray-100 dark:bg-gray-900/30'
                              }`}>
                                {service.status === 'running' ? (
                                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                                ) : (
                                  <Pause className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                                )}
                              </div>
                              
                              <div>
                                <h3 className="font-semibold text-text-primary dark:text-text-dark-primary">
                                  {service.name}
                                </h3>
                                <p className="text-sm text-text-secondary dark:text-text-dark-secondary">
                                  {service.fileName}
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex items-center space-x-4 text-sm">
                              {service.status === 'running' && service.pid && (
                                <div className="text-text-secondary dark:text-text-dark-secondary">
                                  PID: <span className="font-mono">{service.pid}</span>
                                </div>
                              )}
                              {service.status === 'running' && service.cpu && (
                                <div className="text-text-secondary dark:text-text-dark-secondary">
                                  CPU: <span className="font-mono">{service.cpu}%</span>
                                </div>
                              )}
                              {service.status === 'running' && service.memory && (
                                <div className="text-text-secondary dark:text-text-dark-secondary">
                                  RAM: <span className="font-mono">{service.memory}%</span>
                                </div>
                              )}
                              <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                                service.status === 'running'
                                  ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100'
                              }`}>
                                {service.status === 'running' ? 'Running' : 'Not Running'}
                              </div>
                            </div>
                          </div>
                          
                          {service.status === 'running' && service.command && (
                            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-background-dark-quaternary">
                              <p className="text-xs text-text-secondary dark:text-text-dark-secondary font-mono bg-gray-50 dark:bg-background-dark-tertiary p-2 rounded break-all">
                                {service.command}
                              </p>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                  <p className="text-text-secondary dark:text-text-dark-secondary">
                    Failed to load active services
                  </p>
                  <button
                    onClick={() => fetchActiveServices()}
                    className="btn-primary mt-4"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>
      
      {/* Progress Tracker Modal */}
      {showProgressTracker && (
        <ClaimProgressTracker
          processId={currentProcessId || undefined}
          onClose={() => setShowProgressTracker(false)}
        />
      )}
      
      {/* VPS Authentication Modal */}
      <VPSAuthModal
        isOpen={showVPSAuthModal}
        onClose={() => setShowVPSAuthModal(false)}
        onSuccess={() => {
          setVpsAccessGranted(true);
          setActiveTab('vps');
        }}
      />

      {/* Reset Leaderboard Authentication Modal */}
      <ResetLeaderboardAuthModal
        isOpen={showResetAuthModal}
        onClose={() => setShowResetAuthModal(false)}
        onSuccess={() => {
          setResetAccessGranted(true);
          setShowResetModal(true);
        }}
      />

      {/* Reset Leaderboard Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
          >
            <div className="flex items-center space-x-3 mb-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                  <RotateCcw className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary">
                  Reset Leaderboard
                </h3>
                <p className="text-sm text-text-secondary dark:text-text-dark-secondary">
                  This action cannot be undone
                </p>
              </div>
            </div>

            <div className="mb-6">
              <p className="text-text-primary dark:text-text-dark-primary mb-3">
                Are you sure you want to reset the leaderboard? This will:
              </p>
              <ul className="space-y-2 text-sm text-text-secondary dark:text-text-dark-secondary">
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                  <span>Delete all claim records and statistics</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                  <span>Preserve all user registrations</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                  <span>Create a backup before deletion</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></div>
                  <span>Send Discord notification</span>
                </li>
              </ul>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setShowResetModal(false)}
                disabled={isResettingLeaderboard}
                className="flex-1 px-4 py-2 text-sm font-medium text-text-secondary dark:text-text-dark-secondary bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleResetLeaderboard}
                disabled={isResettingLeaderboard}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center space-x-2"
              >
                {isResettingLeaderboard ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Resetting...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Reset Leaderboard</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}

        {/* PostgreSQL DB Tab */}
        {activeTab === 'postgresql-db' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="space-y-6"
          >
            <PostgreSQLDBManager />
          </motion.div>
        )}

        {/* Support Tickets Tab */}
        {activeTab === 'support-tickets' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="space-y-6"
          >
            <SupportTicketsManager />
          </motion.div>
        )}

        {activeTab === 'public-deregister-requests' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="space-y-6"
          >
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-text-primary dark:text-text-dark-primary">
                  Public De-Register Requests
                </h2>
                <button
                  onClick={fetchPublicDeregRequests}
                  className="btn btn-outline inline-flex items-center space-x-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Refresh</span>
                </button>
              </div>

              {isLoadingPublicDeregRequests ? (
                <div className="text-center py-8 text-text-secondary dark:text-text-dark-secondary">Loading...</div>
              ) : publicDeregRequests.length === 0 ? (
                <div className="text-center py-8 text-text-secondary dark:text-text-dark-secondary">
                  No deregistration requests found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-3 px-2 text-text-secondary dark:text-text-dark-secondary font-medium">Request #</th>
                        <th className="text-left py-3 px-2 text-text-secondary dark:text-text-dark-secondary font-medium">Full Name</th>
                        <th className="text-left py-3 px-2 text-text-secondary dark:text-text-dark-secondary font-medium">8BP ID</th>
                        <th className="text-left py-3 px-2 text-text-secondary dark:text-text-dark-secondary font-medium">Email</th>
                        <th className="text-left py-3 px-2 text-text-secondary dark:text-text-dark-secondary font-medium">Date</th>
                        <th className="text-left py-3 px-2 text-text-secondary dark:text-text-dark-secondary font-medium">Status</th>
                        <th className="text-left py-3 px-2 text-text-secondary dark:text-text-dark-secondary font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {publicDeregRequests.map((req: any) => (
                        <tr key={req.id} className="border-b border-gray-100 dark:border-gray-800">
                          <td className="py-3 px-2 font-mono text-primary-600 dark:text-primary-400">{req.request_number}</td>
                          <td className="py-3 px-2 text-text-primary dark:text-text-dark-primary">{req.full_name}</td>
                          <td className="py-3 px-2 font-mono text-text-primary dark:text-text-dark-primary">{req.eight_ball_pool_id}</td>
                          <td className="py-3 px-2 text-text-secondary dark:text-text-dark-secondary">{req.email}</td>
                          <td className="py-3 px-2 text-text-secondary dark:text-text-dark-secondary">
                            {new Date(req.requested_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              req.status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100' :
                              req.status === 'approved' ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' :
                              'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
                            }`}>
                              {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                            </span>
                          </td>
                          <td className="py-3 px-2">
                            {req.status === 'pending' && (
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => handleApprovePublicDereg(req.id)}
                                  className="px-3 py-1 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-800 dark:text-green-100 dark:hover:bg-green-700 rounded-md transition-colors"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleDenyPublicDereg(req.id)}
                                  className="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-800 dark:text-red-100 dark:hover:bg-red-700 rounded-md transition-colors"
                                >
                                  Deny
                                </button>
                              </div>
                            )}
                            {req.status !== 'pending' && (
                              <span className="text-xs text-text-secondary dark:text-text-dark-secondary">
                                {req.reviewed_by ? `by ${req.reviewed_by}` : ''}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}
    </div>
  );
};

export default AdminDashboardPage;




