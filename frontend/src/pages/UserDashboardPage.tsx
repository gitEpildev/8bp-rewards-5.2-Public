import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useScreenshots, useAvatars } from '../hooks/useWebSocket';
import { Navigate, Link } from 'react-router-dom';
import axios from 'axios';
import { API_ENDPOINTS } from '../config/api';
import { detectDevice, DeviceInfo } from '../utils/deviceDetection';
import { getDiscordAvatarUrl } from '../utils/avatarUtils';
import Skeleton from '../components/Skeleton';
import { 
  User, 
  Link2, 
  Camera, 
  LogOut,
  ExternalLink,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Globe,
  AlertCircle,
  Send,
  RefreshCw,
  Shield,
  Monitor,
  Smartphone,
  Tablet,
  Edit2,
  Save,
  X,
  MessageCircle,
  Upload,
  Trash2,
  Image as ImageIcon,
  ToggleLeft,
  ToggleRight,
  ChevronDown
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import SupportChat from '../components/SupportChat';
import { logger } from '../utils/logger';

interface LinkedAccount {
  user_id: string; // username from registration or verification
  username: string;
  activeUsername?: string;
  activeAvatarUrl?: string | null;
  eightBallPoolId: string;
  dateLinked: string;
  successfulClaims: number;
  failedClaims: number;
  account_level?: number | null;
  account_rank?: string | null;
  verified_at?: string | null;
  discordId?: string | null;
  profile_image_url?: string | null;
  profile_image_updated_at?: string | null;
  leaderboard_image_url?: string | null;
  leaderboard_image_updated_at?: string | null;
  eight_ball_pool_avatar_filename?: string | null;
  use_discord_avatar?: boolean;
  use_discord_username?: boolean;
  discord_avatar_hash?: string | null;
}

interface Screenshot {
  eightBallPoolId: string;
  username: string;
  screenshotUrl: string;
  claimedAt: string | null;
  capturedAt?: string | null;
  filename: string;
}

interface ScreenshotGroup {
  eightBallPoolId: string;
  username: string;
  screenshots: Screenshot[];
}

interface DeregistrationRequest {
  id: string;
  eight_ball_pool_id: string;
  status: 'pending' | 'approved' | 'denied';
  requested_at: string;
  reviewed_at?: string;
  review_notes?: string;
}

interface UserInfo {
  discordId: string;
  username: string;
  discriminator: string;
  avatar: string;
  currentIp: string;
  lastLoginAt: string | null;
}

const UserDashboardPage: React.FC = () => {
  const { user, isAuthenticated, isLoading, isAdmin, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'accounts' | 'screenshots' | 'verification-images' | 'deregister' | 'support'>('accounts');
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [verificationImages, setVerificationImages] = useState<Array<{
    filename: string;
    imageUrl: string;
    uniqueId: string | null;
    level: number | null;
    rankName: string | null;
    timestamp: string | null;
    capturedAt: string | null;
  }>>([]);
  const [isLoadingVerificationImages, setIsLoadingVerificationImages] = useState(false);
  const [deregistrationRequests, setDeregistrationRequests] = useState<DeregistrationRequest[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [selectedAccountForDeregister, setSelectedAccountForDeregister] = useState<string>('');
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmittingDeregister, setIsSubmittingDeregister] = useState(false);
  const [screenshotRefreshKey, setScreenshotRefreshKey] = useState<number>(Date.now());
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [editingUsername, setEditingUsername] = useState<string | null>(null);
  const [editUsernameValue, setEditUsernameValue] = useState<string>('');
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const [selectedAccountForScreenshots, setSelectedAccountForScreenshots] = useState<string>('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [eightBallPoolAvatars, setEightBallPoolAvatars] = useState<Array<{ filename: string; url: string }>>([]);
  const [isLoadingAvatars, setIsLoadingAvatars] = useState(false);
  const [isSelectingAvatar, setIsSelectingAvatar] = useState(false);
  const [lastAvatarClickTime, setLastAvatarClickTime] = useState<number>(0);
  const [isTogglingAvatar, setIsTogglingAvatar] = useState(false);
  const AVATAR_CLICK_COOLDOWN = 1000; // 1 second
  const [uploadingProfileImage, setUploadingProfileImage] = useState<string | null>(null);
  const [uploadingLeaderboardImage, setUploadingLeaderboardImage] = useState<string | null>(null);
  const [avatarRefreshKey, setAvatarRefreshKey] = useState<number>(Date.now());
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [lastAvatarUpdateTime, setLastAvatarUpdateTime] = useState<number>(0);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      fetchAllData();
      // Detect device info on mount
      setDeviceInfo(detectDevice());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isLoading]);

  // Import WebSocket hook for screenshots
  const { shouldRefresh, consumeRefresh } = useScreenshots(
    activeTab === 'screenshots' && user?.id ? user.id : null
  );

  // Import WebSocket hook for avatar updates
  const { shouldRefresh: shouldRefreshAvatars, consumeRefresh: consumeRefreshAvatars } = useAvatars(
    activeTab === 'accounts' && user?.id ? user.id : null
  );

  // Declare all fetch functions first before useEffects that use them
  const fetchEightBallPoolAvatars = useCallback(async () => {
    setIsLoadingAvatars(true);
    try {
      logger.debug('🔄 Fetching 8BP avatars from:', API_ENDPOINTS.USER_LIST_8BP_AVATARS);
      const response = await axios.get(API_ENDPOINTS.USER_LIST_8BP_AVATARS, {
        withCredentials: true
      });
      logger.debug('✅ 8BP avatars response:', response.data);
      if (response.data.success) {
        const avatars = response.data.avatars || [];
        logger.debug('✅ Setting 8BP avatars:', avatars.length, 'avatars');
        setEightBallPoolAvatars(avatars);
      } else {
        logger.error('❌ 8BP avatars API returned success: false');
      }
    } catch (error) {
      logger.error('❌ Error fetching 8 Ball Pool avatars:', error);
      toast.error('Failed to load avatars');
    } finally {
      setIsLoadingAvatars(false);
    }
  }, []);

  const fetchLinkedAccounts = useCallback(async (): Promise<LinkedAccount[] | null> => {
    try {
      // Add timestamp to force fresh request
      const url = `${API_ENDPOINTS.USER_LINKED_ACCOUNTS}?_t=${Date.now()}`;
      const response = await axios.get(url, {
        withCredentials: true,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      if (response.data.success) {
        const accounts = response.data.accounts || [];
        // When setting linked accounts, preserve optimistic toggle state if it exists
        // This prevents refresh from overwriting a toggle that just happened
        setLinkedAccounts(prevAccounts => {
          // Check if we recently updated an avatar (within last 5 seconds)
          // This is more reliable than checking isTogglingAvatar since that flag resets immediately
          const timeSinceLastUpdate = Date.now() - lastAvatarUpdateTime;
          const recentlyUpdated = timeSinceLastUpdate < 5000;
          
          // If we recently updated or are currently toggling, merge the new accounts with the optimistic state
          if ((isTogglingAvatar || recentlyUpdated) && prevAccounts.length > 0) {
            return accounts.map((account: LinkedAccount) => {
              const prevAccount = prevAccounts.find(p => p.eightBallPoolId === account.eightBallPoolId);
              // If this account was just toggled, preserve ALL optimistic state including activeAvatarUrl
              if (prevAccount) {
                // Check if toggle state changed OR if activeAvatarUrl is different (might be stale from server)
                const toggleStateChanged = prevAccount.use_discord_avatar !== account.use_discord_avatar;
                const avatarUrlChanged = prevAccount.activeAvatarUrl !== account.activeAvatarUrl;
                
                if (toggleStateChanged || (recentlyUpdated && avatarUrlChanged)) {
                  return {
                    ...account,
                    use_discord_avatar: prevAccount.use_discord_avatar,
                    activeAvatarUrl: prevAccount.activeAvatarUrl, // CRITICAL: Preserve the computed avatar URL
                    discordId: prevAccount.discordId || account.discordId, // Preserve Discord ID if we have it
                    discord_avatar_hash: prevAccount.discord_avatar_hash || account.discord_avatar_hash, // Preserve hash if we have it
                    activeUsername: prevAccount.activeUsername || account.activeUsername // Preserve username if changed
                  };
                }
              }
              return account;
            });
          }
          return accounts;
        });
        
        // Set default selected account to highest-level account (or first if no levels)
        if (accounts.length > 0) {
          const highestAccount = accounts.reduce((highest: LinkedAccount, account: LinkedAccount) => {
            const highestLevel = highest.account_level || 0;
            const accountLevel = account.account_level || 0;
            return accountLevel > highestLevel ? account : highest;
          }, accounts[0]);
          // Only set if not already set or if the current selection is invalid
          if (!selectedAccountId || !accounts.find((acc: LinkedAccount) => acc.eightBallPoolId === selectedAccountId)) {
            setSelectedAccountId(highestAccount.eightBallPoolId);
          }
        }
        
        return accounts;
      } else {
        logger.error('❌ API returned success=false:', response.data);
        return null;
      }
    } catch (error: any) {
      logger.error('Error fetching linked accounts:', error);
      toast.error('Failed to load linked accounts');
      return null;
    }
  }, [selectedAccountId, lastAvatarUpdateTime, isTogglingAvatar]);

  const fetchScreenshots = useCallback(async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.USER_SCREENSHOTS, {
        withCredentials: true
      });
      if (response.data.success) {
        setScreenshots(response.data.screenshots);
        setScreenshotRefreshKey(Date.now());
      }
    } catch (error) {
      logger.error('Error fetching screenshots:', error);
      toast.error('Failed to load screenshots');
    }
  }, []);

  const fetchDeregistrationRequests = useCallback(async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.USER_DEREGISTRATION_REQUESTS, {
        withCredentials: true
      });
      if (response.data.success) {
        setDeregistrationRequests(response.data.requests);
      }
    } catch (error) {
      logger.error('Error fetching deregistration requests:', error);
      toast.error('Failed to load deregistration requests');
    }
  }, []);

  const fetchUserInfo = useCallback(async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.USER_INFO, {
        withCredentials: true
      });
      if (response.data.success) {
        setUserInfo({
          ...response.data.user,
          currentIp: response.data.currentIp || 'Unknown',
          lastLoginAt: response.data.lastLoginAt || null
        });
      }
    } catch (error) {
      logger.error('Error fetching user info:', error);
      toast.error('Failed to load user info');
    }
  }, []);

  const fetchVerificationImages = useCallback(async () => {
    setIsLoadingVerificationImages(true);
    try {
      const response = await axios.get(API_ENDPOINTS.USER_VERIFICATION_IMAGES, {
        withCredentials: true
      });
      if (response.data.success) {
        setVerificationImages(response.data.verificationImages || []);
      }
    } catch (error) {
      logger.error('Error fetching verification images:', error);
      toast.error('Failed to load verification images');
    } finally {
      setIsLoadingVerificationImages(false);
    }
  }, []);

  // Auto-refresh screenshots when screenshots tab is active
  useEffect(() => {
    if (!isAuthenticated || isLoading || activeTab !== 'screenshots') {
      return;
    }

    // Fetch screenshots immediately when tab becomes active
    fetchScreenshots();
  }, [isAuthenticated, isLoading, activeTab, fetchScreenshots]);

  // Auto-fetch verification images when verification-images tab is active
  useEffect(() => {
    if (!isAuthenticated || isLoading || activeTab !== 'verification-images') {
      return;
    }

    // Fetch verification images immediately when tab becomes active
    fetchVerificationImages();
  }, [isAuthenticated, isLoading, activeTab, fetchVerificationImages]);

  // Auto-refresh linked accounts when avatar updates are received
  // BUT skip if we just uploaded an avatar (to prevent overwriting the API response)
  useEffect(() => {
    if (!isAuthenticated || isLoading || activeTab !== 'accounts') {
      return;
    }

    // Don't auto-refresh if we're currently uploading - trust the API response instead
    if (isUploadingAvatar) {
      logger.debug('⏸️ Skipping auto-refresh - avatar upload in progress');
      return;
    }

    // Don't auto-refresh if we're currently toggling - trust the optimistic update
    if (isTogglingAvatar) {
      logger.debug('⏸️ Skipping auto-refresh - avatar toggle in progress');
      return;
    }

    // Don't auto-refresh if we just updated an avatar (within last 5 seconds)
    // Extended to 5 seconds to match state preservation window and prevent race conditions
    const timeSinceLastUpdate = Date.now() - lastAvatarUpdateTime;
    if (timeSinceLastUpdate < 5000) {
      logger.debug(`⏸️ Skipping auto-refresh - avatar was just updated ${timeSinceLastUpdate}ms ago`);
      return;
    }

    if (shouldRefreshAvatars) {
      logger.debug('🔄 Auto-refreshing linked accounts from WebSocket event');
      fetchLinkedAccounts();
      consumeRefreshAvatars();
    }
  }, [shouldRefreshAvatars, isAuthenticated, isLoading, activeTab, consumeRefreshAvatars, isUploadingAvatar, isTogglingAvatar, lastAvatarUpdateTime, fetchLinkedAccounts]);

  // Fetch 8 Ball Pool avatars list
  useEffect(() => {
    if (isAuthenticated && !isLoading && activeTab === 'accounts') {
      logger.debug('🔄 useEffect triggered - fetching 8BP avatars');
      fetchEightBallPoolAvatars();
    }
  }, [isAuthenticated, isLoading, activeTab, fetchEightBallPoolAvatars]);

  // Listen for WebSocket screenshot updates
  useEffect(() => {
    if (activeTab === 'screenshots' && shouldRefresh) {
      fetchScreenshots();
      consumeRefresh();
    }
  }, [shouldRefresh, activeTab, consumeRefresh, fetchScreenshots]);

  const fetchAllData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      await Promise.all([
        fetchLinkedAccounts(),
        fetchScreenshots(),
        fetchDeregistrationRequests(),
        fetchUserInfo()
      ]);
    } catch (error) {
      logger.error('Error fetching data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setIsLoadingData(false);
    }
  }, [fetchLinkedAccounts, fetchScreenshots, fetchDeregistrationRequests, fetchUserInfo]);

  const groupedScreenshots = useMemo<ScreenshotGroup[]>(() => {
    if (screenshots.length === 0) {
      return [];
    }

    const map = new Map<string, ScreenshotGroup>();

    screenshots.forEach((shot) => {
      const key = `${shot.eightBallPoolId}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          eightBallPoolId: shot.eightBallPoolId,
          username: shot.username,
          screenshots: [shot]
        });
      } else {
        existing.screenshots.push(shot);
      }
    });

    return Array.from(map.values()).map((group) => ({
      ...group,
      screenshots: [...group.screenshots].sort((a, b) => {
        const aTime = new Date(a.capturedAt ?? a.claimedAt ?? 0).getTime();
        const bTime = new Date(b.capturedAt ?? b.claimedAt ?? 0).getTime();
        return bTime - aTime;
      })
    })).sort((a, b) => {
      // Sort groups by most recent screenshot
      const aTime = new Date(a.screenshots[0].capturedAt ?? a.screenshots[0].claimedAt ?? 0).getTime();
      const bTime = new Date(b.screenshots[0].capturedAt ?? b.screenshots[0].claimedAt ?? 0).getTime();
      return bTime - aTime;
    });
  }, [screenshots]);

  // Set default selected account when screenshots are loaded
  useEffect(() => {
    if (groupedScreenshots.length > 0 && !selectedAccountForScreenshots) {
      setSelectedAccountForScreenshots(groupedScreenshots[0].eightBallPoolId);
    }
  }, [groupedScreenshots, selectedAccountForScreenshots]);

  // Get the currently selected account
  const selectedAccount = useMemo(() => {
    return linkedAccounts.find(account => account.eightBallPoolId === selectedAccountId);
  }, [linkedAccounts, selectedAccountId]);

  // Get screenshots for selected account
  const selectedAccountScreenshots = useMemo(() => {
    if (!selectedAccountForScreenshots) {
      return [];
    }
    const group = groupedScreenshots.find(g => g.eightBallPoolId === selectedAccountForScreenshots);
    return group?.screenshots || [];
  }, [groupedScreenshots, selectedAccountForScreenshots]);

  const handleEditUsername = (account: LinkedAccount) => {
    setEditingUsername(account.eightBallPoolId);
    setEditUsernameValue(account.username || '');
  };

  const handleCancelEdit = () => {
    setEditingUsername(null);
    setEditUsernameValue('');
  };

  const handleSaveUsername = async (eightBallPoolId: string) => {
    if (!editUsernameValue.trim()) {
      toast.error('Username cannot be empty');
      return;
    }

    if (editUsernameValue.trim().length < 2 || editUsernameValue.trim().length > 50) {
      toast.error('Username must be between 2 and 50 characters');
      return;
    }

    setIsUpdatingUsername(true);
    try {
      const response = await axios.put(
        API_ENDPOINTS.USER_UPDATE_USERNAME,
        {
          eightBallPoolId,
          newUsername: editUsernameValue.trim()
        },
        { withCredentials: true }
      );

      if (response.data.success) {
        toast.success('Username updated successfully');
        // Update the account in the linkedAccounts state
        setLinkedAccounts(prevAccounts =>
          prevAccounts.map(account =>
            account.eightBallPoolId === eightBallPoolId
              ? { ...account, username: editUsernameValue.trim(), user_id: editUsernameValue.trim() }
              : account
          )
        );
        setEditingUsername(null);
        setEditUsernameValue('');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update username');
    } finally {
      setIsUpdatingUsername(false);
    }
  };

  const handleUploadProfileImage = async (eightBallPoolId: string, file: File) => {
    setUploadingProfileImage(eightBallPoolId);
    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('eightBallPoolId', eightBallPoolId);

      const response = await axios.post(API_ENDPOINTS.USER_UPLOAD_PROFILE_IMAGE, formData, {
        withCredentials: true,
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.success) {
        // Update state immediately with API response data
        const { activeAvatarUrl, registration } = response.data;
        
        logger.debug('✅ Profile image upload response:', {
          activeAvatarUrl,
          profile_image_url: registration?.profile_image_url
        });
        
        if (registration && selectedAccount) {
          setLinkedAccounts(prevAccounts => {
            const updated = prevAccounts.map(acc => {
              if (acc.eightBallPoolId === eightBallPoolId) {
                const updatedAccount = {
                  ...acc,
                  profile_image_url: registration.profile_image_url,
                  profile_image_updated_at: registration.profile_image_updated_at,
                  activeAvatarUrl: activeAvatarUrl || acc.activeAvatarUrl
                };
                logger.debug('✅ Updated account state:', {
                  eightBallPoolId,
                  profile_image_url: updatedAccount.profile_image_url,
                  activeAvatarUrl: updatedAccount.activeAvatarUrl
                });
                return updatedAccount;
              }
              return acc;
            });
            return updated;
          });
          
          setAvatarRefreshKey(Date.now());
          setLastAvatarUpdateTime(Date.now()); // Track when we last updated
          window.dispatchEvent(new Event('avatar-updated'));
        }
        
        toast.success('Profile image uploaded successfully');
        
        // Wait a bit before allowing auto-refresh to prevent overwriting
        setTimeout(() => {
          setIsUploadingAvatar(false);
        }, 2000);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to upload profile image');
      setIsUploadingAvatar(false);
    } finally {
      setUploadingProfileImage(null);
    }
  };

  const handleUploadLeaderboardImage = async (eightBallPoolId: string, file: File) => {
    setUploadingLeaderboardImage(eightBallPoolId);
    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('eightBallPoolId', eightBallPoolId);

      const response = await axios.post(API_ENDPOINTS.USER_UPLOAD_LEADERBOARD_IMAGE, formData, {
        withCredentials: true,
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.success) {
        // Update state immediately with API response data
        const { activeAvatarUrl, registration } = response.data;
        
        logger.debug('✅ Leaderboard image upload response:', {
          activeAvatarUrl,
          leaderboard_image_url: registration?.leaderboard_image_url
        });
        
        if (registration && selectedAccount) {
          setLinkedAccounts(prevAccounts => {
            const updated = prevAccounts.map(acc => {
              if (acc.eightBallPoolId === eightBallPoolId) {
                const updatedAccount = {
                  ...acc,
                  leaderboard_image_url: registration.leaderboard_image_url,
                  leaderboard_image_updated_at: registration.leaderboard_image_updated_at,
                  activeAvatarUrl: activeAvatarUrl || acc.activeAvatarUrl
                };
                logger.debug('✅ Updated account state:', {
                  eightBallPoolId,
                  leaderboard_image_url: updatedAccount.leaderboard_image_url,
                  activeAvatarUrl: updatedAccount.activeAvatarUrl
                });
                return updatedAccount;
              }
              return acc;
            });
            return updated;
          });
          
          setAvatarRefreshKey(Date.now());
          setLastAvatarUpdateTime(Date.now()); // Track when we last updated
          window.dispatchEvent(new Event('avatar-updated'));
        }
        
        toast.success('Leaderboard image uploaded successfully');
        
        // Wait a bit before allowing auto-refresh to prevent overwriting
        setTimeout(() => {
          setIsUploadingAvatar(false);
        }, 2000);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to upload leaderboard image');
      setIsUploadingAvatar(false);
    } finally {
      setUploadingLeaderboardImage(null);
    }
  };

  const handleDeleteProfileImage = async (eightBallPoolId: string) => {
    try {
      const response = await axios.delete(API_ENDPOINTS.USER_DELETE_PROFILE_IMAGE, {
        withCredentials: true,
        data: { eightBallPoolId }
      });

      if (response.data.success) {
        toast.success('Profile image deleted successfully');
        await fetchLinkedAccounts();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete profile image');
    }
  };

  const handleDeleteLeaderboardImage = async (eightBallPoolId: string) => {
    try {
      const response = await axios.delete(API_ENDPOINTS.USER_DELETE_LEADERBOARD_IMAGE, {
        withCredentials: true,
        data: { eightBallPoolId }
      });

      if (response.data.success) {
        toast.success('Leaderboard image deleted successfully');
        await fetchLinkedAccounts();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete leaderboard image');
    }
  };

  const handleSelect8BPAvatar = async (eightBallPoolId: string, avatarFilename: string) => {
    // Rate limiting check
    const now = Date.now();
    const timeSinceLastClick = now - lastAvatarClickTime;
    
    if (timeSinceLastClick < AVATAR_CLICK_COOLDOWN) {
      const remainingSeconds = ((AVATAR_CLICK_COOLDOWN - timeSinceLastClick) / 1000).toFixed(1);
      toast.error(`Please wait ${remainingSeconds} seconds before selecting another avatar.`, {
        duration: 2000
      });
      return;
    }
    
    if (isSelectingAvatar) {
      logger.debug('⏳ Avatar selection already in progress, ignoring click');
      return;
    }
    
    setIsSelectingAvatar(true);
    setIsUploadingAvatar(true); // Block WebSocket auto-refresh
    setLastAvatarClickTime(now);
    
    try {
      logger.debug('🔵 Selecting 8BP avatar:', { eightBallPoolId, avatarFilename });
      logger.debug('🔵 API Endpoint:', API_ENDPOINTS.USER_SELECT_8BP_AVATAR);
      logger.debug('🔵 Full URL:', `${window.location.origin}${API_ENDPOINTS.USER_SELECT_8BP_AVATAR}`);
      
      const response = await axios.put(API_ENDPOINTS.USER_SELECT_8BP_AVATAR, {
        eightBallPoolId,
        avatarFilename
      }, {
        withCredentials: true,
        headers: {
          'Content-Type': 'application/json'
        }
      }).catch((error) => {
        logger.error('❌ Avatar selection error:', error);
        logger.error('❌ Error response:', error.response?.data);
        logger.error('❌ Error status:', error.response?.status);
        logger.error('❌ Error message:', error.message);
        throw error;
      });

      logger.debug('✅ 8BP avatar selection response:', response.data);
      logger.debug('✅ 8BP avatar selection - activeAvatarUrl:', response.data.activeAvatarUrl);
      logger.debug('✅ 8BP avatar selection - hasLeaderboardImage:', response.data.hasLeaderboardImage);
      logger.debug('✅ 8BP avatar selection - success:', response.data.success);
      logger.debug('✅ 8BP avatar selection - eight_ball_pool_avatar_filename:', response.data.eight_ball_pool_avatar_filename);

      if (response.data.success) {
        logger.debug('✅ API call successful, updating state immediately');
        logger.debug('✅ Response data:', response.data);
        logger.debug('✅ activeAvatarUrl from API:', response.data.activeAvatarUrl);
        logger.debug('✅ hasLeaderboardImage:', response.data.hasLeaderboardImage);
        logger.debug('✅ Response avatar filename:', response.data.eight_ball_pool_avatar_filename);
        logger.debug('✅ Requested avatar filename:', avatarFilename);
        logger.debug('✅ Filenames match:', response.data.eight_ball_pool_avatar_filename === avatarFilename);
        
        // Verify the response indicates the save was successful
        if (response.data.eight_ball_pool_avatar_filename && response.data.eight_ball_pool_avatar_filename !== avatarFilename) {
          logger.warn('⚠️ Response avatar filename does not match requested filename', {
            requested: avatarFilename,
            received: response.data.eight_ball_pool_avatar_filename
          });
        }
        
        // Check if leaderboard image is blocking BEFORE updating state
        const currentAccount = linkedAccounts.find(acc => acc.eightBallPoolId === eightBallPoolId);
        const hasLeaderboardImage = currentAccount?.leaderboard_image_url || response.data.hasLeaderboardImage;
        
        // Compute the correct activeAvatarUrl
        // If leaderboard image exists, it takes priority, but we still want to show the 8BP avatar in the preview
        // So we'll use the 8BP avatar URL directly for the preview, but the backend will use leaderboard image for leaderboard
        const newActiveAvatarUrl = hasLeaderboardImage 
          ? `/8bp-rewards/avatars/${avatarFilename}` // Use 8BP avatar for preview even if leaderboard image exists
          : (response.data.activeAvatarUrl || `/8bp-rewards/avatars/${avatarFilename}`);
        
        const newRefreshKey = Date.now();
        
        logger.debug('✅ Updating state with:', {
          eightBallPoolId,
          avatarFilename,
          newActiveAvatarUrl,
          hasLeaderboardImage
        });
        
        setLinkedAccounts(prevAccounts => {
          const updated = prevAccounts.map(acc => {
            if (acc.eightBallPoolId === eightBallPoolId) {
              // Use the response data as source of truth, not computed values
              // Also sync use_discord_avatar to false (backend auto-toggles it off)
              const updatedAcc = {
                ...acc, 
                eight_ball_pool_avatar_filename: response.data.eight_ball_pool_avatar_filename || avatarFilename,
                activeAvatarUrl: response.data.activeAvatarUrl || newActiveAvatarUrl,
                use_discord_avatar: false, // Sync with backend auto-toggle
                leaderboard_image_url: acc.leaderboard_image_url, // Keep leaderboard image if it exists
                profile_image_url: acc.profile_image_url // Keep profile image
              };
              logger.debug('✅ Updated account state (8BP avatar selected):', {
                eightBallPoolId: updatedAcc.eightBallPoolId,
                eight_ball_pool_avatar_filename: updatedAcc.eight_ball_pool_avatar_filename,
                use_discord_avatar: updatedAcc.use_discord_avatar,
                activeAvatarUrl: updatedAcc.activeAvatarUrl,
                fromResponse: response.data.eight_ball_pool_avatar_filename,
                auto_toggled_discord_off: true
              });
              logger.debug('🔄 Auto-toggled use_discord_avatar to false after selecting 8BP avatar');
              return updatedAcc;
            }
            return acc;
          });
          const foundAccount = updated.find(a => a.eightBallPoolId === eightBallPoolId);
          logger.debug('✅ Updated linkedAccounts state, found account:', foundAccount);
          logger.debug('✅ All accounts after update:', updated.map(a => ({
            id: a.eightBallPoolId,
            avatar: a.eight_ball_pool_avatar_filename,
            use_discord_avatar: a.use_discord_avatar,
            activeUrl: a.activeAvatarUrl
          })));
          return updated;
        });
        
          setAvatarRefreshKey(newRefreshKey);
          setLastAvatarUpdateTime(Date.now()); // Track when we last updated
          
          // Reset loading state immediately so user can click another avatar
          setIsSelectingAvatar(false);
          logger.debug('✅ Reset isSelectingAvatar to false');
        
        if (hasLeaderboardImage) {
          toast('8BP avatar selected, but leaderboard image takes priority. Delete leaderboard image to see the 8BP avatar.', {
            duration: 6000,
            icon: '⚠️'
          });
        } else {
          toast.success('8 Ball Pool avatar selected successfully');
        }
        
        // Wait before allowing auto-refresh to prevent overwriting
        setTimeout(() => {
          setIsUploadingAvatar(false);
          logger.debug('✅ Reset isUploadingAvatar to false - auto-refresh now allowed');
        }, 2000);
        
        // Don't do background refresh - state is already correct and API confirmed save
        // Background refresh was causing the avatar to revert after a few seconds
        // The API response already confirms the save was successful
        const refreshKey = Date.now();
        setAvatarRefreshKey(refreshKey);
        window.dispatchEvent(new Event('avatar-updated'));
        
        // No background refresh - trust the API response
        // The avatar is saved in the database, and our local state is correct
      } else {
        logger.error('❌ API returned success=false:', response.data);
        setIsSelectingAvatar(false);
        setIsUploadingAvatar(false);
        toast.error('Failed to select avatar. Please try again.');
      }
    } catch (error: any) {
      logger.error('❌ Error selecting 8BP avatar:', error);
      setIsUploadingAvatar(false); // Reset on error
      setIsSelectingAvatar(false);
      logger.debug('✅ Reset isSelectingAvatar to false (error case)');
      toast.error(error.response?.data?.error || 'Failed to select avatar');
    }
  };

  const handleRemove8BPAvatar = async (eightBallPoolId: string) => {
    try {
      const response = await axios.delete(API_ENDPOINTS.USER_REMOVE_8BP_AVATAR, {
        withCredentials: true,
        data: { eightBallPoolId }
      });

      if (response.data.success) {
        toast.success('8 Ball Pool avatar removed successfully');
        await fetchLinkedAccounts();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to remove avatar');
    }
  };

  const handleToggleDiscordAvatar = async (eightBallPoolId: string, useDiscordAvatar: boolean) => {
    logger.debug('🔄 Toggle button clicked!', { eightBallPoolId, useDiscordAvatar });
    
    if (isTogglingAvatar) {
      logger.debug('⏸️ Already toggling, ignoring click');
      return;
    }

    setIsTogglingAvatar(true);
    setIsUploadingAvatar(true); // Block WebSocket auto-refresh (same pattern as 8BP avatar selection)
    
    try {
      logger.debug('📤 Sending toggle request to:', API_ENDPOINTS.USER_TOGGLE_DISCORD_AVATAR);
      const response = await axios.put(API_ENDPOINTS.USER_TOGGLE_DISCORD_AVATAR, {
        eightBallPoolId,
        useDiscordAvatar
      }, {
        withCredentials: true
      });

      logger.debug('✅ Toggle response:', response.data);

      if (response.data.success) {
        // Update the local state immediately with the new value (same pattern as 8BP avatar)
        const newValue = response.data.useDiscordAvatar;
        const accountData = response.data.account;
        
        logger.debug('🔄 Updating local state to:', newValue);
        logger.debug('📊 Account data from response:', accountData);
        logger.debug('📊 Response activeAvatarUrl:', accountData?.activeAvatarUrl);
        logger.debug('📊 Response use_discord_avatar:', accountData?.use_discord_avatar);
        logger.debug('📊 Response discordId:', accountData?.discordId);
        logger.debug('📊 Response discord_avatar_hash:', accountData?.discord_avatar_hash);
        
        setLinkedAccounts(prevAccounts => {
          const updated = prevAccounts.map(account => {
            if (account.eightBallPoolId === eightBallPoolId) {
              // ALWAYS prefer backend's computed activeAvatarUrl - it has the correct logic
              let activeAvatarUrl: string | null = null;
              
              if (accountData?.activeAvatarUrl) {
                // Backend already computed it correctly - use it!
                activeAvatarUrl = accountData.activeAvatarUrl;
                logger.debug('✅ Using backend-computed activeAvatarUrl:', activeAvatarUrl);
              } else {
                // Fallback: compute locally if backend didn't provide it
                logger.warn('⚠️ Backend did not provide activeAvatarUrl, computing locally');
                
                // Use response data if available, otherwise compute from current account state
                const leaderboardUrl = accountData?.leaderboard_image_url || account.leaderboard_image_url;
                const eightBPAvatar = accountData?.eight_ball_pool_avatar_filename || account.eight_ball_pool_avatar_filename;
                const discordId = accountData?.discordId || account.discordId;
                const discordHash = accountData?.discord_avatar_hash || account.discord_avatar_hash;
                const profileImageUrl = accountData?.profile_image_url || account.profile_image_url;
                
                // IMPORTANT: Use newValue (from response) and accountData (from response) for computation
                // Don't use old account state - the response has the updated values
                const useDiscordAvatarFromResponse = accountData?.use_discord_avatar ?? newValue;
                
                logger.debug('🔍 Computing activeAvatarUrl locally with priority logic', {
                  hasLeaderboard: !!leaderboardUrl,
                  has8BPAvatar: !!eightBPAvatar,
                  useDiscordAvatar: newValue,
                  useDiscordAvatarFromResponse: useDiscordAvatarFromResponse,
                  hasDiscordId: !!discordId,
                  discordIdValue: discordId,
                  hasDiscordHash: !!discordHash,
                  discordHashValue: discordHash,
                  hasProfileImage: !!profileImageUrl,
                  accountData_use_discord_avatar: accountData?.use_discord_avatar
                });
                
                // Same priority logic as backend
                // Priority: leaderboard > Discord (if enabled) > 8BP > profile
                if (leaderboardUrl) {
                  activeAvatarUrl = leaderboardUrl;
                  logger.debug('✅ Computed locally: Using leaderboard_image_url (highest priority)');
                } else if (useDiscordAvatarFromResponse && discordId) {
                  // Use utility function to handle both custom and default Discord avatars
                  activeAvatarUrl = getDiscordAvatarUrl(discordId, discordHash);
                  if (activeAvatarUrl) {
                    logger.debug('✅ Computed locally: Using Discord avatar (use_discord_avatar=true, priority over 8BP)', {
                      avatar_type: discordHash ? 'custom' : 'default',
                      url: activeAvatarUrl,
                      discordId,
                      hasHash: !!discordHash
                    });
                  } else {
                    logger.error('❌ Failed to generate Discord avatar URL locally!', { 
                      discordId, 
                      discordHash,
                      discordIdType: typeof discordId,
                      newValue,
                      useDiscordAvatarFromResponse
                    });
                  }
                } else if (!useDiscordAvatarFromResponse && eightBPAvatar) {
                  // Only use 8BP avatar if Discord avatar is NOT enabled
                  activeAvatarUrl = `/8bp-rewards/avatars/${eightBPAvatar}`;
                  logger.debug('✅ Computed locally: Using 8BP avatar (use_discord_avatar=false)', {
                    useDiscordAvatarFromResponse,
                    newValue,
                    accountData_use_discord_avatar: accountData?.use_discord_avatar
                  });
                } else if (profileImageUrl) {
                  activeAvatarUrl = profileImageUrl;
                  logger.debug('✅ Computed locally: Using profile_image_url (lowest priority)');
                }
                
                // Final fallback to account's current activeAvatarUrl
                activeAvatarUrl = activeAvatarUrl || account.activeAvatarUrl || null;
              }
              
              logger.debug('🎯 Final activeAvatarUrl decision', {
                fromBackend: accountData?.activeAvatarUrl || null,
                final: activeAvatarUrl || null,
                useDiscordAvatar: newValue,
                accountDiscordId: accountData?.discordId || account.discordId || null
              });
              
              const updatedAccount = {
                ...account,
                use_discord_avatar: newValue,
                activeAvatarUrl: activeAvatarUrl || null,
                activeUsername: accountData?.activeUsername || account.activeUsername,
                discordId: accountData?.discordId || account.discordId,
                discord_avatar_hash: accountData?.discord_avatar_hash || account.discord_avatar_hash,
                eight_ball_pool_avatar_filename: accountData?.eight_ball_pool_avatar_filename || account.eight_ball_pool_avatar_filename,
                leaderboard_image_url: accountData?.leaderboard_image_url || account.leaderboard_image_url
              };
              
              logger.debug('✅ Updated account state:', {
                eightBallPoolId: updatedAccount.eightBallPoolId,
                use_discord_avatar: updatedAccount.use_discord_avatar,
                activeAvatarUrl: updatedAccount.activeAvatarUrl,
                fromBackend: accountData?.activeAvatarUrl || null,
                fromResponse: accountData?.activeAvatarUrl || null
              });
              return updatedAccount;
            }
            return account;
          });
          logger.debug('✅ All accounts after update:', updated.map(a => ({
            id: a.eightBallPoolId,
            use_discord_avatar: a.use_discord_avatar,
            activeAvatarUrl: a.activeAvatarUrl
          })));
          return updated;
        });
        
        // Track when we last updated to prevent auto-refresh (same pattern as 8BP avatar)
        setLastAvatarUpdateTime(Date.now());
        
        // Reset loading state immediately
        setIsTogglingAvatar(false);
        
        toast.success(`Switched to ${newValue ? 'Discord' : '8 Ball Pool'} avatar`);
        
        // Wait before allowing auto-refresh to prevent overwriting (same pattern as 8BP avatar)
        setTimeout(() => {
          setIsUploadingAvatar(false);
          logger.debug('✅ Reset isUploadingAvatar to false - auto-refresh now allowed');
        }, 2000);
        
        // Don't do background refresh - state is already correct and API confirmed save
        // Background refresh was causing the toggle to revert after a few seconds
        // The API response already confirms the save was successful
        logger.debug('✅ Toggle complete, using optimistic update. No refresh needed.');
      } else {
        toast.error(response.data.error || 'Failed to toggle Discord avatar');
        setIsUploadingAvatar(false);
      }
    } catch (error: any) {
      logger.error('❌ Toggle error:', error);
      logger.error('❌ Error response:', error.response?.data);
      toast.error(error.response?.data?.error || 'Failed to toggle Discord avatar');
      setIsUploadingAvatar(false);
    } finally {
      setIsTogglingAvatar(false);
    }
  };

  const handleToggleDiscordUsername = async (eightBallPoolId: string, useDiscordUsername: boolean) => {
    logger.debug('🔄 Username toggle button clicked!', { eightBallPoolId, useDiscordUsername });
    
    setIsUploadingAvatar(true); // Block WebSocket auto-refresh (same pattern as avatar toggle)
    
    try {
      logger.debug('📤 Sending username toggle request to:', API_ENDPOINTS.USER_TOGGLE_DISCORD_USERNAME);
      const response = await axios.put(API_ENDPOINTS.USER_TOGGLE_DISCORD_USERNAME, {
        eightBallPoolId,
        useDiscordUsername
      }, {
        withCredentials: true
      });

      logger.debug('✅ Username toggle response:', response.data);

      if (response.data.success) {
        // Update the local state immediately with the new value (same pattern as avatar toggle)
        const newValue = response.data.useDiscordUsername;
        const accountData = response.data.account;
        
        logger.debug('🔄 Updating local state to:', newValue);
        logger.debug('📊 Account data from response:', accountData);
        
        setLinkedAccounts(prevAccounts => {
          const updated = prevAccounts.map(account => {
            if (account.eightBallPoolId === eightBallPoolId) {
              // Use response data if available, otherwise use current account state
              const updatedAccount = {
                ...account,
                use_discord_username: newValue,
                activeUsername: accountData?.activeUsername || account.activeUsername,
                activeAvatarUrl: accountData?.activeAvatarUrl || account.activeAvatarUrl,
                use_discord_avatar: accountData?.use_discord_avatar ?? account.use_discord_avatar,
                discordId: accountData?.discordId || account.discordId,
                discord_avatar_hash: accountData?.discord_avatar_hash || account.discord_avatar_hash,
                eight_ball_pool_avatar_filename: accountData?.eight_ball_pool_avatar_filename || account.eight_ball_pool_avatar_filename,
                leaderboard_image_url: accountData?.leaderboard_image_url || account.leaderboard_image_url,
                profile_image_url: accountData?.profile_image_url || account.profile_image_url
              };
              
              logger.debug('✅ Updated account state (username toggle):', {
                eightBallPoolId: updatedAccount.eightBallPoolId,
                use_discord_username: updatedAccount.use_discord_username,
                activeUsername: updatedAccount.activeUsername,
                fromBackend: accountData?.activeUsername || null
              });
              return updatedAccount;
            }
            return account;
          });
          logger.debug('✅ All accounts after username toggle update:', updated.map(a => ({
            id: a.eightBallPoolId,
            use_discord_username: a.use_discord_username,
            activeUsername: a.activeUsername
          })));
          return updated;
        });
        
        // Track when we last updated to prevent auto-refresh (same pattern as avatar toggle)
        setLastAvatarUpdateTime(Date.now());
        
        toast.success(`Switched to ${newValue ? 'Discord' : 'registration'} username`);
        
        // Wait before allowing auto-refresh to prevent overwriting (same pattern as avatar toggle)
        setTimeout(() => {
          setIsUploadingAvatar(false);
          logger.debug('✅ Reset isUploadingAvatar to false - auto-refresh now allowed');
        }, 2000);
        
        // Don't do background refresh - state is already correct and API confirmed save
        // The API response already confirms the save was successful
        logger.debug('✅ Username toggle complete, using optimistic update. No refresh needed.');
      } else {
        toast.error(response.data.error || 'Failed to toggle Discord username');
        setIsUploadingAvatar(false);
      }
    } catch (error: any) {
      logger.error('❌ Username toggle error:', error);
      logger.error('❌ Error response:', error.response?.data);
      toast.error(error.response?.data?.error || 'Failed to toggle Discord username');
      setIsUploadingAvatar(false);
    }
  };

  const handleDeregistrationRequest = async () => {
    if (!selectedAccountForDeregister) {
      toast.error('Please select an account to deregister');
      return;
    }

    setIsSubmittingDeregister(true);
    try {
      const response = await axios.post(
        API_ENDPOINTS.USER_DEREGISTRATION_REQUEST,
        { eightBallPoolId: selectedAccountForDeregister },
        { withCredentials: true }
      );

      if (response.data.success) {
        toast.success('Deregistration request submitted successfully. An admin will review it shortly.');
        setSelectedAccountForDeregister('');
        await fetchDeregistrationRequests();
        await fetchLinkedAccounts();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to submit deregistration request');
    } finally {
      setIsSubmittingDeregister(false);
    }
  };

  // Discord avatar utility now imported from utils/avatarUtils.ts

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Never';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-text-primary dark:text-text-dark-primary">Loading...</div>
      </div>
    );
  }

  // Only redirect if we've finished loading and user is not authenticated
  if (!isLoading && !isAuthenticated) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="min-h-screen pt-8 pb-16 sm:pb-20 px-4 sm:px-6 lg:px-8 overflow-x-hidden">
      <div className="max-w-7xl mx-auto w-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-10">
            <div className="flex items-center space-x-6">
              <div className="relative group">
                <div className="absolute inset-0 bg-primary-500/30 dark:bg-dark-accent-blue/30 rounded-full blur-lg group-hover:blur-xl transition-all duration-300" />
                <img
                  src={getDiscordAvatarUrl(user?.id || '', user?.avatar || null) || undefined}
                  alt={user?.username}
                  className="relative w-24 h-24 rounded-full border-4 border-white dark:border-background-dark-secondary shadow-xl"
                />
                <div className="absolute bottom-1 right-1 w-6 h-6 bg-green-500 border-4 border-white dark:border-background-dark-secondary rounded-full" />
              </div>
              
              <div className="text-center md:text-left">
                <h1 className="text-4xl font-bold text-text-primary dark:text-white mb-1 bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300">
                  {user?.username}
                </h1>
                <div className="flex items-center justify-center md:justify-start space-x-2">
                  {user?.discriminator && user.discriminator !== '0' && (
                    <span className="px-3 py-1 rounded-full bg-primary-100/50 dark:bg-white/10 text-primary-700 dark:text-gray-300 text-sm font-medium backdrop-blur-sm">
                      #{user.discriminator}
                    </span>
                  )}
                  {isAdmin && (
                    <span className="px-3 py-1 rounded-full bg-purple-100/50 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 text-sm font-medium backdrop-blur-sm border border-purple-200/50 dark:border-purple-500/30">
                      Admin
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {isAdmin && (
                <Link
                  to="/admin-dashboard"
                  className="btn-secondary flex items-center space-x-2 px-5 py-2.5 shadow-lg shadow-gray-200/50 dark:shadow-none"
                >
                  <Shield className="w-4 h-4" />
                  <span>Admin Panel</span>
                </Link>
              )}
              <button
                onClick={logout}
                className="btn-outline flex items-center space-x-2 px-5 py-2.5 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-500/30 transition-all duration-300"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>

          {/* User Stats Grid */}
          {userInfo && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mb-10">
              <motion.div 
                whileHover={{ y: -4 }}
                className="card p-6 flex items-center space-x-4 bg-gradient-to-br from-white/80 to-white/40 dark:from-background-dark-secondary/80 dark:to-background-dark-secondary/40"
              >
                <div className="p-3 rounded-2xl bg-blue-100/50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
                  <Globe className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-secondary dark:text-gray-400">Current IP</p>
                  <p className="text-lg font-bold text-text-primary dark:text-white font-mono">
                    {userInfo.currentIp}
                  </p>
                </div>
              </motion.div>

              {deviceInfo && (
                <motion.div 
                  whileHover={{ y: -4 }}
                  className="card p-6 flex items-center space-x-4 bg-gradient-to-br from-white/80 to-white/40 dark:from-background-dark-secondary/80 dark:to-background-dark-secondary/40"
                >
                  <div className="p-3 rounded-2xl bg-purple-100/50 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400">
                    {deviceInfo.type === 'mobile' ? (
                      <Smartphone className="w-6 h-6" />
                    ) : deviceInfo.type === 'tablet' ? (
                      <Tablet className="w-6 h-6" />
                    ) : (
                      <Monitor className="w-6 h-6" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-secondary dark:text-gray-400">Device</p>
                    <p className="text-lg font-bold text-text-primary dark:text-white truncate" title={`${deviceInfo.os} • ${deviceInfo.browser}`}>
                      {deviceInfo.os}
                    </p>
                    <p className="text-xs text-text-muted dark:text-gray-500">
                      {deviceInfo.browser}
                    </p>
                  </div>
                </motion.div>
              )}

              <motion.div 
                whileHover={{ y: -4 }}
                className="card p-6 flex items-center space-x-4 bg-gradient-to-br from-white/80 to-white/40 dark:from-background-dark-secondary/80 dark:to-background-dark-secondary/40"
              >
                <div className="p-3 rounded-2xl bg-green-100/50 dark:bg-green-500/20 text-green-600 dark:text-green-400">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-secondary dark:text-gray-400">Last Login</p>
                  <p className="text-lg font-bold text-text-primary dark:text-white">
                    {userInfo.lastLoginAt ? new Date(userInfo.lastLoginAt).toLocaleDateString() : 'Never'}
                  </p>
                  <p className="text-xs text-text-muted dark:text-gray-500">
                    {userInfo.lastLoginAt ? new Date(userInfo.lastLoginAt).toLocaleTimeString() : ''}
                  </p>
                </div>
              </motion.div>
            </div>
          )}

          {/* Link Account Banner */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#5865F2] via-[#5865F2] to-[#4752C4] dark:from-[#5865F2] dark:via-[#4752C4] dark:to-[#3C45A5] shadow-2xl shadow-[#5865F2]/30 border border-[#5865F2]/20"
          >
            {/* Decorative elements */}
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
            <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl" />
            
            <div className="relative p-8 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-start space-x-4 flex-1">
                {/* Discord Icon */}
                <div className="flex-shrink-0">
                  <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-lg border border-white/30">
                    <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24" aria-label="Discord">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                    </svg>
                  </div>
                </div>
                
                {/* Text Content */}
                <div className="text-white space-y-3 flex-1">
                  <h3 className="text-2xl md:text-3xl font-bold tracking-tight">Link Your 8 Ball Pool Account</h3>
                  <p className="text-white/90 text-base md:text-lg leading-relaxed max-w-2xl">
                    Join our Discord server and use the{' '}
                    <code className="bg-white/25 backdrop-blur-sm px-3 py-1 rounded-lg text-white font-mono text-sm md:text-base border border-white/30 shadow-sm">
                      /link-account
                    </code>{' '}
                    command to start claiming rewards automatically.
                  </p>
                </div>
              </div>
              
              {/* CTA Button */}
              <a
                href={process.env.REACT_APP_DISCORD_INVITE_URL || 'https://discord.gg/7EgQJSXY6d'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 group relative overflow-hidden bg-white text-[#5865F2] font-semibold px-6 py-3.5 rounded-xl shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border-2 border-white/20 hover:border-white/40"
              >
                <span className="relative z-10 flex items-center space-x-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                  <span>Join Discord Server</span>
                  <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </a>
            </div>
          </motion.div>
        </motion.div>

        {/* Tabs Navigation */}
        <div className="mb-10">
          <div className="flex p-1 bg-gray-100/50 dark:bg-background-dark-tertiary/50 backdrop-blur-md rounded-xl border border-white/20 dark:border-white/5 w-fit mx-auto md:mx-0">
            {[
              { id: 'accounts', label: 'Linked Accounts', icon: Link2 },
              { id: 'screenshots', label: 'Screenshots', icon: Camera },
              { id: 'verification-images', label: 'Verification Images', icon: Shield },
              { id: 'deregister', label: 'Deregister', icon: Send },
              { id: 'support', label: 'Request help', icon: MessageCircle }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`relative flex items-center space-x-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                    isActive
                      ? 'text-primary-700 dark:text-white'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 bg-white dark:bg-background-dark-secondary rounded-lg shadow-sm"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center space-x-2">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-primary-500 dark:text-dark-accent-blue' : ''}`} />
                    <span>{tab.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <motion.div
          layout
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {isLoadingData ? (
            <div className="space-y-8">
              {/* Skeleton Loading State */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="card p-6">
                    <div className="flex justify-between items-start mb-6">
                      <div className="space-y-2">
                        <Skeleton className="h-6 w-32" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                      <Skeleton className="h-10 w-10 rounded-full" />
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <Skeleton className="h-20 rounded-xl" />
                      <Skeleton className="h-20 rounded-xl" />
                    </div>
                    <div className="flex justify-between pt-4 border-t border-gray-100 dark:border-white/5">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* ... existing tab content ... */}
              {/* Linked Accounts Tab */}
              {activeTab === 'accounts' && (
                <div className="space-y-8">
                  {linkedAccounts.length === 0 ? (
                    <div className="card p-12 text-center">
                      <div className="w-20 h-20 bg-gray-100 dark:bg-background-dark-tertiary rounded-full flex items-center justify-center mx-auto mb-6">
                        <Link2 className="w-10 h-10 text-gray-400 dark:text-gray-500" />
                      </div>
                      <h3 className="text-xl font-bold text-text-primary dark:text-white mb-2">No Accounts Linked</h3>
                      <p className="text-text-secondary dark:text-gray-400 max-w-md mx-auto mb-8">
                        Link your 8 Ball Pool account via Discord to start earning automated rewards.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6 max-w-5xl mx-auto w-full">
                      {/* Account Selector Dropdown */}
                      {linkedAccounts.length > 1 && (
                        <div className="card p-4">
                          <label className="block text-sm font-medium text-text-primary dark:text-white mb-2">
                            Select Account to View/Edit
                          </label>
                          <div className="relative">
                            <select
                              value={selectedAccountId}
                              onChange={(e) => setSelectedAccountId(e.target.value)}
                              className="w-full px-4 py-2.5 bg-white dark:bg-background-dark-secondary border border-gray-300 dark:border-gray-600 rounded-lg text-text-primary dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-dark-accent-blue appearance-none pr-10"
                            >
                              {linkedAccounts
                                .sort((a, b) => (b.account_level || 0) - (a.account_level || 0))
                                .map((account) => (
                                  <option key={account.eightBallPoolId} value={account.eightBallPoolId}>
                                    {account.username || account.user_id} 
                                    {account.account_level ? ` (Level ${account.account_level})` : ''}
                                    {account.account_rank ? ` - ${account.account_rank}` : ''}
                                  </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500 pointer-events-none" />
                          </div>
                        </div>
                      )}

                      {/* Discord Avatar Toggle - Prominently displayed at top of Linked Accounts tab */}
                      {(() => {
                        const accountToUse = selectedAccount || linkedAccounts[0];
                        if (!accountToUse) return null;
                        return (
                          <div className="w-full mb-6">
                            <div className="flex items-center justify-between gap-4 p-5 rounded-xl bg-gradient-to-r from-primary-50/80 to-secondary-50/80 dark:from-dark-accent-navy/30 dark:to-dark-accent-ocean/30 border-2 border-primary-300 dark:border-dark-accent-blue/40 shadow-lg">
                              <div className="flex items-center gap-4">
                                <div className="p-2 rounded-lg bg-primary-100 dark:bg-dark-accent-blue/20">
                                  <User className="w-6 h-6 text-primary-600 dark:text-dark-accent-blue" />
                                </div>
                                <div>
                                  <span className="text-lg font-bold text-text-primary dark:text-white block mb-1">
                                    Use Discord Profile Picture
                                  </span>
                                  <span className="text-sm text-text-secondary dark:text-gray-400">
                                    Toggle between your Discord avatar and 8 Ball Pool avatar for the leaderboard
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  
                                  const account = accountToUse || selectedAccount || (linkedAccounts.length > 0 ? linkedAccounts[0] : null);
                                  
                                  if (!account?.eightBallPoolId) {
                                    toast.error('Account not found');
                                    return;
                                  }
                                  
                                  if (isTogglingAvatar) return;
                                  
                                  handleToggleDiscordAvatar(account.eightBallPoolId, !account.use_discord_avatar);
                                }}
                                disabled={isTogglingAvatar}
                                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-dark-accent-blue focus:ring-offset-2 ${
                                  (accountToUse?.use_discord_avatar) ? 'bg-primary-600 dark:bg-dark-accent-blue' : 'bg-gray-300 dark:bg-gray-600'
                                } ${isTogglingAvatar ? 'opacity-50 cursor-wait' : 'cursor-pointer hover:opacity-90'}`}
                                title={(accountToUse?.use_discord_avatar) ? 'Switch to 8 Ball Pool avatar' : 'Switch to Discord profile picture'}
                                aria-label="Toggle between Discord and 8 Ball Pool avatar"
                              >
                                <span
                                  className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform shadow-lg pointer-events-none ${
                                    (accountToUse?.use_discord_avatar) ? 'translate-x-7' : 'translate-x-1'
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                      
                      {/* Selected Account Display */}
                      {selectedAccount ? (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          key={selectedAccount.eightBallPoolId}
                          className="card overflow-hidden group hover:border-primary-200 dark:hover:border-dark-accent-blue/30 transition-all duration-300"
                        >
                          <div className="p-6">
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex-1 min-w-0">
                                {editingUsername === selectedAccount.eightBallPoolId ? (
                                  <div className="flex items-center space-x-2 mb-1">
                                    <input
                                      type="text"
                                      value={editUsernameValue}
                                      onChange={(e) => setEditUsernameValue(e.target.value)}
                                      className="flex-1 px-3 py-1.5 text-xl font-bold bg-white dark:bg-background-dark-secondary border border-primary-300 dark:border-dark-accent-blue rounded-lg text-text-primary dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-dark-accent-blue"
                                      disabled={isUpdatingUsername}
                                      maxLength={50}
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          handleSaveUsername(selectedAccount.eightBallPoolId);
                                        } else if (e.key === 'Escape') {
                                          handleCancelEdit();
                                        }
                                      }}
                                    />
                                    <button
                                      onClick={() => handleSaveUsername(selectedAccount.eightBallPoolId)}
                                      disabled={isUpdatingUsername}
                                      className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10 rounded transition-colors disabled:opacity-50"
                                      title="Save username"
                                    >
                                      <Save className="w-5 h-5" />
                                    </button>
                                    <button
                                      onClick={handleCancelEdit}
                                      disabled={isUpdatingUsername}
                                      className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                                      title="Cancel editing"
                                    >
                                      <X className="w-5 h-5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-3 mb-1">
                                    <h3 className="text-xl font-bold text-text-primary dark:text-white truncate flex-1">
                                      {selectedAccount.username || selectedAccount.user_id}
                                    </h3>
                                    <button
                                      onClick={() => handleEditUsername(selectedAccount)}
                                      className="flex items-center gap-2 p-2 text-primary-600 dark:text-dark-accent-blue hover:text-primary-700 dark:hover:text-dark-accent-blue hover:bg-primary-100 dark:hover:bg-dark-accent-blue/20 rounded-lg transition-all duration-200 border border-primary-200 dark:border-dark-accent-blue/30 hover:border-primary-300 dark:hover:border-dark-accent-blue/50 shadow-sm hover:shadow"
                                      title="Edit Leaderboard Username"
                                      aria-label="Edit Leaderboard Username"
                                    >
                                      <span className="text-xs font-medium">Edit Leaderboard Username</span>
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                                <div className="flex items-center space-x-2 text-sm text-text-secondary dark:text-gray-400 mt-1">
                                  <span className="font-mono bg-gray-100 dark:bg-background-dark-tertiary px-2 py-0.5 rounded text-xs">
                                    ID: {selectedAccount.eightBallPoolId}
                                  </span>
                                </div>
                              </div>
                              <div className="w-10 h-10 rounded-full bg-primary-50 dark:bg-dark-accent-blue/10 flex items-center justify-center text-primary-600 dark:text-dark-accent-blue flex-shrink-0 ml-2">
                                <User className="w-5 h-5" />
                              </div>
                            </div>

                            {/* Account Level and Rank - Always visible section */}
                            <div className="mb-6 flex items-center gap-2 flex-wrap">
                              {selectedAccount.account_level ? (
                                <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                  Level {selectedAccount.account_level}
                                </span>
                              ) : null}
                              {selectedAccount.account_rank ? (
                                <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium ${
                                  selectedAccount.account_rank.toLowerCase().includes('grandmaster') || selectedAccount.account_rank.toLowerCase().includes('master') ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800' :
                                  selectedAccount.account_rank.toLowerCase().includes('expert') || selectedAccount.account_rank.toLowerCase().includes('professional') ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' :
                                  selectedAccount.account_rank.toLowerCase().includes('advanced') || selectedAccount.account_rank.toLowerCase().includes('intermediate') ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800' :
                                  selectedAccount.account_rank.toLowerCase().includes('rookie') || selectedAccount.account_rank.toLowerCase().includes('beginner') ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800' :
                                  'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                                } border`}>
                                  {selectedAccount.account_rank}
                                </span>
                              ) : null}
                              {(!selectedAccount.account_level && !selectedAccount.account_rank) && (
                                <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                                  Verify via Discord to show Level & Rank
                                </span>
                              )}
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 mb-6">
                              <div className="p-4 rounded-xl bg-green-50 dark:bg-green-500/5 border border-green-100 dark:border-green-500/10">
                                <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wider mb-1">Successful Claims</p>
                                <p className="text-2xl font-bold text-green-700 dark:text-green-300">{selectedAccount.successfulClaims}</p>
                              </div>
                              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/10">
                                <p className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wider mb-1">Failed Claims</p>
                                <p className="text-2xl font-bold text-red-700 dark:text-red-300">{selectedAccount.failedClaims}</p>
                              </div>
                            </div>

                            {/* Username Toggle */}
                            {selectedAccount.discordId && (
                              <div className="mb-4 p-4 rounded-xl bg-gray-50 dark:bg-background-dark-tertiary border border-gray-200 dark:border-white/5">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                    <span className="text-sm font-medium text-text-primary dark:text-white">
                                      Use Discord Username on Leaderboard
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => handleToggleDiscordUsername(selectedAccount.eightBallPoolId, !selectedAccount.use_discord_username)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                      selectedAccount.use_discord_username ? 'bg-primary-600 dark:bg-dark-accent-blue' : 'bg-gray-300 dark:bg-gray-600'
                                    }`}
                                  >
                                    <span
                                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                        selectedAccount.use_discord_username ? 'translate-x-6' : 'translate-x-1'
                                      }`}
                                    />
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Avatar Management Section */}
                            <div className="mb-6 space-y-4">
                              <h4 className="text-sm font-semibold text-text-primary dark:text-white flex items-center gap-2">
                                <ImageIcon className="w-4 h-4" />
                                Leaderboard Avatar Settings
                              </h4>

                              {/* Current Avatar Preview */}
                              <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 dark:bg-background-dark-tertiary border border-gray-200 dark:border-white/5">
                                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-gray-300 dark:border-gray-600 flex-shrink-0">
                                  {selectedAccount.activeAvatarUrl ? (
                                    <img
                                      key={`avatar-${selectedAccount.eightBallPoolId}-${selectedAccount.eight_ball_pool_avatar_filename || 'default'}-${avatarRefreshKey}-${selectedAccount.leaderboard_image_url ? 'lb' : 'no-lb'}`}
                                      src={`${selectedAccount.activeAvatarUrl}?v=${avatarRefreshKey}&t=${Date.now()}`}
                                      alt="Current avatar"
                                      className="w-full h-full object-cover"
                                      title=""
                                      onLoad={() => {
                                        logger.debug('Avatar image loaded:', selectedAccount.activeAvatarUrl);
                                      }}
                                      onError={(e) => {
                                        logger.error('Avatar image failed to load:', selectedAccount.activeAvatarUrl);
                                        (e.target as HTMLImageElement).style.display = 'none';
                                      }}
                                    />
                                  ) : null}
                                </div>
                                <div className="flex-1">
                                  <p className="text-xs text-text-secondary dark:text-gray-400">
                                    Current leaderboard avatar preview
                                  </p>
                                </div>
                              </div>

                              {/* Profile Image Upload */}
                              <div className="space-y-2">
                                <label className="text-xs font-medium text-text-secondary dark:text-gray-400">
                                  Profile Image
                                </label>
                                <div className="flex items-center gap-2">
                                  <label className="flex-1 cursor-pointer">
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          handleUploadProfileImage(selectedAccount.eightBallPoolId, file);
                                        }
                                      }}
                                      disabled={uploadingProfileImage === selectedAccount.eightBallPoolId}
                                    />
                                    <div className="flex items-center justify-center gap-2 px-4 py-2 bg-primary-50 dark:bg-dark-accent-blue/10 text-primary-600 dark:text-dark-accent-blue rounded-lg hover:bg-primary-100 dark:hover:bg-dark-accent-blue/20 transition-colors disabled:opacity-50">
                                      <Upload className="w-4 h-4" />
                                      <span className="text-sm font-medium">
                                        {uploadingProfileImage === selectedAccount.eightBallPoolId ? 'Uploading...' : 'Upload'}
                                      </span>
                                    </div>
                                  </label>
                                  {selectedAccount.profile_image_url && (
                                    <button
                                      onClick={() => handleDeleteProfileImage(selectedAccount.eightBallPoolId)}
                                      className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                                      title="Delete profile image"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Leaderboard Image Upload */}
                              <div className="space-y-2">
                                <label className="text-xs font-medium text-text-secondary dark:text-gray-400">
                                  Leaderboard-Specific Image
                                </label>
                                <div className="flex items-center gap-2">
                                  <label className="flex-1 cursor-pointer">
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          handleUploadLeaderboardImage(selectedAccount.eightBallPoolId, file);
                                        }
                                      }}
                                      disabled={uploadingLeaderboardImage === selectedAccount.eightBallPoolId}
                                    />
                                    <div className="flex items-center justify-center gap-2 px-4 py-2 bg-primary-50 dark:bg-dark-accent-blue/10 text-primary-600 dark:text-dark-accent-blue rounded-lg hover:bg-primary-100 dark:hover:bg-dark-accent-blue/20 transition-colors disabled:opacity-50">
                                      <Upload className="w-4 h-4" />
                                      <span className="text-sm font-medium">
                                        {uploadingLeaderboardImage === selectedAccount.eightBallPoolId ? 'Uploading...' : 'Upload'}
                                      </span>
                                    </div>
                                  </label>
                                  {selectedAccount.leaderboard_image_url && (
                                    <button
                                      onClick={() => handleDeleteLeaderboardImage(selectedAccount.eightBallPoolId)}
                                      className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                                      title="Delete leaderboard image"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* 8 Ball Pool Avatar Selection */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <label className="text-xs font-medium text-text-secondary dark:text-gray-400">
                                    8 Ball Pool Game Avatars
                                  </label>
                                  {selectedAccount.leaderboard_image_url && (
                                    <span className="text-xs text-yellow-600 dark:text-yellow-400">
                                      ⚠️ Leaderboard image takes priority
                                    </span>
                                  )}
                                </div>
                                {(() => {
                                  logger.debug('🔍 Avatar Selection Render:', {
                                    isLoadingAvatars,
                                    avatarCount: eightBallPoolAvatars.length,
                                    selectedAccount: selectedAccount?.eightBallPoolId,
                                    selectedAccountId
                                  });
                                  return null;
                                })()}
                                {isLoadingAvatars ? (
                                  <div className="text-sm text-text-secondary dark:text-gray-400">Loading avatars...</div>
                                ) : eightBallPoolAvatars.length === 0 ? (
                                  <div className="text-sm text-red-600 dark:text-red-400">
                                    ⚠️ No avatars loaded! Check console for errors.
                                  </div>
                                ) : (
                                  <div className="max-h-48 overflow-y-auto p-3 rounded-lg bg-gray-50 dark:bg-background-dark-tertiary border border-gray-200 dark:border-white/5 max-w-3xl mx-auto">
                                    <div className="grid grid-cols-6 gap-3">
                                      {eightBallPoolAvatars.map((avatar) => {
                                        const handleClick = async (e: React.MouseEvent) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          
                                          logger.debug('🟢🟢🟢 AVATAR BUTTON CLICKED 🟢🟢🟢');
                                          logger.debug('🟢 SelectedAccount:', selectedAccount);
                                          logger.debug('🟢 SelectedAccount eightBallPoolId:', selectedAccount?.eightBallPoolId);
                                          logger.debug('🟢 Avatar filename:', avatar.filename);
                                          logger.debug('🟢 SelectedAccount exists:', !!selectedAccount);
                                          logger.debug('🟢 isSelectingAvatar:', isSelectingAvatar);
                                          logger.debug('🟢 lastAvatarClickTime:', lastAvatarClickTime);
                                          
                                          if (!selectedAccount) {
                                            logger.error('❌ SelectedAccount is null/undefined');
                                            toast.error('Account not found. Please refresh the page.');
                                            return;
                                          }
                                          
                                          if (!selectedAccount.eightBallPoolId) {
                                            logger.error('❌ SelectedAccount.eightBallPoolId is missing');
                                            toast.error('Account ID not found. Please refresh the page.');
                                            return;
                                          }
                                          
                                          // Rate limiting check (check first, before any async operations)
                                          const now = Date.now();
                                          const timeSinceLastClick = now - lastAvatarClickTime;
                                          if (timeSinceLastClick < AVATAR_CLICK_COOLDOWN) {
                                            const remainingMs = AVATAR_CLICK_COOLDOWN - timeSinceLastClick;
                                            toast.error(`Please wait ${(remainingMs / 1000).toFixed(1)} seconds before selecting another avatar.`, {
                                              duration: 1500
                                            });
                                            return;
                                          }
                                          
                                          if (isSelectingAvatar) {
                                            logger.debug('⏳ Already selecting avatar, ignoring click');
                                            return;
                                          }
                                          
                                          logger.debug('🟢 Calling handleSelect8BPAvatar with:', {
                                            eightBallPoolId: selectedAccount.eightBallPoolId,
                                            avatarFilename: avatar.filename
                                          });
                                          
                                          await handleSelect8BPAvatar(selectedAccount.eightBallPoolId, avatar.filename);
                                        };
                                        
                                        return (
                                        <button
                                          key={avatar.filename}
                                          onClick={handleClick}
                                          disabled={isSelectingAvatar}
                                          type="button"
                                          className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all hover:scale-105 ${
                                            isSelectingAvatar
                                              ? 'cursor-not-allowed opacity-50'
                                              : 'cursor-pointer'
                                          } ${
                                            selectedAccount?.eight_ball_pool_avatar_filename === avatar.filename
                                              ? 'border-primary-500 dark:border-dark-accent-blue ring-2 ring-primary-500 dark:ring-dark-accent-blue'
                                              : 'border-gray-300 dark:border-gray-600 hover:border-primary-300 dark:hover:border-dark-accent-blue/50'
                                          }`}
                                          style={{ pointerEvents: 'auto', zIndex: 10 }}
                                          title=""
                                        >
                                          <img
                                            src={avatar.url}
                                            alt={avatar.filename}
                                            className="w-full h-full object-cover rounded-lg"
                                            style={{ borderRadius: '0.5rem', pointerEvents: 'none' }}
                                            title=""
                                            draggable={false}
                                            onError={(e) => {
                                              (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                          />
                                          {isSelectingAvatar && selectedAccount?.eightBallPoolId && (
                                            <div className="absolute inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center rounded-lg z-20">
                                              <div className="text-white text-xs font-medium">Selecting...</div>
                                            </div>
                                          )}
                                          {!isSelectingAvatar && selectedAccount?.eight_ball_pool_avatar_filename === avatar.filename && (
                                            <div className="absolute inset-0 bg-primary-500/20 dark:bg-dark-accent-blue/20 flex items-center justify-center rounded-lg">
                                              <CheckCircle className="w-6 h-6 text-primary-600 dark:text-dark-accent-blue" />
                                            </div>
                                          )}
                                        </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                {selectedAccount.eight_ball_pool_avatar_filename && (
                                  <button
                                    onClick={() => handleRemove8BPAvatar(selectedAccount.eightBallPoolId)}
                                    className="text-xs text-red-600 dark:text-red-400 hover:underline"
                                  >
                                    Remove selected avatar
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="pt-4 border-t border-gray-100 dark:border-white/5 flex items-center justify-between text-sm">
                              <span className="text-text-secondary dark:text-gray-400">Linked on {formatDate(selectedAccount.dateLinked)}</span>
                              <span className="flex items-center text-primary-600 dark:text-dark-accent-blue font-medium">
                                Active <CheckCircle className="w-4 h-4 ml-1.5" />
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      ) : (
                        <div className="card p-12 text-center">
                          <p className="text-text-secondary dark:text-gray-400">Select an account from the dropdown to view its details.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Screenshots Tab */}
              {activeTab === 'screenshots' && (
                <div className="space-y-6">
                  {groupedScreenshots.length === 0 ? (
                    <div className="card p-12 text-center">
                      <div className="w-20 h-20 bg-gray-100 dark:bg-background-dark-tertiary rounded-full flex items-center justify-center mx-auto mb-6">
                        <Camera className="w-10 h-10 text-gray-400 dark:text-gray-500" />
                      </div>
                      <h3 className="text-xl font-bold text-text-primary dark:text-white mb-2">No Screenshots Yet</h3>
                      <p className="text-text-secondary dark:text-gray-400 max-w-md mx-auto">
                        Confirmation screenshots will appear here after your rewards are claimed.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Account Selector Dropdown */}
                      <div className="card p-4">
                        <label className="block text-sm font-medium text-text-primary dark:text-white mb-2">
                          Select Account
                        </label>
                        <select
                          value={selectedAccountForScreenshots}
                          onChange={(e) => setSelectedAccountForScreenshots(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-lg bg-white dark:bg-background-dark-tertiary border border-gray-200 dark:border-white/10 text-text-primary dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-dark-accent-blue focus:border-transparent"
                        >
                          {groupedScreenshots.map((group) => (
                            <option key={group.eightBallPoolId} value={group.eightBallPoolId}>
                              {group.username} ({group.eightBallPoolId}) - {group.screenshots.length} images
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Screenshots for Selected Account */}
                      {selectedAccountScreenshots.length > 0 ? (
                        <div className="space-y-4">
                          <div className="flex items-center space-x-3 px-2">
                            <h3 className="text-lg font-bold text-text-primary dark:text-white">
                              {groupedScreenshots.find(g => g.eightBallPoolId === selectedAccountForScreenshots)?.username || 'Account'}
                            </h3>
                            <span className="px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-xs font-medium text-gray-600 dark:text-gray-300">
                              {selectedAccountScreenshots.length} images
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {selectedAccountScreenshots.map((shot) => (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                key={`${shot.eightBallPoolId}-${shot.filename}`}
                                className="group relative aspect-[9/16] rounded-2xl overflow-hidden bg-gray-100 dark:bg-background-dark-tertiary shadow-lg border border-white/20 dark:border-white/5"
                              >
                                <img
                                  src={`${shot.screenshotUrl}?t=${screenshotRefreshKey}`}
                                  alt={`Proof for ${shot.username}`}
                                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                  loading="lazy"
                                  crossOrigin="anonymous"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    logger.error('Screenshot load error:', shot.screenshotUrl, 'Status:', target.complete ? 'complete' : 'incomplete');
                                    target.style.display = 'none';
                                    const fallback = target.nextElementSibling as HTMLElement;
                                    if (fallback) fallback.style.display = 'flex';
                                  }}
                                  onLoad={() => {
                                    logger.debug('Screenshot loaded:', shot.filename);
                                  }}
                                />
                                <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-gray-100 dark:bg-background-dark-tertiary" style={{ display: 'none' }}>
                                  <div className="text-center text-gray-500 dark:text-gray-400">
                                    <Camera className="w-8 h-8 mx-auto mb-2" />
                                    <p className="text-sm">Image not found</p>
                                  </div>
                                </div>
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                                  <p className="text-white text-xs font-medium mb-1">
                                    {formatDate(shot.claimedAt || shot.capturedAt)}
                                  </p>
                                  <button 
                                    onClick={() => window.open(shot.screenshotUrl, '_blank')}
                                    className="w-full btn bg-white/20 backdrop-blur-md text-white hover:bg-white/30 border-none text-xs py-2"
                                  >
                                    View Full Size
                                  </button>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}

              {/* Verification Images Tab */}
              {activeTab === 'verification-images' && (
                <div className="space-y-6">
                  {isLoadingVerificationImages ? (
                    <div className="card p-12 text-center">
                      <RefreshCw className="w-10 h-10 text-gray-400 dark:text-gray-500 mx-auto mb-4 animate-spin" />
                      <p className="text-text-secondary dark:text-gray-400">Loading verification images...</p>
                    </div>
                  ) : verificationImages.length === 0 ? (
                    <div className="card p-12 text-center">
                      <div className="w-20 h-20 bg-gray-100 dark:bg-background-dark-tertiary rounded-full flex items-center justify-center mx-auto mb-6">
                        <Shield className="w-10 h-10 text-gray-400 dark:text-gray-500" />
                      </div>
                      <h3 className="text-xl font-bold text-text-primary dark:text-white mb-2">No Verification Images Yet</h3>
                      <p className="text-text-secondary dark:text-gray-400 max-w-md mx-auto">
                        Verification images will appear here after you submit verification screenshots via Discord.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {verificationImages.map((image) => (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          key={image.filename}
                          className="group relative aspect-[9/16] rounded-2xl overflow-hidden bg-gray-100 dark:bg-background-dark-tertiary shadow-lg border border-white/20 dark:border-white/5"
                        >
                          <img
                            src={`${image.imageUrl}?t=${Date.now()}`}
                            alt={`Verification for ${image.uniqueId || 'account'}`}
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
                            {image.uniqueId && (
                              <p className="text-white text-xs font-medium mb-1">
                                ID: {image.uniqueId}
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
                            <p className="text-white text-xs font-medium mb-1">
                              {formatDate(image.capturedAt)}
                            </p>
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
                  )}
                </div>
              )}

              {/* Deregistration Tab */}
              {activeTab === 'deregister' && (
                <div className="max-w-2xl mx-auto">
                  <div className="card p-8 mb-8 border-l-4 border-l-yellow-500">
                    <div className="flex items-start space-x-4">
                      <div className="p-3 rounded-full bg-yellow-100 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 flex-shrink-0">
                        <AlertCircle className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-text-primary dark:text-white mb-2">Warning</h3>
                        <p className="text-text-secondary dark:text-gray-300 text-sm leading-relaxed">
                          Submitting a deregistration request will unlink your 8 Ball Pool account. 
                          This requires admin approval. Once approved, you will stop receiving automated rewards.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="card p-8">
                    <h3 className="text-xl font-bold text-text-primary dark:text-white mb-6">Submit Request</h3>
                    
                    {linkedAccounts.length === 0 ? (
                      <div className="text-center py-8 text-text-secondary dark:text-gray-400">
                        No eligible accounts found to deregister.
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div>
                          <label className="label mb-2">Select Account</label>
                          <div className="relative">
                            <select
                              value={selectedAccountForDeregister}
                              onChange={(e) => setSelectedAccountForDeregister(e.target.value)}
                              className="input appearance-none"
                            >
                              <option value="">Select an account...</option>
                              {linkedAccounts.map((account) => {
                                const hasPending = deregistrationRequests.some(
                                  req => req.eight_ball_pool_id === account.eightBallPoolId && req.status === 'pending'
                                );
                                return (
                                  <option 
                                    key={account.eightBallPoolId} 
                                    value={account.eightBallPoolId}
                                    disabled={hasPending}
                                  >
                                    {account.username} ({account.eightBallPoolId}) {hasPending ? '[Pending]' : ''}
                                  </option>
                                );
                              })}
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 dark:text-gray-400">
                              <User className="w-4 h-4" />
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={handleDeregistrationRequest}
                          disabled={!selectedAccountForDeregister || isSubmittingDeregister}
                          className="btn-primary w-full py-3 text-base shadow-lg shadow-primary-500/20"
                        >
                          {isSubmittingDeregister ? (
                            <span className="flex items-center space-x-2">
                              <RefreshCw className="w-5 h-5 animate-spin" />
                              <span>Processing...</span>
                            </span>
                          ) : (
                            <span className="flex items-center space-x-2">
                              <Send className="w-5 h-5" />
                              <span>Submit Request</span>
                            </span>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {deregistrationRequests.length > 0 && (
                    <div className="mt-8">
                      <h3 className="text-lg font-bold text-text-primary dark:text-white mb-4 px-2">Request History</h3>
                      <div className="space-y-3">
                        {deregistrationRequests.map((req) => (
                          <div key={req.id} className="card p-4 flex items-center justify-between">
                            <div>
                              <p className="font-mono text-sm text-text-primary dark:text-white mb-1">
                                {req.eight_ball_pool_id}
                              </p>
                              <p className="text-xs text-text-secondary dark:text-gray-400">
                                {formatDate(req.requested_at)}
                              </p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                              req.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' :
                              req.status === 'denied' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' :
                              'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
                            }`}>
                              {req.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Support Tab */}
              {activeTab === 'support' && (
                <SupportChat />
              )}
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default UserDashboardPage;

