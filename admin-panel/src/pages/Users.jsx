import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import {
  MdSearch,
  MdVisibility,
  MdBlock,
  MdCheckCircle,
  MdPerson,
  MdDelete,
  MdDownload,
} from "react-icons/md";
import toast from "react-hot-toast";

// ✅ Excel Import added (PDF removed)
import * as XLSX from "xlsx";



const Users = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [page, setPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [suspendModal, setSuspendModal] = useState(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const topRef = useRef(null);
  
  // ✅ Naya state checkboxes ke liye
  const [selectedUserIds, setSelectedUserIds] = useState([]);

  const [filters, setFilters] = useState({
    search: "",
    status: "",
    startDate: "",
    endDate: "",
  });

  const limit = 15;

  useEffect(() => {
    fetchUsers();
  }, [page, filters]);

  useEffect(() => {
    if (topRef.current) {
      topRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [page]);

  const fetchUsers = async () => {
    try {
      setLoading(true);

      const { search, status, startDate, endDate } = filters;

      const response = await api.get(
        `/api/users/admin_users`,
        {
          params: {
            page,
            limit,
            search,
            status,
            startDate,
            endDate,
          },
        },
      );

      setUsers(response.data.data);
      setTotalUsers(response.data.total);
      setSelectedUserIds([]); // Page change hone par selection clear karna
    } catch (error) {
      toast.error("Permission denied");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Checkbox Select All Handler
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedUserIds(users.map((u) => u._id));
    } else {
      setSelectedUserIds([]);
    }
  };

  // ✅ Single Checkbox Handler
  const handleSelectUser = (userId) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSuspendToggle = async (userId, currentStatus, reason = "") => {
    try {
      await api.put(
        `/api/users/admin_users/${userId}`,
        {
          isSuspended: !currentStatus,
          suspendReason: reason,
        },
        {
        
        }
      );

      toast.success(
        `User ${!currentStatus ? 'suspended' : 'activated'} successfully`
      );

      setSuspendModal(null);
      setSuspendReason("");

      fetchUsers();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || 'Permission denied');
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      await api.delete(
        `/api/users/admin_users/${userId}`,
        {
          
        },
      );

      toast.success("User and all related data deleted successfully");
      setConfirmDelete(null);
      fetchUsers();
    } catch (error) {
      console.error("Error deleting user:", error);
      toast.error(error.response?.data?.message || "Failed to delete user");
    }
  };

  // ✅ Single User Export (Excel format)
  const handleExportUser = (user) => {
    try {
      // Create an array of objects to represent rows in Excel
      const userData = [
        {
          "Full Name": user.name || "N/A",
          "Username": `@${user.username}` || "N/A",
          "User ID": user.userid || "N/A",
          "Mobile Number": user.mobile || "N/A",
          "Email Address": user.email || "N/A",
          "Account Status": user.isSuspended ? "Suspended" : "Active",
          "Joined Date": new Date(user.createdAt).toLocaleDateString(),
          "Followers": user.followers?.length || 0,
          "Following": user.following?.length || 0,
          "Seller ID": user.seller_id || "N/A",
          "User Seller ID": user.userseller_id || "N/A",
          "Bio": user.bio || "No bio provided"
        }
      ];

      // Convert JSON data to worksheet
      const worksheet = XLSX.utils.json_to_sheet(userData);
      
      // Create a new workbook and append the worksheet
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "User Profile Report");

      // Save the Excel file
      XLSX.writeFile(workbook, `${user.username || 'user'}_report.xlsx`);
      toast.success("Professional Excel Report Downloaded!");

    } catch (error) {
      console.error("Export Error:", error);
      toast.error("Failed to generate Excel file");
    }
  };

  // ✅ Bulk Export for Multiple Users (Excel format)
  const handleBulkExport = () => {
    if (selectedUserIds.length === 0) return;

    try {
      // Filter only selected users
      const selectedUsersData = users.filter((u) => selectedUserIds.includes(u._id));

      // Map users to formatted objects for Excel
      const excelData = selectedUsersData.map((user) => ({
        "Name": user.name || "N/A",
        "Username": `@${user.username}`,
        "User ID": user.userid || "N/A",
        "Mobile": user.mobile || "N/A",
        "Email": user.email || "N/A",
        "Followers": user.followers?.length || 0,
        "Following": user.following?.length || 0,
        "Seller ID": user.seller_id || "N/A",
        "User Seller ID": user.userseller_id || "N/A",
        "Status": user.isSuspended ? "Suspended" : "Active",
        "Joined": new Date(user.createdAt).toLocaleDateString()
      }));

      // Convert mapped data to worksheet
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      
      // Create workbook and append worksheet
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Bulk Users Report");

      // Save the file
      XLSX.writeFile(workbook, `Bulk_Users_Report_${Date.now()}.xlsx`);
      
      toast.success(`${selectedUserIds.length} users exported to Excel successfully!`);
      setSelectedUserIds([]); // Download ke baad uncheck kar dena

    } catch (error) {
      console.error("Bulk Export Error:", error);
      toast.error("Failed to generate bulk Excel file");
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({
      ...prev,
      [name]: value,
    }));
    setPage(1);
  };

  const openModal = (user) => {
    setSelectedUser(user);
    setShowModal(true);
  };

  const viewActivityDetails = (user) => {
    navigate(`/users/${user._id}/activity`);
  };

  const closeModal = () => {
    setSelectedUser(null);
    setShowModal(false);
  };

  return (
    <div
      ref={topRef}
      className="space-y-4 sm:space-y-6 animate-fadeIn bg-white text-gray-900 p-4 sm:p-6"
    >
   {/* Header & Bulk Download Button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="w-full sm:w-auto">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">Users</h1>
          <p className="text-gray-500 text-sm sm:text-base">
            {/* Manage all registered users ({totalUsers}) */}
             Manage all registered users 
          </p>
        </div>
        
        {/* Naya Bulk Download Button */}
        {selectedUserIds.length > 0 && (
          <button
            onClick={handleBulkExport}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium text-sm sm:text-base shadow-sm w-full sm:w-auto"
          >
            <MdDownload size={20} />
            Download Selected ({selectedUserIds.length})
          </button>
        )}
      </div>

     {/* FILTER BAR */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col lg:flex-row gap-4 items-start lg:items-end w-full shadow-sm">
        {/* Search */}
        <div className="flex flex-col gap-1 w-full lg:flex-1">
          <label className="text-[10px] font-bold uppercase text-gray-400">
            Search
          </label>
          <input
            type="text"
            name="search"
            placeholder="User ID, Username, Name or Email..."
            value={filters.search}
            onChange={handleFilterChange}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 w-full"
          />
        </div>

        <div className="grid grid-cols-1 min-[480px]:grid-cols-3 gap-4 w-full lg:w-auto">
          {/* Status */}
          <div className="flex flex-col gap-1 w-full">
            <label className="text-[10px] font-bold uppercase text-gray-400">
              Status
            </label>
            <select
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white outline-none w-full"
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          {/* From */}
          <div className="flex flex-col gap-1 w-full">
            <label className="text-[10px] font-bold uppercase text-gray-400">
              From
            </label>
            <input
              type="date"
              name="startDate"
              value={filters.startDate}
              onChange={handleFilterChange}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 w-full bg-white"
            />
          </div>

          {/* To */}
          <div className="flex flex-col gap-1 w-full">
            <label className="text-[10px] font-bold uppercase text-gray-400">
              To
            </label>
            <input
              type="date"
              name="endDate"
              value={filters.endDate}
              onChange={handleFilterChange}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 w-full bg-white"
            />
          </div>
        </div>

        {/* Reset */}
        <button
          onClick={() => {
            setFilters({
              search: "",
              status: "",
              startDate: "",
              endDate: "",
            });
            setPage(1);
          }}
          className="text-xs font-bold text-red-500 hover:text-red-700 w-full lg:w-auto text-center py-2 lg:py-0 lg:pb-2 transition-colors"
        >
          Reset Filters
        </button>
      </div>

      {/* Loader */}
      {loading && (
        <div className="flex justify-center py-6">
          <div className="spinner"></div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full min-w-[1100px] divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {/* Select All Checkbox */}
                <th className="px-4 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                  <input
                    type="checkbox"
                    checked={users.length > 0 && selectedUserIds.length === users.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="px-4 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-4 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User ID
                </th>
                <th className="px-4 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-4 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Stats
                </th>
                <th className="px-4 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Seller ID
                </th>
                <th className="px-4 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User Seller ID
                </th>
                <th className="px-4 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Joined
                </th>
                <th className="px-4 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr
                  key={user._id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  {/* Single Item Checkbox */}
                  <td className="px-4 py-4 text-center whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(user._id)}
                      onChange={() => handleSelectUser(user._id)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      {user.profilePicture ? (
                        <img
                          src={user.profilePicture}
                          alt={user.username}
                          className="w-10 h-10 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                          <MdPerson className="text-white text-xl" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-gray-900 font-medium truncate max-w-[120px]">
                          {user.name || "No name"}
                        </p>
                        <p className="text-gray-500 text-sm truncate max-w-[120px]">
                          @{user.username}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-gray-700 text-sm whitespace-nowrap">
                    {user.userid || "N/A"}
                  </td>

                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                    <p className="text-gray-700 text-sm">{user.mobile}</p>
                    {user.email && (
                      <p className="text-gray-500 text-xs truncate max-w-[140px]">{user.email}</p>
                    )}
                  </td>

                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                    <div className="text-sm">
                      <p className="text-gray-700">
                        <span className="text-blue-600 font-medium">
                          {user.followers?.length || 0}
                        </span>{" "}
                        followers
                      </p>
                      <p className="text-gray-500">
                        {user.following?.length || 0} following
                      </p>
                    </div>
                  </td>
                  
                  <td className="px-4 sm:px-6 py-4 text-gray-700 text-sm whitespace-nowrap">
                    {user.seller_id || "N/A"}
                  </td>

                  <td className="px-4 sm:px-6 py-4 text-gray-700 text-sm whitespace-nowrap">
                    {user.userseller_id || "N/A"}
                  </td>

                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-3 py-1 inline-flex rounded-full text-xs font-semibold ${
                        user.isSuspended
                          ? "bg-red-100 text-red-800"
                          : "bg-green-100 text-green-800"
                      }`}
                    >
                      {user.isSuspended ? "Suspended" : "Active"}
                    </span>
                  </td>

                  <td className="px-4 sm:px-6 py-4 text-gray-700 text-sm whitespace-nowrap">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>

                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => viewActivityDetails(user)}
                        className="p-1.5 sm:p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                        title="View Activity"
                      >
                        <MdVisibility size={18} />
                      </button>
                      <button
                        onClick={() => {
                          if (user.isSuspended) {
                            handleSuspendToggle(user._id, user.isSuspended);
                          } else {
                            setSuspendModal(user);
                          }
                        }}
                        className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
                          user.isSuspended
                            ? "bg-green-600 hover:bg-green-700 text-white"
                            : "bg-yellow-500 hover:bg-yellow-600 text-white"
                        }`}
                        title={user.isSuspended ? "Activate" : "Suspend"}
                      >
                        {user.isSuspended ? <MdCheckCircle size={18} /> : <MdBlock size={18} />}
                      </button>
                      {/* Export Single User Button */}
                      <button
                        onClick={() => handleExportUser(user)}
                        className="p-1.5 sm:p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                        title="Export User Data"
                      >
                        <MdDownload size={18} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(user)}
                        className="p-1.5 sm:p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                        title="Delete User"
                      >
                        <MdDelete size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

   {/* Pagination */}
      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 mt-4 sm:mt-6 pb-6 sm:pb-8">
        <button
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
          className="px-3 sm:px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg disabled:opacity-40 text-sm sm:text-base font-medium transition-colors"
        >
          &lt; Prev
        </button>

        <span className="text-sm sm:text-base text-gray-600 font-medium">
          Page <span className="text-gray-900">{page}</span> of{" "}
          <span className="text-gray-900">{Math.max(1, Math.ceil(totalUsers / limit))}</span>
        </span>

        <button
          disabled={page >= Math.ceil(totalUsers / limit)}
          onClick={() => setPage((p) => p + 1)}
          className="px-3 sm:px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg disabled:opacity-40 text-sm sm:text-base font-medium transition-colors"
        >
          Next &gt;
        </button>
      </div>

      {/* User Details Modal */}
      {showModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">User Details</h2>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              <div className="flex items-center gap-4 mb-4 sm:mb-6">
                {selectedUser.profilePicture ? (
                  <img
                    src={selectedUser.profilePicture}
                    alt={selectedUser.username}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                    <MdPerson className="text-white text-3xl" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">
                    {selectedUser.name || "No name"}
                  </h3>
                  <p className="text-gray-500 truncate">@{selectedUser.username}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-gray-500 text-xs uppercase font-bold mb-1">Mobile</p>
                  <p className="text-gray-900">{selectedUser.mobile}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-gray-500 text-xs uppercase font-bold mb-1">Email</p>
                  <p className="text-gray-900 truncate">{selectedUser.email || "N/A"}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-gray-500 text-xs uppercase font-bold mb-1">Followers</p>
                  <p className="text-gray-900 font-semibold">
                    {selectedUser.followers?.length || 0}
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-gray-500 text-xs uppercase font-bold mb-1">Following</p>
                  <p className="text-gray-900 font-semibold">
                    {selectedUser.following?.length || 0}
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-gray-500 text-xs uppercase font-bold mb-1">Status</p>
                  <p className={`font-semibold ${selectedUser.isSuspended ? "text-red-600" : "text-green-600"}`}>
                    {selectedUser.isSuspended ? "Suspended" : "Active"}
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-gray-500 text-xs uppercase font-bold mb-1">Joined</p>
                  <p className="text-gray-900">
                    {new Date(selectedUser.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {selectedUser.bio && (
                <div className="bg-gray-50 p-3 rounded-lg mt-2">
                  <p className="text-gray-500 text-xs uppercase font-bold mb-1">Bio</p>
                  <p className="text-gray-900 text-sm leading-relaxed">{selectedUser.bio}</p>
                </div>
              )}
            </div>

            <div className="p-4 sm:p-6 border-t border-gray-200 flex justify-end">
              <button
                onClick={closeModal}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors w-full sm:w-auto"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white border border-gray-200 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <MdDelete size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Delete User?
              </h3>
              <p className="text-gray-500 mb-6 text-sm sm:text-base">
                Are you sure you want to delete{" "}
                <span className="font-semibold text-gray-800">@{confirmDelete.username}</span>
                ? This will permanently remove their profile, reels, comments,
                and all related data. This action cannot be undone.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteUser(confirmDelete._id)}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                >
                  Delete User
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Suspend Modal */}
      {suspendModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-xl font-bold mb-2 text-gray-900">
              Suspend User
            </h3>

            <p className="text-gray-500 mb-4 text-sm sm:text-base">
              Why are you suspending <b className="text-gray-800">@{suspendModal.username}</b>?
            </p>

            <textarea
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Enter suspension reason..."
              className="w-full border border-gray-300 rounded-lg p-3 mb-5 outline-none focus:ring-2 focus:ring-red-500 resize-none text-sm"
              rows={3}
            />

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  setSuspendModal(null);
                  setSuspendReason("");
                }}
                className="flex-1 bg-gray-100 py-2.5 rounded-lg font-medium hover:bg-gray-200 transition-colors text-gray-800"
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  if (!suspendReason.trim()) {
                    toast.error("Please enter a reason");
                    return;
                  }
                  handleSuspendToggle(
                    suspendModal._id,
                    suspendModal.isSuspended,
                    suspendReason
                  );
                }}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors"
              >
                Confirm Suspend
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;