import { useState, useMemo, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import {
  MdAccountBalanceWallet,
  MdAdd,
  MdSearch,
  MdEdit,
  MdDelete,
  MdMoreVert,
  MdFavorite,
  MdVisibility,
  MdShare,
  MdShoppingCart,
  MdSwapVert,
  MdClose,
  MdCheckCircle,
  MdInfoOutline,
  MdArrowForward,
  MdMonetizationOn,
  MdToggleOn,
  MdToggleOff,
  MdCategory,
  MdStar,
  MdLocalOffer
} from 'react-icons/md';

// Preset Color Palettes for Custom Reward Types
const COLOR_THEMES = [
  { name: 'Rose', color: 'text-rose-500', badge: 'bg-rose-100 text-rose-700 border-rose-200', iconBg: 'bg-rose-500/10 text-rose-600' },
  { name: 'Blue', color: 'text-blue-500', badge: 'bg-blue-100 text-blue-700 border-blue-200', iconBg: 'bg-blue-500/10 text-blue-600' },
  { name: 'Purple', color: 'text-purple-500', badge: 'bg-purple-100 text-purple-700 border-purple-200', iconBg: 'bg-purple-500/10 text-purple-600' },
  { name: 'Amber', color: 'text-amber-500', badge: 'bg-amber-100 text-amber-700 border-amber-200', iconBg: 'bg-amber-500/10 text-amber-600' },
  { name: 'Emerald', color: 'text-emerald-500', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', iconBg: 'bg-emerald-500/10 text-emerald-600' },
  { name: 'Indigo', color: 'text-indigo-500', badge: 'bg-indigo-100 text-indigo-700 border-indigo-200', iconBg: 'bg-indigo-500/10 text-indigo-600' },
  { name: 'Pink', color: 'text-pink-500', badge: 'bg-pink-100 text-pink-700 border-pink-200', iconBg: 'bg-pink-500/10 text-pink-600' },
  { name: 'Cyan', color: 'text-cyan-500', badge: 'bg-cyan-100 text-cyan-700 border-cyan-200', iconBg: 'bg-cyan-500/10 text-cyan-600' },
];

// Emoji presets for quick selection
const EMOJI_PRESETS = ['💬', '👥', '🔥', '⭐', '🎁', '🏆', '📝', '🎯', '🚀', '💎', '📌', '⚡'];

// Initial Default Reward Types Configuration
const INITIAL_REWARD_TYPES = {
  LIKE: {
    key: 'LIKE',
    label: 'Like',
    plural: 'Likes',
    emoji: '❤️',
    icon: MdFavorite,
    color: 'text-rose-500',
    badge: 'bg-rose-100 text-rose-700 border-rose-200',
    iconBg: 'bg-rose-500/10 text-rose-600',
    isCustom: false,
  },
  VIEW: {
    key: 'VIEW',
    label: 'View',
    plural: 'Views',
    emoji: '👁',
    icon: MdVisibility,
    color: 'text-blue-500',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    iconBg: 'bg-blue-500/10 text-blue-600',
    isCustom: false,
  },
  SHARE: {
    key: 'SHARE',
    label: 'Share',
    plural: 'Shares',
    emoji: '↗',
    icon: MdShare,
    color: 'text-purple-500',
    badge: 'bg-purple-100 text-purple-700 border-purple-200',
    iconBg: 'bg-purple-500/10 text-purple-600',
    isCustom: false,
  },
  ORDER: {
    key: 'ORDER',
    label: 'Order',
    plural: 'Orders',
    emoji: '🛒',
    icon: MdShoppingCart,
    color: 'text-amber-500',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    iconBg: 'bg-amber-500/10 text-amber-600',
    isCustom: false,
  },
};

const WalletRewards = () => {
  // Main state
  const [rewardTypes, setRewardTypes] = useState(INITIAL_REWARD_TYPES);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('requirement'); // 'requirement' | 'coins' | 'status' | 'updatedAt'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' | 'desc'

  // Action Menu state
  const [activeMenuId, setActiveMenuId] = useState(null);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [ruleToDelete, setRuleToDelete] = useState(null);

  // Rule Form state
  const [formData, setFormData] = useState({
    type: '',
    requirement: '',
    coins: '',
    status: 'ACTIVE',
  });
  const [formErrors, setFormErrors] = useState({});

  // Custom Reward Type Form state
  const [typeFormData, setTypeFormData] = useState({
    label: '',
    plural: '',
    key: '',
    emoji: '💬',
    themeIndex: 5, // Default Indigo
  });
  const [typeFormErrors, setTypeFormErrors] = useState({});

  // Fetch Rules from Backend API
  const fetchRules = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/rewards/rules');
      if (res.data && res.data.rules) {
        const mapped = res.data.rules.map((r) => ({
          id: r._id,
          _id: r._id,
          type: r.type,
          requirement: r.requirement,
          coins: r.coins,
          version: r.version || 1,
          status: r.status,
          createdAt: r.createdAt ? new Date(r.createdAt).toLocaleDateString() : 'N/A',
          updatedAt: r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : 'N/A',
        }));
        setRules(mapped);
      }
    } catch (err) {
      console.error('Error loading reward rules:', err);
      toast.error('Failed to load reward rules from backend');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  // Metrics
  const totalRules = rules.length;
  const activeRulesCount = rules.filter((r) => r.status === 'ACTIVE').length;
  const rewardTypesCount = Object.keys(rewardTypes).length;
  const totalCoinsDistributed = rules.reduce((acc, r) => acc + (r.coins || 0), 0);

  // Filter & Sort Logic
  const filteredRules = useMemo(() => {
    return rules
      .filter((rule) => {
        const searchLower = search.toLowerCase();
        const typeInfo = rewardTypes[rule.type];
        const matchesSearch =
          !search ||
          (typeInfo && typeInfo.label.toLowerCase().includes(searchLower)) ||
          (typeInfo && typeInfo.plural.toLowerCase().includes(searchLower)) ||
          rule.requirement.toString().includes(searchLower) ||
          rule.coins.toString().includes(searchLower);

        const matchesType = typeFilter === 'ALL' || rule.type === typeFilter;
        const matchesStatus =
          statusFilter === 'ALL' || rule.status === statusFilter;

        return matchesSearch && matchesType && matchesStatus;
      })
      .sort((a, b) => {
        let modifier = sortOrder === 'asc' ? 1 : -1;
        if (sortBy === 'requirement') {
          return (a.requirement - b.requirement) * modifier;
        }
        if (sortBy === 'coins') {
          return (a.coins - b.coins) * modifier;
        }
        if (sortBy === 'status') {
          return (a.status || '').localeCompare(b.status || '') * modifier;
        }
        if (sortBy === 'updatedAt') {
          return (a.updatedAt || '').localeCompare(b.updatedAt || '') * modifier;
        }
        return 0;
      });
  }, [rules, rewardTypes, search, typeFilter, statusFilter, sortBy, sortOrder]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // Toggle Rule Status via Backend API
  const handleToggleStatus = async (ruleId) => {
    try {
      const res = await api.put(`/api/rewards/rules/${ruleId}/toggle`);
      if (res.data && res.data.success) {
        toast.success(
          `Rule status changed to ${res.data.rule.status === 'ACTIVE' ? 'Active' : 'Inactive'}`
        );
        fetchRules();
      }
    } catch (err) {
      console.error('Error toggling rule status:', err);
      toast.error('Failed to change rule status');
    }
  };

  // Open Create Rule Modal
  const handleOpenCreateModal = () => {
    setEditingRule(null);
    const firstType = Object.keys(rewardTypes)[0] || 'LIKE';
    setFormData({
      type: firstType,
      requirement: '100',
      coins: '10',
      status: 'ACTIVE',
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  // Open Edit Rule Modal
  const handleOpenEditModal = (rule) => {
    setEditingRule(rule);
    setFormData({
      type: rule.type,
      requirement: rule.requirement.toString(),
      coins: rule.coins.toString(),
      status: rule.status,
    });
    setFormErrors({});
    setIsModalOpen(true);
    setActiveMenuId(null);
  };

  // Open Custom Type Creation Modal
  const handleOpenTypeModal = () => {
    setTypeFormData({
      label: '',
      plural: '',
      key: '',
      emoji: '💬',
      themeIndex: 5,
    });
    setTypeFormErrors({});
    setIsTypeModalOpen(true);
  };

  // Handle Type Creation Submission
  const handleCreateCustomType = (e) => {
    e.preventDefault();
    const errors = {};

    if (!typeFormData.label.trim()) {
      errors.label = 'Type name (e.g., Comment) is required';
    }

    let key = typeFormData.key.trim().toUpperCase();
    if (!key) {
      key = typeFormData.label.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');
    }

    if (!key) {
      errors.key = 'Type key is required';
    } else if (rewardTypes[key]) {
      errors.key = `Reward type key "${key}" already exists!`;
    }

    if (Object.keys(errors).length > 0) {
      setTypeFormErrors(errors);
      return;
    }

    const plural =
      typeFormData.plural.trim() || `${typeFormData.label.trim()}s`;
    const theme = COLOR_THEMES[typeFormData.themeIndex] || COLOR_THEMES[0];

    const newTypeObj = {
      key,
      label: typeFormData.label.trim(),
      plural,
      emoji: typeFormData.emoji || '⭐',
      color: theme.color,
      badge: theme.badge,
      iconBg: theme.iconBg,
      isCustom: true,
    };

    setRewardTypes((prev) => ({
      ...prev,
      [key]: newTypeObj,
    }));

    toast.success(`Custom Reward Type "${newTypeObj.label}" created!`);
    setIsTypeModalOpen(false);

    // If main rule modal is open, auto-select this new type!
    if (isModalOpen) {
      setFormData((prev) => ({ ...prev, type: key }));
    }
  };

  // Handle Rule Submission via Backend API
  const handleSubmitRule = async (e) => {
    e.preventDefault();
    const errors = {};

    if (!formData.type) {
      errors.type = 'Please select a reward type';
    }

    const reqNum = parseInt(formData.requirement, 10);
    if (!formData.requirement || isNaN(reqNum) || reqNum <= 0) {
      errors.requirement = 'Minimum requirement must be greater than 0';
    }

    const coinsNum = parseInt(formData.coins, 10);
    if (!formData.coins || isNaN(coinsNum) || coinsNum <= 0) {
      errors.coins = 'Coin reward must be greater than 0';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      const payload = {
        type: formData.type,
        requirement: reqNum,
        coins: coinsNum,
        createdBy: 'Admin',
      };

      const res = await api.post('/api/rewards/rules', payload);
      if (res.data && res.data.success) {
        toast.success(res.data.message || 'Reward rule saved successfully!');
        setIsModalOpen(false);
        fetchRules();
      }
    } catch (err) {
      console.error('Error saving rule:', err);
      toast.error(err.response?.data?.message || 'Error saving reward rule');
    }
  };

  // Delete / Deactivate Rule Handler
  const handleDeleteRule = async () => {
    if (!ruleToDelete) return;
    try {
      const res = await api.put(`/api/rewards/rules/${ruleToDelete.id}/toggle`);
      if (res.data && res.data.success) {
        toast.success('Reward rule status updated.');
        fetchRules();
      }
    } catch (err) {
      console.error('Error deleting rule:', err);
      toast.error('Failed to update rule');
    } finally {
      setRuleToDelete(null);
    }
  };

  return (
    <div className="space-y-6 bg-gray-50 text-gray-900 min-h-screen p-4 md:p-6 animate-fadeIn w-full max-w-full overflow-hidden box-border">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <MdAccountBalanceWallet className="text-blue-600 shrink-0" />
            Wallet & Reward Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure how many coins users earn based on likes, views, shares, orders, or custom reward activities.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Add Custom Reward Type Button */}
          {/* <button
            onClick={handleOpenTypeModal}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-sm rounded-lg border border-gray-300 transition-all shadow-xs"
            title="Create a new activity reward category"
          >
            <MdCategory className="text-blue-600 text-lg" />
            <span>+ Reward Type</span>
          </button> */}

          {/* Add Reward Rule Button */}
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg shadow-sm transition-all duration-200 hover:shadow"
          >
            <MdAdd className="text-xl" />
            <span>Add Reward Rule</span>
          </button>
        </div>
      </div>

      {/* 2. SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Reward Rules */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Total Reward Rules
            </span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <MdMonetizationOn className="text-xl" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{totalRules}</span>
            <span className="text-sm text-gray-500 font-medium">Rules</span>
          </div>
        </div>

        {/* Active Rules */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:border-emerald-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Active Rules
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <MdCheckCircle className="text-xl" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600">{activeRulesCount}</span>
            <span className="text-sm text-gray-500 font-medium">Active</span>
          </div>
        </div>

        {/* Total Coins Distributed */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:border-amber-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Total Coins Distributed
            </span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <MdAccountBalanceWallet className="text-xl" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">
              {totalCoinsDistributed.toLocaleString('en-IN')}
            </span>
            <span className="text-sm font-semibold text-amber-600">Coins</span>
          </div>
        </div>

        {/* Reward Types */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:border-purple-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Reward Types
            </span>
            <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
              <MdCategory className="text-xl" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{rewardTypesCount}</span>
            <span className="text-sm text-gray-500 font-medium">Types Available</span>
          </div>
        </div>
      </div>

      {/* 7. FILTERS & SEARCH */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search input */}
          <div className="relative">
            <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xl" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reward rules..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <MdClose className="text-base" />
              </button>
            )}
          </div>

          {/* Dynamic Reward Type Dropdown */}
          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all cursor-pointer"
            >
              <option value="ALL">All Types ({rewardTypesCount})</option>
              {Object.values(rewardTypes).map((t) => (
                <option key={t.key} value={t.key}>
                  {t.emoji || '⭐'} {t.label} ({t.plural})
                </option>
              ))}
            </select>
          </div>

          {/* Status Dropdown */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all cursor-pointer"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>

          {/* Sorting Control */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 shrink-0">Sort By:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all cursor-pointer"
            >
              <option value="requirement">Requirement</option>
              <option value="coins">Coin Reward</option>
              <option value="status">Status</option>
              <option value="updatedAt">Last Updated</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="p-2 border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
              title={`Order: ${sortOrder === 'asc' ? 'Ascending' : 'Descending'}`}
            >
              <MdSwapVert className="text-xl" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. REWARD RULES TABLE */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {filteredRules.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-4">Reward Type</th>
                  <th
                    className="px-6 py-4 cursor-pointer hover:text-gray-700 transition-colors"
                    onClick={() => handleSort('requirement')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Requirement</span>
                      {sortBy === 'requirement' && (
                        <span className="text-blue-600 font-bold">
                          {sortOrder === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-4 cursor-pointer hover:text-gray-700 transition-colors"
                    onClick={() => handleSort('coins')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Coins</span>
                      {sortBy === 'coins' && (
                        <span className="text-blue-600 font-bold">
                          {sortOrder === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Last Updated</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-sm">
                {filteredRules.map((rule) => {
                  const typeInfo =
                    rewardTypes[rule.type] || {
                      label: rule.type,
                      plural: `${rule.type}s`,
                      emoji: '⭐',
                      badge: 'bg-gray-100 text-gray-700 border-gray-200',
                      iconBg: 'bg-gray-100 text-gray-600',
                    };
                  const Icon = typeInfo.icon;
                  const isActive = rule.status === 'ACTIVE';

                  return (
                    <tr
                      key={rule.id}
                      className="hover:bg-gray-50/80 transition-colors"
                    >
                      {/* Reward Type */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-2 rounded-lg ${typeInfo.iconBg} flex items-center justify-center font-bold text-lg min-w-[36px] min-h-[36px]`}
                          >
                            {Icon ? <Icon className="text-lg" /> : <span>{typeInfo.emoji || '⭐'}</span>}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">
                                {typeInfo.label}
                              </span>
                              {typeInfo.isCustom && (
                                <span className="bg-purple-100 text-purple-700 border border-purple-200 text-[10px] font-bold px-1.5 py-0.2 rounded">
                                  CUSTOM
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-gray-500">
                              Activity Rule
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Requirement */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 text-base">
                            {rule.requirement.toLocaleString('en-IN')}{' '}
                            <span className="text-sm font-normal text-gray-600">
                              {rule.requirement === 1 ? typeInfo.label : typeInfo.plural}
                            </span>
                          </span>
                          <MdArrowForward className="text-gray-400 text-sm" />
                          <span className="font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-xs">
                            {rule.coins} Coins
                          </span>
                        </div>
                      </td>

                      {/* Coins */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-bold text-amber-600">
                          <MdMonetizationOn className="text-amber-500 text-lg" />
                          <span>{rule.coins} Coins</span>
                        </div>
                      </td>

                      {/* Status Toggle Switch */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleStatus(rule.id)}
                          className="flex items-center gap-2 group focus:outline-none"
                          title="Click to toggle status"
                        >
                          <div
                            className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center ${isActive ? 'bg-emerald-500' : 'bg-gray-300'
                              }`}
                          >
                            <div
                              className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${isActive ? 'translate-x-5' : 'translate-x-0'
                                }`}
                            />
                          </div>
                          <span
                            className={`text-xs font-semibold ${isActive ? 'text-emerald-700' : 'text-gray-500'
                              }`}
                          >
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                        </button>
                      </td>

                      {/* Last Updated */}
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                        {rule.updatedAt}
                      </td>

                      {/* Action buttons */}
                      <td className="px-6 py-4 whitespace-nowrap text-right relative">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEditModal(rule)}
                            className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors border border-gray-200 flex items-center gap-1"
                          >
                            <MdEdit className="text-sm" />
                            <span>Edit</span>
                          </button>

                          {/* Three-dot Action Menu */}
                          <div className="relative">
                            <button
                              onClick={() =>
                                setActiveMenuId(
                                  activeMenuId === rule.id ? null : rule.id
                                )
                              }
                              className="p-1.5 text-gray-500 hover:text-gray-900 rounded-md hover:bg-gray-100 transition-colors"
                            >
                              <MdMoreVert className="text-lg" />
                            </button>

                            {activeMenuId === rule.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setActiveMenuId(null)}
                                />
                                <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20 text-left animate-fadeIn">
                                  <button
                                    onClick={() => handleOpenEditModal(rule)}
                                    className="w-full px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2 font-medium"
                                  >
                                    <MdEdit className="text-blue-600 text-sm" />
                                    Edit Rule
                                  </button>
                                  <button
                                    onClick={() => {
                                      handleToggleStatus(rule.id);
                                      setActiveMenuId(null);
                                    }}
                                    className="w-full px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2 font-medium"
                                  >
                                    {isActive ? (
                                      <>
                                        <MdToggleOff className="text-amber-600 text-sm" />
                                        Disable Rule
                                      </>
                                    ) : (
                                      <>
                                        <MdToggleOn className="text-emerald-600 text-sm" />
                                        Enable Rule
                                      </>
                                    )}
                                  </button>
                                  <div className="my-1 border-t border-gray-100" />
                                  <button
                                    onClick={() => {
                                      setRuleToDelete(rule);
                                      setActiveMenuId(null);
                                    }}
                                    className="w-full px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 font-medium"
                                  >
                                    <MdDelete className="text-sm" />
                                    Delete Rule
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* 9. EMPTY STATE */
          <div className="py-16 px-4 text-center">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100">
              <MdMonetizationOn className="text-3xl" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">
              No reward rules configured
            </h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto mt-1">
              Create your first reward rule to start rewarding users for likes, views, shares, orders, or custom activities.
            </p>
            <button
              onClick={handleOpenCreateModal}
              className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition-all shadow-sm"
            >
              <MdAdd className="text-lg" />
              <span>+ Create Reward Rule</span>
            </button>
          </div>
        )}
      </div>

      {/* 12. WALLET RULES EXPLANATION SECTION */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-blue-700 font-bold text-lg">
          <MdInfoOutline className="text-xl" />
          <h3>How Reward Rules Work</h3>
        </div>

        {/* Step-by-step Flow Visual */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-center flex flex-col items-center justify-center relative">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center mb-2">
              1
            </span>
            <span className="font-semibold text-gray-800 text-sm">
              Admin defines a requirement
            </span>
            <span className="text-xs text-gray-500 mt-1">
              e.g., 1,000 Views or 10 Comments
            </span>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-center flex flex-col items-center justify-center relative">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center mb-2">
              2
            </span>
            <span className="font-semibold text-gray-800 text-sm">
              User reaches that requirement
            </span>
            <span className="text-xs text-gray-500 mt-1">
              User completes target milestone
            </span>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-center flex flex-col items-center justify-center relative">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center mb-2">
              3
            </span>
            <span className="font-semibold text-gray-800 text-sm">
              System calculates the reward
            </span>
            <span className="text-xs text-gray-500 mt-1">
              Evaluates active rule engine
            </span>
          </div>

          <div className="bg-amber-50 p-4 rounded-lg border border-amber-200 text-center flex flex-col items-center justify-center">
            <span className="w-6 h-6 rounded-full bg-amber-200 text-amber-800 text-xs font-bold flex items-center justify-center mb-2">
              4
            </span>
            <span className="font-semibold text-amber-900 text-sm">
              Coins added to user&apos;s wallet
            </span>
            <span className="text-xs text-amber-700 font-bold mt-1">
              +Coins credited
            </span>
          </div>
        </div>

        {/* Live Example Card */}
        <div className="flex flex-col sm:flex-row items-center justify-between bg-blue-50/60 p-4 rounded-lg border border-blue-100 text-sm text-blue-900 gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-blue-700">Example Rule Execution:</span>
            <span className="bg-white px-3 py-1 rounded-md border border-blue-200 font-semibold">
              1,000 Views → 20 Coins
            </span>
          </div>
          <span className="text-xs text-blue-700 font-medium">
            * Reward rules and custom activity types can be changed anytime by the admin.
          </span>
        </div>
      </div>

      {/* 4 & 5. ADD / EDIT REWARD RULE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {editingRule ? 'Edit Reward Rule' : 'Create Reward Rule'}
                </h3>
                <p className="text-xs text-gray-500">
                  {editingRule
                    ? 'Modify the requirement or coin reward for this activity.'
                    : 'Set up a new coin distribution rule for user engagement.'}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <MdClose className="text-xl" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSubmitRule} className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* Select Reward Type (with option to add custom reward type) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold uppercase text-gray-700 tracking-wider">
                    Select Reward Type <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleOpenTypeModal}
                    className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                  >
                    <span>+ New Reward Type</span>
                  </button>
                </div>
                <select
                  value={formData.type}
                  onChange={(e) => {
                    if (e.target.value === 'ADD_NEW_TYPE_OPTION') {
                      handleOpenTypeModal();
                    } else {
                      setFormData({ ...formData, type: e.target.value });
                      if (formErrors.type) setFormErrors({ ...formErrors, type: null });
                    }
                  }}
                  className={`w-full px-3 py-2.5 bg-gray-50 border ${formErrors.type ? 'border-rose-500' : 'border-gray-300'
                    } rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all cursor-pointer`}
                >
                  <option value="" disabled>
                    Select reward type
                  </option>
                  {Object.values(rewardTypes).map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.emoji || '⭐'} {t.label} ({t.plural}) {t.isCustom ? '— [CUSTOM]' : ''}
                    </option>
                  ))}
                  <option value="ADD_NEW_TYPE_OPTION" className="font-bold text-blue-600">
                    ➕ Create New Reward Type...
                  </option>
                </select>
                {formErrors.type && (
                  <p className="text-xs text-rose-500 mt-1 font-medium">{formErrors.type}</p>
                )}
              </div>

              {/* Requirement Input with dynamic unit label */}
              <div>
                <label className="block text-xs font-bold uppercase text-gray-700 tracking-wider mb-1.5">
                  Minimum Requirement <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center">
                  <input
                    type="number"
                    min="1"
                    placeholder="Enter number (e.g. 100)"
                    value={formData.requirement}
                    onChange={(e) => {
                      setFormData({ ...formData, requirement: e.target.value });
                      if (formErrors.requirement)
                        setFormErrors({ ...formErrors, requirement: null });
                    }}
                    className={`flex-1 px-3 py-2.5 bg-gray-50 border ${formErrors.requirement ? 'border-rose-500' : 'border-gray-300'
                      } rounded-l-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all`}
                  />
                  <div className="px-4 py-2.5 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-sm font-semibold text-gray-600 shrink-0 min-w-[90px] text-center">
                    {formData.type && rewardTypes[formData.type]
                      ? rewardTypes[formData.type].plural
                      : 'Units'}
                  </div>
                </div>
                {formErrors.requirement && (
                  <p className="text-xs text-rose-500 mt-1 font-medium">
                    {formErrors.requirement}
                  </p>
                )}
              </div>

              {/* Coin Reward */}
              <div>
                <label className="block text-xs font-bold uppercase text-gray-700 tracking-wider mb-1.5">
                  Coin Reward <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    placeholder="Enter coins (e.g. 10)"
                    value={formData.coins}
                    onChange={(e) => {
                      setFormData({ ...formData, coins: e.target.value });
                      if (formErrors.coins)
                        setFormErrors({ ...formErrors, coins: null });
                    }}
                    className={`w-full pl-3 pr-16 py-2.5 bg-gray-50 border ${formErrors.coins ? 'border-rose-500' : 'border-gray-300'
                      } rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    Coins
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1.5">
                  Users will receive{' '}
                  <span className="font-semibold text-gray-700">
                    {formData.coins || 'X'} coins
                  </span>{' '}
                  when they reach the configured requirement.
                </p>
                {formErrors.coins && (
                  <p className="text-xs text-rose-500 mt-1 font-medium">{formErrors.coins}</p>
                )}
              </div>

              {/* Status Toggle */}
              <div className="flex items-center justify-between bg-gray-50 p-3.5 rounded-lg border border-gray-200">
                <div>
                  <span className="block text-sm font-semibold text-gray-900">
                    Rule Status
                  </span>
                  <span className="text-xs text-gray-500">
                    Enable or disable this rule immediately.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      status: formData.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                    })
                  }
                  className="flex items-center gap-2 focus:outline-none"
                >
                  <div
                    className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center ${formData.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-gray-300'
                      }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${formData.status === 'ACTIVE' ? 'translate-x-5' : 'translate-x-0'
                        }`}
                    />
                  </div>
                  <span
                    className={`text-xs font-semibold ${formData.status === 'ACTIVE'
                      ? 'text-emerald-700'
                      : 'text-gray-500'
                      }`}
                  >
                    {formData.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                  </span>
                </button>
              </div>

              {/* Live Rule Preview */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 text-center">
                <span className="text-xs font-bold text-blue-700 uppercase tracking-wider block mb-2">
                  Reward Live Preview
                </span>
                <div className="flex items-center justify-center gap-4">
                  <div className="bg-white px-4 py-2 rounded-lg border border-blue-200 shadow-sm font-bold text-gray-900 text-sm flex items-center gap-1.5">
                    <span>
                      {formData.type && rewardTypes[formData.type]
                        ? rewardTypes[formData.type].emoji
                        : '⭐'}
                    </span>
                    <span>
                      {formData.requirement || '0'}{' '}
                      {formData.type && rewardTypes[formData.type]
                        ? rewardTypes[formData.type].plural
                        : 'Activities'}
                    </span>
                  </div>
                  <MdArrowForward className="text-blue-500 text-xl" />
                  <div className="bg-amber-50 px-4 py-2 rounded-lg border border-amber-300 shadow-sm font-bold text-amber-700 text-sm">
                    {formData.coins || '0'} Coins
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-all"
                >
                  {editingRule ? 'Save Changes' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW FEATURE: CREATE CUSTOM REWARD TYPE MODAL */}
      {isTypeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <MdCategory className="text-blue-600" />
                  Create Reward Type
                </h3>
                <p className="text-xs text-gray-500">
                  Add a new activity category for user coin rewards (e.g. Comment, Referral, Streak).
                </p>
              </div>
              <button
                onClick={() => setIsTypeModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <MdClose className="text-xl" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleCreateCustomType} className="p-6 space-y-4">
              {/* Type Name (Singular) */}
              <div>
                <label className="block text-xs font-bold uppercase text-gray-700 tracking-wider mb-1.5">
                  Reward Type Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Comment, Referral, Streak"
                  value={typeFormData.label}
                  onChange={(e) => {
                    const val = e.target.value;
                    const autoPlural = val ? `${val}s` : '';
                    const autoKey = val.toUpperCase().replace(/[^A-Z0-9]/g, '_');
                    setTypeFormData({
                      ...typeFormData,
                      label: val,
                      plural: autoPlural,
                      key: autoKey,
                    });
                    if (typeFormErrors.label) setTypeFormErrors({ ...typeFormErrors, label: null });
                  }}
                  className={`w-full px-3 py-2.5 bg-gray-50 border ${typeFormErrors.label ? 'border-rose-500' : 'border-gray-300'
                    } rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all`}
                />
                {typeFormErrors.label && (
                  <p className="text-xs text-rose-500 mt-1 font-medium">{typeFormErrors.label}</p>
                )}
              </div>

              {/* Plural Form */}
              <div>
                <label className="block text-xs font-bold uppercase text-gray-700 tracking-wider mb-1.5">
                  Plural Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Comments, Referrals"
                  value={typeFormData.plural}
                  onChange={(e) =>
                    setTypeFormData({ ...typeFormData, plural: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
                <span className="text-[11px] text-gray-400 mt-1 block">
                  Used for counts like &quot;10 Comments&quot;
                </span>
              </div>

              {/* System Key */}
              <div>
                <label className="block text-xs font-bold uppercase text-gray-700 tracking-wider mb-1.5">
                  System Identifier Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. COMMENT, REFERRAL"
                  value={typeFormData.key}
                  onChange={(e) => {
                    setTypeFormData({
                      ...typeFormData,
                      key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''),
                    });
                    if (typeFormErrors.key) setTypeFormErrors({ ...typeFormErrors, key: null });
                  }}
                  className={`w-full px-3 py-2 bg-gray-50 border ${typeFormErrors.key ? 'border-rose-500' : 'border-gray-300'
                    } rounded-lg text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all uppercase`}
                />
                {typeFormErrors.key && (
                  <p className="text-xs text-rose-500 mt-1 font-medium">{typeFormErrors.key}</p>
                )}
              </div>

              {/* Emoji Selector */}
              <div>
                <label className="block text-xs font-bold uppercase text-gray-700 tracking-wider mb-1.5">
                  Icon / Emoji
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    maxLength={3}
                    value={typeFormData.emoji}
                    onChange={(e) =>
                      setTypeFormData({ ...typeFormData, emoji: e.target.value })
                    }
                    className="w-16 px-3 py-2 text-center text-xl bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-500">Pick an emoji or type one</span>
                </div>
                {/* Preset choices */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {EMOJI_PRESETS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setTypeFormData({ ...typeFormData, emoji: em })}
                      className={`p-1.5 rounded text-lg transition-transform ${typeFormData.emoji === em
                        ? 'bg-blue-100 ring-2 ring-blue-500 scale-110'
                        : 'bg-gray-100 hover:bg-gray-200'
                        }`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Theme Selector */}
              <div>
                <label className="block text-xs font-bold uppercase text-gray-700 tracking-wider mb-1.5">
                  Color Theme
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {COLOR_THEMES.map((theme, idx) => (
                    <button
                      key={theme.name}
                      type="button"
                      onClick={() => setTypeFormData({ ...typeFormData, themeIndex: idx })}
                      className={`p-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1 transition-all ${theme.badge
                        } ${typeFormData.themeIndex === idx
                          ? 'ring-2 ring-blue-600 font-bold scale-105 shadow-sm'
                          : 'opacity-70 hover:opacity-100'
                        }`}
                    >
                      <span>{typeFormData.emoji}</span>
                      <span>{theme.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsTypeModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-all flex items-center gap-1.5"
                >
                  <MdAdd className="text-lg" />
                  <span>Add Reward Type</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 10. DELETE CONFIRMATION MODAL */}
      {ruleToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 text-center space-y-4">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <MdDelete className="text-2xl" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                Delete Reward Rule?
              </h3>
              <p className="text-sm text-gray-500 mt-2">
                Are you sure you want to delete the rule{' '}
                <span className="font-bold text-gray-800">
                  &quot;{ruleToDelete.requirement}{' '}
                  {rewardTypes[ruleToDelete.type]?.plural || ruleToDelete.type} →{' '}
                  {ruleToDelete.coins} Coins&quot;
                </span>
                ? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setRuleToDelete(null)}
                className="w-full py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteRule}
                className="w-full py-2.5 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-all"
              >
                Delete Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletRewards;
