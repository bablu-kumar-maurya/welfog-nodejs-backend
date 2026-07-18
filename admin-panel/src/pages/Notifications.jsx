import { useState, useEffect, useRef } from 'react';
import api from "../api/axios";

import {
  MdSearch,
  MdNotifications,
  MdThumbUp,
  MdComment,
  MdPersonAdd,
} from 'react-icons/md';
import toast from 'react-hot-toast';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 12;

  const [filters, setFilters] = useState({
    search: "",
    type: "all",
    startDate: "",
    endDate: ""
  });

  const topRef = useRef(null);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      
      // ✅ FIX 1: localStorage se token lene ki ab zaroorat nahi hai
      const { search, type, startDate, endDate } = filters;
       
   
      const res = await api.get(`/api/notifications/admin_notifications`, {
        params: {
          page,
          limit,
          search,
          type,
          startDate,
          endDate
        },
        
      });

      setNotifications(res.data.notifications || []);
      setTotalPages(res.data.totalPages || 1);

    } catch (err) {
      console.error("Notification Fetch Error:", err);
      // Agar 401 aata hai toh iska matlab session expire ho gaya hai
      toast.error(err.response?.data?.message || 'Failed to fetch notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();

    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [page, filters]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
    setPage(1);
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'like':
        return <MdThumbUp className="text-pink-500" />;
      case 'comment':
        return <MdComment className="text-blue-500" />;
      case 'follow':
        return <MdPersonAdd className="text-green-500" />;
      default:
        return <MdNotifications className="text-yellow-500" />;
    }
  };

  return (
    <div ref={topRef} className="space-y-6 animate-fadeIn bg-white text-gray-900 p-4 md:p-6">
      {/* Header */}
      <div className="border-b border-gray-100 pb-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">
          Notifications
        </h1>
        <p className="text-gray-500 text-sm md:text-base">
          View all system notifications
        </p>
      </div>

      {/* Filters + Search */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4 shadow-sm">
        {/* Search */}
        <div className="relative">
          <MdSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl" />
          <input
            type="text"
            name="search"
            placeholder="Search notifications..."
            value={filters.search}
            onChange={handleFilterChange}
            className="w-full pl-12 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Type Buttons */}
        <div className="flex gap-2 flex-wrap">
          {['all', 'like', 'comment', 'follow'].map((type) => (
            <button
              key={type}
              onClick={() => {
                setFilters(prev => ({ ...prev, type }));
                setPage(1);
              }}
              className={`flex-1 sm:flex-none px-3 py-1.5 md:px-4 md:py-2 rounded-lg font-medium text-xs md:text-sm transition-colors ${
                filters.type === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>

        {/* Date Filters + Reset */}
        <div className="flex gap-3 flex-wrap mt-3">
          <input
            type="date"
            name="startDate"
            value={filters.startDate}
            onChange={handleFilterChange}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />

          <input
            type="date"
            name="endDate"
            value={filters.endDate}
            onChange={handleFilterChange}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />

          <button
            onClick={() => {
              setFilters({
                search: "",
                type: "all",
                startDate: "",
                endDate: ""
              });
              setPage(1);
            }}
            className="text-xs font-bold text-red-500 hover:text-red-700"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-500">Loading notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-12">
            <MdNotifications className="text-5xl md:text-6xl text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No notifications found</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification._id}
              className="p-4 md:p-6 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start gap-3 md:gap-4">
                <div className="p-2.5 md:p-3 bg-gray-50 rounded-full flex-shrink-0 border border-gray-100">
                  {getNotificationIcon(notification.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1 text-sm md:text-base">
                        <span className="text-gray-900 font-bold truncate max-w-[150px] sm:max-w-none">
                          {notification.senderUserId || 'Unknown User'}
                        </span>
                        <span className="text-gray-600">
                          {notification.message}
                        </span>
                      </div>
                      <p className="text-gray-400 text-xs md:text-sm italic">
                        To: {notification.recipientUserId || 'Unknown'}
                      </p>
                    </div>

                    <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 flex-shrink-0 mt-1 sm:mt-0">
                      <span
                        className={`px-2 py-0.5 md:px-3 md:py-1 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-wider ${
                          notification.type === 'like'
                            ? 'bg-pink-100 text-pink-600'
                            : notification.type === 'comment'
                            ? 'bg-blue-100 text-blue-600'
                            : 'bg-green-100 text-green-600'
                        }`}
                      >
                        {notification.type}
                      </span>
                      <span className="text-gray-400 text-[10px] md:text-xs whitespace-nowrap">
                        {new Date(notification.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {notification.reel && (
                    <div className="mt-2 inline-block bg-gray-50 px-2 py-1 rounded border border-gray-100">
                      <p className="text-gray-500 text-[11px] md:text-sm font-mono">
                        Reel ID: <span className="text-gray-700">{notification.reel.substring(0, 10)}...</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mt-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => page > 1 && setPage((p) => p - 1)}
            disabled={page === 1}
            className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-gray-200 transition-all shadow-sm"
          >
            &lt; Prev
          </button>

          <span className="text-gray-800 font-medium text-sm">
            {page} / {totalPages}
          </span>

          <button
            onClick={() => page < totalPages && setPage((p) => p + 1)}
            disabled={page === totalPages}
            className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-gray-200 transition-all shadow-sm"
          >
            Next &gt;
          </button>
        </div>
      </div>
    </div>
  );
};

export default Notifications;