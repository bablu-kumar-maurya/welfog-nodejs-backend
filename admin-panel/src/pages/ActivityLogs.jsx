import { useEffect, useState, useRef } from "react";
import api from "../api/axios";
import toast from "react-hot-toast";


const ActivityLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // 🔍 Added startDate and endDate states
  const [filters, setFilters] = useState({
    action: "",
    targetType: "",
    search: "",
    startDate: "",
    endDate: ""
  });

  const topRef = useRef(null);

  const scrollToTop = () => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Instant fetch on any filter change
  useEffect(() => {
    fetchLogs();
  }, [currentPage, filters.action, filters.targetType, filters.search, filters.startDate, filters.endDate]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { action, targetType, search, startDate, endDate } = filters;
      
      const res = await api.get(
        `/api/admin/activity-logs?page=${currentPage}&limit=20&action=${action}&targetType=${targetType}&search=${search}&startDate=${startDate}&endDate=${endDate}`,{
         
        }
      );
      
      setLogs(res.data.logs || []);
      setTotalPages(res.data.pagination?.totalPages || 1);
      scrollToTop();
    } catch (err) {
      toast.error("Failed to load activity logs");
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setCurrentPage(1); 
  };

  const handlePrev = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  };

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-gray-800 font-medium">
        Loading logs...
      </div>
    );
  }

  return (
    <div ref={topRef} className="space-y-6 bg-white text-gray-900 p-3 sm:p-4 md:p-6 animate-fadeIn w-full max-w-full overflow-hidden box-border">
      {/* HEADER & FILTERS */}
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Activity Logs</h1>
          <p className="text-sm text-gray-500">Track system actions and movements</p>
        </div>

        {/* 🛠️ IMPROVED FILTER BAR - Using CSS Grid for perfect responsive alignment */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 items-end w-full">
          
          {/* Search */}
          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Search</label>
            <input 
              type="text"
              placeholder="Name or Action..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
              value={filters.search}
              onChange={(e) => setFilters({...filters, search: e.target.value})}
            />
          </div>

          {/* Action Filter */}
          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Action</label>
            <select 
              name="action"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
              value={filters.action}
              onChange={handleFilterChange}
            >
              <option value="">All Actions</option>
              <option value="create_role">Add Role</option>
              <option value="edit_role">Edit Role</option>
              <option value="delete_role">Delete Role</option>
              <option value="create_staff">Add Staff</option>
              <option value="delete_staff">Delete Staff</option>
              <option value="delete_music">Delete Music</option>
              <option value="suspend_user">Suspend User</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Category</label>
            <select 
              name="targetType"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
              value={filters.targetType}
              onChange={handleFilterChange}
            >
              <option value="">All Categories</option>
              <option value="Role">Roles</option>
              <option value="Staff">Staffs</option>
              <option value="Music">Music</option>
              <option value="User">Users</option>
            </select>
          </div>

          {/* Start Date */}
          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">From</label>
            <input 
              type="date"
              name="startDate"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
              value={filters.startDate}
              onChange={handleFilterChange}
            />
          </div>

          {/* End Date */}
          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">To</label>
            <input 
              type="date"
              name="endDate"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
              value={filters.endDate}
              onChange={handleFilterChange}
            />
          </div>

          {/* Reset Filters */}
          <div className="flex items-center sm:col-span-2 lg:col-span-1 xl:col-span-1 w-full sm:pt-4 xl:pt-0">
            <button 
              onClick={() => setFilters({action: "", targetType: "", search: "", startDate: "", endDate: ""})}
              className="w-full xl:w-auto px-4 py-2 border border-red-100 bg-red-50 text-red-600 rounded-lg text-sm font-bold hover:bg-red-100 hover:text-red-700 transition-colors"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* MOBILE LIST VIEW (Visible up to md screens) */}
      <div className="md:hidden space-y-4 mt-6">
        {logs.length === 0 ? (
          <div className="text-center py-10 text-gray-500 bg-gray-50 rounded-xl border border-gray-100">No logs found</div>
        ) : (
          logs.map((log) => (
            <div key={log._id} className="bg-white border border-gray-200 p-4 rounded-xl space-y-4 shadow-sm hover:shadow-md transition-shadow">
              
              <div className="flex flex-wrap justify-between items-start gap-2 border-b border-gray-100 pb-3">
                <div className="min-w-[50%]">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">User</p>
                  <p className="font-semibold text-gray-900 truncate">{log.metadata?.userName || "Unknown"}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Action</p>
                  <span className="inline-block bg-blue-50 text-blue-700 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide">
                    {log.action}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Role</p>
                  <p className="text-sm text-gray-600 truncate">
                    {typeof log.metadata?.userRole === "string"
                      ? log.metadata.userRole
                      : log.metadata?.userRole?.name || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Target</p>
                  <p className="text-sm text-gray-900 font-medium truncate">
                    {log.targetName ? (
                      <span className="text-blue-600 font-bold">{log.targetName}</span>
                    ) : (
                      log.targetType
                    )}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex flex-wrap justify-between items-center gap-2">
                <p className="text-[11px] text-gray-500 font-medium">{new Date(log.createdAt).toLocaleString()}</p>
                <p className="text-[10px] bg-gray-100 px-2 py-1 rounded-md text-gray-600 font-medium truncate max-w-[120px]">
                  {log.device || "N/A"}
                </p>
              </div>

            </div>
          ))
        )}
      </div>

      {/* DESKTOP TABLE VIEW (Visible on md and larger) */}
      <div className="hidden md:block bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mt-6">
        <div className="overflow-x-auto w-full">
          <table className="min-w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-gray-50/80 text-gray-600 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3.5 font-bold text-xs uppercase tracking-wider">User</th>
                <th className="px-4 py-3.5 font-bold text-xs uppercase tracking-wider">Role</th>
                <th className="px-4 py-3.5 font-bold text-xs uppercase tracking-wider">Action</th>
                <th className="px-4 py-3.5 font-bold text-xs uppercase tracking-wider">Target</th>
                <th className="px-4 py-3.5 font-bold text-xs uppercase tracking-wider">Date</th>
                {/* Hidden on smaller tablets, visible on large desktops to save space */}
                <th className="px-4 py-3.5 font-bold text-xs uppercase tracking-wider hidden lg:table-cell">Device</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-gray-500">No logs found</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log._id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-3 text-gray-900 font-medium max-w-[150px] truncate">{log.metadata?.userName || "Unknown"}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[120px] truncate">{log.metadata?.userRole?.name || log.metadata?.userRole || "-"}</td>
                    <td className="px-4 py-3">
                      <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate">
                      {log.targetName ? (
                        <span className="text-gray-900 font-bold text-sm">{log.targetName}</span>
                      ) : (
                        <span className="text-gray-600 font-medium">{log.targetType}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs truncate max-w-[150px] hidden lg:table-cell">{log.device || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PAGINATION */}
      <div className="flex flex-col sm:flex-row items-center justify-between sm:justify-center gap-4 sm:gap-8 px-4 py-5 bg-white mt-4 border-t border-gray-100 rounded-b-xl">
        <button
          onClick={handlePrev}
          disabled={currentPage === 1 || loading}
          className="w-full sm:w-auto flex justify-center items-center gap-1.5 px-4 py-2 text-sm font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:text-blue-600 disabled:text-gray-400 disabled:bg-gray-50 disabled:border-transparent disabled:cursor-not-allowed transition-all"
        >
          <span className="text-lg leading-none">&lsaquo;</span> Previous
        </button>
        
        <div className="flex items-center gap-2 text-sm font-medium text-gray-500 bg-gray-50 px-4 py-2 rounded-lg">
          <span>Page</span>
          <span className="text-gray-900 font-bold">{currentPage}</span>
          <span>of</span>
          <span className="text-gray-900 font-bold">{totalPages}</span>
        </div>
        
        <button
          onClick={handleNext}
          disabled={currentPage === totalPages || loading}
          className="w-full sm:w-auto flex justify-center items-center gap-1.5 px-4 py-2 text-sm font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:text-blue-600 disabled:text-gray-400 disabled:bg-gray-50 disabled:border-transparent disabled:cursor-not-allowed transition-all"
        >
          Next <span className="text-lg leading-none">&rsaquo;</span>
        </button>
      </div>
      
    </div>
  );
};

export default ActivityLogs;