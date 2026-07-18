
import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api/axios";
import { MdArrowBack, MdFavorite } from "react-icons/md";
import toast from "react-hot-toast";

const LIMIT = 10;

const UserLikedComments = () => {
  const { userId } = useParams(); // userid
  const navigate = useNavigate();
  const topRef = useRef(null);

  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // 🔥 REEL MODAL STATE
  const [selectedReel, setSelectedReel] = useState(null);
  const [showReelModal, setShowReelModal] = useState(false);
  const [reelLoading, setReelLoading] = useState(false);

  // ================= FETCH LIKED COMMENTS =================
  useEffect(() => {
    if (userId) {
      fetchLikedComments();
    }
  }, [userId]);

  const fetchLikedComments = async () => {
    try {
      setLoading(true);

      const res = await api.get(
        `/api/comment/admin/users/${userId}/liked-comments`
      );

      const list = res.data.comments || [];
      setComments(list);
      setTotalItems(list.length);
    } catch (error) {
      console.error("Error fetching liked comments:", error);
      toast.error("Failed to load liked comments");
    } finally {
      setLoading(false);
    }
  };

  // ================= PAGINATION =================
  const totalPages = Math.max(1, Math.ceil(totalItems / LIMIT));
  const start = (page - 1) * LIMIT;
  const paginatedList = comments.slice(start, start + LIMIT);

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);
  };

  // ================= SCROLL ON PAGE CHANGE =================
  useEffect(() => {
    topRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [page]);

  // ================= VIEW REEL (NO NAVIGATE) =================
  const handleViewReel = async (reelId) => {
    try {
      setReelLoading(true);

      const res = await api.get(`/api/reels/admin_current/${reelId}`);

      setSelectedReel(res.data);
      setShowReelModal(true);
    } catch (err) {
      console.error(err);
      toast.error("Reel not available");
    } finally {
      setReelLoading(false);
    }
  };

  if (loading) {
    return <div className="spinner" />;
  }


  return (
   <div className="space-y-6 p-4 sm:p-6 bg-white min-h-screen" ref={topRef}>
      {/* Header */}
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 bg-gray-100 text-black rounded-lg hover:bg-gray-200 transition-colors"
        >
          <MdArrowBack className="text-xl" />
        </button>

        <h1 className="text-xl sm:text-2xl font-bold text-black">
          Liked Comments
        </h1>
      </div>

      {/* Comments */}
      {paginatedList.length === 0 ? (
        <div className="col-span-full w-full min-h-[60vh] flex flex-col items-center justify-center text-gray-500">
          <MdFavorite className="text-4xl mb-3 opacity-50" />
          <p className="text-sm">No Liked Comments</p>
        </div>
      ) : (
        <div className="space-y-4">
          {paginatedList.map((comment) => (
            <div
              key={comment._id}
              className="bg-white border border-gray-200 shadow-sm rounded-lg p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <MdFavorite className="text-red-500 shrink-0" />
                <span className="text-xs sm:text-sm text-gray-500">
                  {new Date(comment.createdAt).toLocaleString()}
                </span>
              </div>

              <p className="text-black text-sm sm:text-base break-words">{comment.text}</p>
              {comment.reel && (
                <div className="mt-3 space-y-1 bg-gray-50 p-2 rounded-md">
                  <p className="text-xs text-gray-500 truncate">
                    <span className="font-medium text-gray-700">On Reel:</span> {comment.reel.caption}
                  </p>

                  <button
                    onClick={() => handleViewReel(comment.reel._id)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                  >
                    View Reel
                  </button>
                </div>
              )}

              {comment.user && (
                <p className="text-xs text-gray-500 mt-2">
                  Comment by <span className="font-medium">@{comment.user.username}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}

    {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mt-6 pb-8">
          <button
            disabled={page <= 1}
            onClick={() => handlePageChange(page - 1)}
            className="px-3 sm:px-4 py-2 bg-gray-100 text-black text-sm sm:text-base rounded-lg disabled:opacity-30 hover:bg-gray-200 transition-all font-medium"
          >
            Previous
          </button>

          <span className="text-sm sm:text-base text-gray-600">
            Page <span className="text-black font-bold">{page}</span> of{" "}
            {totalPages}
          </span>

          <button
            disabled={page >= totalPages}
            onClick={() => handlePageChange(page + 1)}
            className="px-3 sm:px-4 py-2 bg-gray-100 text-black text-sm sm:text-base rounded-lg disabled:opacity-30 hover:bg-gray-200 transition-all font-medium"
          >
            Next
          </button>
        </div>
      )}
      {/* ================= REEL MODAL ================= */}
    {/* ================= REEL MODAL ================= */}
      {showReelModal && selectedReel && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-[360px] rounded-xl overflow-hidden shadow-2xl">
            {reelLoading ? (
              <div className="h-[420px] flex items-center justify-center">
                <div className="spinner" />
              </div>
            ) : (
              <>
                {/* VIDEO */}
                <video
                  src={selectedReel.videoUrl}
                  controls
                  autoPlay
                  className="w-full h-[420px] object-cover"
                />

                {/* INFO */}
                <div className="p-3 space-y-2">
                  <p className="text-black text-sm">
                    {selectedReel.caption}
                  </p>

                  <button
                    onClick={() => setShowReelModal(false)}
                    className="w-full py-2 bg-red-600 hover:bg-red-700 rounded text-white"
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

export default UserLikedComments;
