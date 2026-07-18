import { useState, useEffect, useRef } from 'react';
import api from "../api/axios";
import {
  MdSearch,
  MdDelete,
  MdComment,
  MdPlayArrow,
} from 'react-icons/md';
import toast from 'react-hot-toast';

const Comments = () => {
  const [comments, setComments] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const LIMIT = 19;
  const topRef = useRef(null);
  const [confirmComment, setConfirmComment] = useState(null);
  const [selectedReel, setSelectedReel] = useState(null);
  const [showReelModal, setShowReelModal] = useState(false);
  const [reelLoading, setReelLoading] = useState(false);
  const [filters, setFilters] = useState({
    search: "",
    startDate: "",
    endDate: ""
  });

  useEffect(() => {
    fetchComments();
  }, [page, filters]);

  useEffect(() => {
    topRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, [page]);

  const fetchComments = async () => {
    try {
      if (page === 1) setInitialLoading(true);

      const { search, startDate, endDate } = filters;
      
  
   const res = await api.get("/api/comment/admin-view", {
  params: {
    page,
    limit: LIMIT,
    search,
    startDate,
    endDate,
  },
});

      setComments(res.data.comments || []);
      setTotalPages(res.data.totalPages || 1);
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || 'Failed to fetch comments');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleDelete = async (comment) => {
    try {
      const userId = comment.user?._id;
      
      // ✅ FIX: headers hata kar withCredentials add kiya
      await api.delete(`/api/comment/admin_comment/delete/${comment._id}/${userId}`, {
      });

      toast.success("Comment deleted");
      fetchComments();

    } catch (error) {
      console.error("Delete Error:", error);
      toast.error(error.response?.data?.message || "Failed to delete comment");
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
    setPage(1);
  };

  const handleViewReel = async (reelId) => {
    try {
      setReelLoading(true);
      // ✅ FIX: headers hata kar withCredentials add kiya
      const res = await api.get(`/api/reels/admin_current/${reelId}`, {
      });
      setSelectedReel(res.data);
      setShowReelModal(true);
    } catch {
      toast.error('Permission denied');
    } finally {
      setReelLoading(false);
    }
  };

 return (
    <div
      ref={topRef}
      className="space-y-4 sm:space-y-6 animate-fadeIn bg-white text-gray-900 p-4 sm:p-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">
          Comments
        </h1>
        <p className="text-gray-500 text-sm sm:text-base">Manage all comments</p>
      </div>

  {/* FILTER BAR */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row flex-wrap gap-4 items-start sm:items-end w-full shadow-sm">
        {/* Search */}
        <div className="flex flex-col gap-1 w-full sm:flex-1">
          <label className="text-[10px] font-bold uppercase text-gray-400">Search</label>
          <input
            type="text"
            name="search"
            placeholder="Search comments..."
            value={filters.search}
            onChange={handleFilterChange}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 w-full"
          />
        </div>

        <div className="grid grid-cols-2 sm:flex gap-4 w-full sm:w-auto">
          {/* From */}
          <div className="flex flex-col gap-1 w-full sm:w-36">
            <label className="text-[10px] font-bold uppercase text-gray-400">From</label>
            <input
              type="date"
              name="startDate"
              value={filters.startDate}
              onChange={handleFilterChange}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full bg-white"
            />
          </div>

          {/* To */}
          <div className="flex flex-col gap-1 w-full sm:w-36">
            <label className="text-[10px] font-bold uppercase text-gray-400">To</label>
            <input
              type="date"
              name="endDate"
              value={filters.endDate}
              onChange={handleFilterChange}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full bg-white"
            />
          </div>
        </div>

        {/* Reset */}
        <button
          onClick={() => {
            setFilters({
              search: "",
              startDate: "",
              endDate: ""
            });
            setPage(1);
          }}
          className="text-xs font-bold text-red-500 hover:text-red-700 w-full sm:w-auto text-center sm:pb-2 pt-2 sm:pt-0 transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
      <table className="w-full min-w-[800px] divide-y divide-gray-200">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-left text-sm text-gray-600">Comment</th>
              <th className="px-6 py-4 text-left text-sm text-gray-600">User</th>
              <th className="px-6 py-4 text-left text-sm text-gray-600">Reel</th>
              <th className="px-6 py-4 text-left text-sm text-gray-600">Likes</th>
              <th className="px-6 py-4 text-left text-sm text-gray-600">Date</th>
              <th className="px-6 py-4 text-left text-sm text-gray-600">Actions</th>
            </tr>
          </thead>

          <tbody>
            {comments.map((comment) => (
              <tr
                key={comment._id}
                className="border-b border-gray-200 hover:bg-gray-100"
              >
                <td className="px-6 py-4 text-gray-900">
                  <div className="flex gap-2">
                    <MdComment className="text-blue-500 mt-1" />
                    {comment.text}
                  </div>
                </td>

                <td className="px-6 py-4 text-gray-700">
                  {comment.user
                    ? `@${comment.user.username || comment.user.name}`
                    : 'Unknown'}
                </td>

                <td className="px-6 py-4">
                  {comment.reel ? (
                    <button
                      onClick={() => handleViewReel(comment.reel._id)}
                      className="flex items-center gap-1 text-blue-600 hover:underline text-sm"
                    >
                      <MdPlayArrow /> View Reel
                    </button>
                  ) : (
                    <span className="text-gray-400">Deleted</span>
                  )}
                </td>

                <td className="px-6 py-4 text-gray-700">
                  {comment.likes?.length || 0}
                </td>

                <td className="px-6 py-4 text-gray-700">
                  {new Date(comment.createdAt).toLocaleDateString()}
                </td>

                <td className="px-6 py-4">
                  <button
                    onClick={() => setConfirmComment(comment)}
                    className="p-2 bg-red-600 hover:bg-red-700 rounded-lg text-white"
                  >
                    <MdDelete />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {initialLoading && (
          <div className="flex justify-center py-10">
            <div className="spinner" />
          </div>
        )}

        {!initialLoading && comments.length === 0 && (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="flex flex-col items-center text-gray-500">
              <MdComment className="text-5xl mb-3 opacity-60" />
              <p className="text-sm">No comments found</p>
            </div>
          </div>
        )}
      </div>

   {/* Pagination */}
      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mt-6 pb-6">
        <button
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
          className="px-3 sm:px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm sm:text-base rounded-lg disabled:opacity-50 transition-colors font-medium"
        >
          Previous
        </button>

        <span className="text-gray-800 text-sm sm:text-base font-medium">
          Page <span className="font-bold">{page}</span> of {totalPages}
        </span>

        <button
          disabled={page === totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="px-3 sm:px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm sm:text-base rounded-lg disabled:opacity-50 transition-colors font-medium"
        >
          Next
        </button>
      </div>

    {/* Delete Confirm */}
      {confirmComment && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6 w-full max-w-[320px] shadow-2xl">
            <h3 className="text-gray-900 text-lg font-semibold mb-2">
              Delete Comment?
            </h3>
            <p className="text-gray-600 text-sm sm:text-base mb-6">
              This action cannot be undone.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmComment(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg transition-colors font-medium text-sm sm:text-base"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleDelete(confirmComment);
                  setConfirmComment(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium text-sm sm:text-base"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔥 REEL MODAL */}
      {showReelModal && selectedReel && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-[360px] rounded-xl overflow-hidden shadow-2xl">
            {reelLoading ? (
              <div className="h-[420px] flex items-center justify-center">
                <div className="spinner" />
              </div>
            ) : (
              <>
                <video
                  src={selectedReel.videoUrl}
                  controls
                  autoPlay
                  className="w-full h-[420px] object-cover"
                />
                <div className="p-4 space-y-3">
                  <p className="text-gray-900 text-sm break-words">
                    {selectedReel.caption || "No caption"}
                  </p>
                  <button
                    onClick={() => setShowReelModal(false)}
                    className="w-full py-2.5 bg-red-600 hover:bg-red-700 transition-colors rounded-lg text-white font-medium flex items-center justify-center gap-2"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Comments;