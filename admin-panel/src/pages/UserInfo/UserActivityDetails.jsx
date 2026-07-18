import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api/axios";
import {
  MdArrowBack,
  MdFilterList,
  MdSearch,
  MdCalendarToday,
  MdPerson,
  MdVideoLibrary,
  MdFavorite,
  MdComment,
  MdMusicNote,
  MdLock,
  MdBlock,
  MdCheckCircle,
  MdEdit,
  MdDelete,
  MdShare,
  MdReport,
  MdVisibility,
  MdExpandMore,
  MdExpandLess,
  MdPeople,
  MdPersonAdd,
  MdChevronRight,
} from "react-icons/md";
import toast from "react-hot-toast";

const UserActivityDetails = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [summary, setSummary] = useState({});
  const [activities, setActivities] = useState([]);
  const [filteredActivities, setFilteredActivities] = useState([]);
  const [pagination, setPagination] = useState({});
  // Filters
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const topRef = useRef(null);

  const categories = [
    { value: "all", label: "All Activities" },
    { value: "social", label: "Social Engagement" },
    { value: "content", label: "Content Management" },
    { value: "authentication", label: "Authentication & Security" },
    { value: "moderation", label: "Safety & Moderation" },
  ];

  
  useEffect(() => {
    if (userId) {
      fetchActivityData();
    }
  }, [userId, currentPage, startDate, endDate, selectedCategory]);

  useEffect(() => {
    // Apply client-side search filter only (category is already filtered server-side)
    if (searchTerm && searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      const filtered = activities.filter((activity) => {
        const action = (activity.action || "").toLowerCase();
        const metadata = JSON.stringify(activity.metadata || {}).toLowerCase();
        return action.includes(term) || metadata.includes(term);
      });
      console.log("Search filter applied, filtered count:", filtered.length);
      setFilteredActivities(filtered);
    } else {
      // No search term, show all activities from server
      console.log("No search term, showing all activities:", activities.length);
      setFilteredActivities(activities);
    }
  }, [activities, searchTerm]);

  useEffect(() => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [currentPage]);

  const fetchActivityData = async () => {
    if (!userId) {
      console.error("No userId provided");
      return;
    }
    try {
      setLoading(true);
      const params = {
        page: currentPage,
        limit: 10,
      };
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (selectedCategory !== "all") params.category = selectedCategory;
      console.log(
        "Fetching activity data for user:",
        userId,
        "with params:",
        params,
      );
      const response = await api.get(
        `/api/users/${userId}/activity`,
        { params }
      );
      console.log("Activity data response:", response.data);
      if (response.data) {
        setUser(response.data.user || null);
        setSummary(response.data.summary || {});
        const fetchedActivities = Array.isArray(response.data.activities)
          ? response.data.activities
          : [];
        console.log("Fetched activities count:", fetchedActivities.length);
        setActivities(fetchedActivities);
        setPagination(response.data.pagination || {});
        // Apply search filter if exists, otherwise show all activities
        if (searchTerm && searchTerm.trim()) {
          const term = searchTerm.toLowerCase().trim();
          const filtered = fetchedActivities.filter((activity) => {
            const action = (activity.action || "").toLowerCase();
            const metadata = JSON.stringify(
              activity.metadata || {},
            ).toLowerCase();
            return action.includes(term) || metadata.includes(term);
          });
          console.log(
            "Filtered activities count (with search):",
            filtered.length,
          );
          setFilteredActivities(filtered);
        } else {
          console.log("Setting all activities (no search term)");
          setFilteredActivities(fetchedActivities);
        }
      } else {
        console.error("No data in response");
        toast.error("No data received from server");
        setActivities([]);
        setFilteredActivities([]);
      }
    } catch (error) {
      console.error("Error fetching activity data:", error);
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        "Failed to load user activity";
      toast.error(errorMessage);
      // Set empty states on error
      setActivities([]);
      setFilteredActivities([]);
      setSummary({});
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (activityKey) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(activityKey)) {
      newExpanded.delete(activityKey);
    } else {
      newExpanded.add(activityKey);
    }
    setExpandedItems(newExpanded);
  };

  const getActionIcon = (action) => {
    const iconMap = {
      login: <MdLock className="text-green-500" />,
      logout: <MdLock className="text-gray-400" />,
      upload_reel: <MdVideoLibrary className="text-blue-500" />,
      like_reel: <MdFavorite className="text-red-500" />,
      comment: <MdComment className="text-yellow-500" />,
      reply_comment: <MdComment className="text-yellow-400" />,
      follow_user: <MdPerson className="text-purple-500" />,
      unfollow_user: <MdPerson className="text-gray-400" />,
      upload_music: <MdMusicNote className="text-pink-500" />,
      block_reel: <MdBlock className="text-red-600" />,
      edit_reel: <MdEdit className="text-blue-400" />,
      delete_reel: <MdDelete className="text-red-500" />,
      report_reel: <MdReport className="text-orange-500" />,
      account_suspended: <MdBlock className="text-red-600" />,
      account_reactivated: <MdCheckCircle className="text-green-500" />,
      account_created: <MdCheckCircle className="text-green-500" />,
      like_comment: <MdFavorite className="text-red-400" />,
      update_profile_name: <MdEdit className="text-blue-400" />,
      update_profile_bio: <MdEdit className="text-blue-400" />,
      update_profile_picture: <MdEdit className="text-blue-400" />,
    };
    return iconMap[action] || <MdVisibility className="text-gray-400" />;
  };

  const getStatusColor = (status) => {
    const colorMap = {
      Active: "bg-green-100 text-green-600",
      Suspended: "bg-red-100 text-red-600",
      Blocked: "bg-red-100 text-red-600",
      Published: "bg-green-100 text-green-600",
      Processing: "bg-yellow-100 text-yellow-600",
      Deleted: "bg-gray-100 text-gray-600",
    };
    return colorMap[status] || "bg-gray-100 text-gray-600";
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString(),
      full: date.toLocaleString(),
    };
  };

  const formatActionLabel = (action) => {
    return action
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const renderActivityItem = (activity, index) => {
    // Create a unique key from activity properties
    const activityKey = `${activity.type}-${activity.action}-${activity.timestamp}-${activity.metadata?.reelId || activity.metadata?.commentId || activity.metadata?.userId || index}`;
    const isExpanded = expandedItems.has(activityKey);
    const timestamp = formatTimestamp(activity.timestamp);
    const { metadata } = activity;
    return (
      <div
        key={activityKey}
        className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 hover:border-gray-300 transition-colors flex items-start gap-3 sm:gap-4 shadow-sm"
      >
        <div className="mt-1 shrink-0">{getActionIcon(activity.action)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4 mb-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-black font-medium text-sm sm:text-base break-words">
                {formatActionLabel(activity.action)}
              </span>
              <span
                className={`px-2 py-1 rounded text-[10px] sm:text-xs whitespace-nowrap ${getStatusColor(activity.category)}`}
              >
                {activity.category}
              </span>
            </div>
            <span className="text-gray-500 text-xs sm:text-sm whitespace-nowrap">
              {timestamp.date} {timestamp.time}
            </span>
          </div>
          {/* Basic metadata */}
          <div className="text-gray-700 text-sm space-y-1">
            {metadata.caption && (
              <p className="truncate">Reel: {metadata.caption}</p>
            )}
            {metadata.text && (
              <p className="truncate">Comment: {metadata.text}</p>
            )}
            {metadata.username && <p>User: @{metadata.username}</p>}
            {metadata.title && <p>Music: {metadata.title}</p>}
            {metadata.status && (
              <span
                className={`px-2 py-1 rounded text-xs ${getStatusColor(metadata.status)}`}
              >
                {metadata.status}
              </span>
            )}
          </div>
          {/* Expandable details */}
          {Object.keys(metadata).length > 0 && (
            <button
              onClick={() => toggleExpand(activityKey)}
              className="mt-2 text-primary-600 text-sm flex items-center gap-1 hover:text-primary-500"
            >
              {isExpanded ? <MdExpandLess /> : <MdExpandMore />}
              {isExpanded ? "Hide Details" : "Show Details"}
            </button>
          )}
          {/* Expanded metadata */}
          {isExpanded && (
            <div className="mt-3 p-3 bg-gray-50 rounded border border-gray-200 text-xs space-y-2">
              {metadata.device && (
                <div>
                  <span className="text-gray-500">Device:</span>{" "}
                  <span className="text-black">{metadata.device}</span>
                </div>
              )}
              {metadata.browser && (
                <div>
                  <span className="text-gray-500">Browser:</span>{" "}
                  <span className="text-black">{metadata.browser}</span>
                </div>
              )}
              {metadata.location && (
                <div>
                  <span className="text-gray-500">Location:</span>{" "}
                  <span className="text-black">
                    {metadata.location.city && `${metadata.location.city}, `}
                    {metadata.location.country}
                    {metadata.location.ip && ` (IP: ${metadata.location.ip})`}
                  </span>
                </div>
              )}
              {metadata.views !== undefined && (
                <div>
                  <span className="text-gray-500">Views:</span>{" "}
                  <span className="text-black">{metadata.views}</span>
                </div>
              )}
              {metadata.likes !== undefined && (
                <div>
                  <span className="text-gray-500">Likes:</span>{" "}
                  <span className="text-black">{metadata.likes}</span>
                </div>
              )}
              {metadata.reason && (
                <div>
                  <span className="text-gray-500">Reason:</span>{" "}
                  <span className="text-black">{metadata.reason}</span>
                </div>
              )}
              {metadata.reelId && (
                <div>
                  <span className="text-gray-500">Reel ID:</span>{" "}
                  <span className="text-black font-mono">
                    {metadata.reelId}
                  </span>
                </div>
              )}
              {metadata.commentId && (
                <div>
                  <span className="text-gray-500">Comment ID:</span>{" "}
                  <span className="text-black font-mono">
                    {metadata.commentId}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex-shrink-0 self-center">
          <MdChevronRight className="text-gray-400 text-2xl" />
        </div>
      </div>
    );
  };

  if (loading && !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div
      ref={topRef}
      className="space-y-6 animate-fadeIn bg-white min-h-screen p-4 sm:p-6"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3 sm:gap-4">
          <button
            onClick={() => navigate("/users")}
            className="p-2 bg-gray-100 hover:bg-gray-200 text-black rounded-lg transition-colors shrink-0 mt-1 sm:mt-0"
          >
            <MdArrowBack className="text-xl" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-black mb-1 sm:mb-2 truncate">
              User Activity Details
            </h1>
            {user && (
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-500">
                <div className="flex items-center gap-2 shrink-0">
                  {user.profilePicture ? (
                    <img
                      src={user.profilePicture}
                      alt={user.username}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center">
                      <MdPerson className="text-white" />
                    </div>
                  )}
                  <span className="text-black font-medium">
                    @{user.username}
                  </span>
                  {user.name && (
                    <span className="text-gray-600">({user.name})</span>
                  )}
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    user.isSuspended
                      ? "bg-red-100 text-red-600"
                      : "bg-green-100 text-green-600"
                  }`}
                >
                  {user.isSuspended ? "Suspended" : "Active"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          <div
            onClick={() => navigate(`/users/${userId}/posts`)}
            className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-primary-500 transition flex items-center justify-between shadow-sm"
          >
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-blue-50">
                  <MdVideoLibrary className="text-blue-500 text-xl" />
                </div>
                <span className="text-gray-500 text-sm">Posts</span>
              </div>
              <div className="text-2xl font-bold text-black">
                {summary?.totalPosts ?? 0}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                View all uploaded videos
              </p>
            </div>
            <MdChevronRight className="text-gray-400 text-2xl flex-shrink-0" />
          </div>

          <div
            onClick={() => navigate(`/users/${user.userid}/liked-reels`)}
            className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-primary-500 transition flex items-center justify-between shadow-sm"
          >
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-pink-50">
                  <MdFavorite className="text-pink-500 text-xl" />
                </div>
                <span className="text-gray-500 text-sm">Liked Reels</span>
              </div>
              <div className="text-2xl font-bold text-black">
                {summary?.totalLikedReels ?? 0}
              </div>
              <p className="text-xs text-gray-400 mt-2">View liked reels</p>
            </div>
            <MdChevronRight className="text-gray-400 text-2xl flex-shrink-0" />
          </div>

          <div
            onClick={() => navigate(`/users/${user.userid}/comments`)}
            className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-primary-500 transition flex items-center justify-between shadow-sm"
          >
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-yellow-50">
                  <MdComment className="text-yellow-500 text-xl" />
                </div>
                <span className="text-gray-500 text-sm">Comments</span>
              </div>
              <div className="text-2xl font-bold text-black">
                {summary?.totalComments ?? 0}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                View all user comments
              </p>
            </div>
            <MdChevronRight className="text-gray-400 text-2xl flex-shrink-0" />
          </div>

          <div
            onClick={() => navigate(`/users/${user.userid}/followers`)}
            className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-primary-500 transition flex items-center justify-between shadow-sm"
          >
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-purple-50">
                  <MdPeople className="text-purple-500 text-xl" />
                </div>
                <span className="text-gray-500 text-sm">Followers</span>
              </div>
              <div className="text-2xl font-bold text-black">
                {summary?.totalFollowers ?? 0}
              </div>
              <p className="text-xs text-gray-400 mt-2">View all followers</p>
            </div>
            <MdChevronRight className="text-gray-400 text-2xl flex-shrink-0" />
          </div>

          <div
            onClick={() => navigate(`/users/${user.userid}/following`)}
            className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-primary-500 transition flex items-center justify-between shadow-sm"
          >
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-indigo-50">
                  <MdPersonAdd className="text-indigo-500 text-xl" />
                </div>
                <span className="text-gray-500 text-sm">Following</span>
              </div>
              <div className="text-2xl font-bold text-black">
                {summary?.totalFollowing ?? 0}
              </div>
              <p className="text-xs text-gray-400 mt-2">View all following</p>
            </div>
            <MdChevronRight className="text-gray-400 text-2xl flex-shrink-0" />
          </div>

          <div
            onClick={() => navigate(`/users/${userId}/music`)}
            className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-primary-500 transition flex items-center justify-between shadow-sm"
          >
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-pink-50">
                  <MdMusicNote className="text-pink-500 text-xl" />
                </div>
                <span className="text-gray-500 text-sm">Music Uploads</span>
              </div>
              <div className="text-2xl font-bold text-black">
                {summary?.totalMusicUploads ?? 0}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                View all uploaded music
              </p>
            </div>
            <MdChevronRight className="text-gray-400 text-2xl flex-shrink-0" />
          </div>

          <div
            onClick={() => navigate(`/users/${user.userid}/liked-comments`)}
            className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-primary-500 transition flex items-center justify-between shadow-sm"
          >
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-red-50">
                  <MdFavorite className="text-red-500 text-xl" />
                </div>
                <span className="text-gray-500 text-sm">Liked Comments</span>
              </div>
              <div className="text-2xl font-bold text-black">
                {summary?.totalLikedComments ?? 0}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                View all liked comments
              </p>
            </div>
            <MdChevronRight className="text-gray-400 text-2xl flex-shrink-0" />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <MdFilterList className="text-gray-500 text-xl" />
          <h2 className="text-black font-semibold">Filters</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-gray-500 text-sm mb-2">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {categories.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-gray-500 text-sm mb-2">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-gray-500 text-sm mb-2">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-gray-500 text-sm mb-2">Search</label>
          <div className="relative">
            <MdSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl" />
            <input
              type="text"
              placeholder="Search activities..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>

      {/* Activities Timeline */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-black font-semibold text-xl mb-4">
          Activity Timeline
        </h2>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="spinner"></div>
          </div>
        ) : filteredActivities.length === 0 && activities.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {user
              ? "No activities found for this user."
              : "Loading user data..."}
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No activities found matching your search criteria.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredActivities.map((activity, index) =>
              renderActivityItem(activity, index),
            )}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 mt-6 pb-8">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="px-3 sm:px-4 py-2 bg-gray-100 text-black text-sm sm:text-base rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-200 transition-colors font-medium"
            >
              &lt; Previous
            </button>
            <span className="text-sm sm:text-base text-gray-600 font-medium">
              Page <span className="text-black">{currentPage}</span> of{" "}
              <span className="text-black">{pagination.totalPages}</span>
            </span>
            <button
              disabled={currentPage >= pagination.totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="px-3 sm:px-4 py-2 bg-gray-100 text-black text-sm sm:text-base rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-200 transition-colors font-medium"
            >
              Next &gt;
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserActivityDetails;
