import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api/axios";
import { MdArrowBack, MdComment } from "react-icons/md";
import toast from "react-hot-toast";
const UserComments = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const topRef = useRef(null);

  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);

  // input values (user typing)
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // applied filter values (only change when Apply clicked)
  const [appliedStartDate, setAppliedStartDate] = useState("");
  const [appliedEndDate, setAppliedEndDate] = useState("");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [selectedReel, setSelectedReel] = useState(null);
  const [showReelModal, setShowReelModal] = useState(false);
  const [reelLoading, setReelLoading] = useState(false);

  // reset page when user changes
  useEffect(() => {
    setPage(1);
  }, [userId, appliedStartDate, appliedEndDate]);

  // fetch only when applied filter changes
  useEffect(() => {
    if (userId) fetchComments();
  }, [userId, page, appliedStartDate, appliedEndDate]);

  const fetchComments = async () => {
    try {
      if (page === 1 && comments.length === 0) {
        setLoading(true);
      }
      

      const res = await api.get(
        `/api/comment/user/${userId}`,
        {
          params: {
            page,
            startDate: appliedStartDate || undefined,
            endDate: appliedEndDate || undefined
          },
        }
      );

      setComments(res.data.comments || []);
      setTotalPages(res.data.totalPages || 1);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load comments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    topRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [page]);

  const handleViewReel = async (reelId) => {
    try {
      setReelLoading(true);
  
      const res = await api.get(`/api/reels/admin_current/${reelId}` , {
       
      });
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
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <div className="spinner" />
      </div>
    );
  }

  return (
<div className="space-y-6 p-4 sm:p-6 bg-white min-h-screen" ref={topRef}>
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <MdArrowBack className="text-black text-xl" />
        </button>
        <h1 className="text-xl sm:text-2xl font-bold text-black">
          User Comments
        </h1>
      </div>

  {/* DATE FILTER */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-start sm:items-end bg-gray-50 p-4 rounded-lg">
        <div className="flex flex-col w-full sm:w-auto sm:flex-1 md:flex-none">
          <label className="text-xs text-gray-500 mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border px-3 py-2 rounded-lg w-full"
          />
        </div>

        <div className="flex flex-col w-full sm:w-auto sm:flex-1 md:flex-none">
          <label className="text-xs text-gray-500 mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border px-3 py-2 rounded-lg w-full"
          />
        </div>

        {/* BUTTONS */}
        <div className="flex flex-col min-[480px]:flex-row gap-2 w-full md:w-auto mt-2 sm:mt-0">
          <button
            onClick={() => {
              setAppliedStartDate(startDate);
              setAppliedEndDate(endDate);
              setPage(1);
            }}
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 w-full min-[480px]:w-auto transition-colors"
          >
            Apply Filter
          </button>

          <button
            onClick={() => {
              setStartDate("");
              setEndDate("");
              setAppliedStartDate("");
              setAppliedEndDate("");
              setPage(1);
            }}
            className="px-4 py-2 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 w-full min-[480px]:w-auto transition-colors"
          >
            Clear Filter
          </button>
        </div>
      </div>

      {/* COMMENTS */}
      {comments.length === 0 ? (
        <div className="col-span-full w-full min-h-[60vh] flex flex-col items-center justify-center text-gray-500">
          <MdComment className="text-4xl mb-3 opacity-50" />
          <p className="text-sm">No comments found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <div
              key={comment._id}
              className="bg-white border border-gray-200 rounded-lg p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <MdComment className="text-yellow-500" />
                <span className="text-sm text-gray-500">
                  {new Date(comment.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-black">{comment.text}</p>
              {comment.reelId && (
                <button
                  onClick={() => handleViewReel(comment.reelId)}
                  className="mt-2 text-xs text-blue-600 hover:underline"
                >
                  View Reel
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* PAGINATION */}
   {/* PAGINATION */}
      {comments.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mt-6 pb-8">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 sm:px-4 py-2 bg-gray-100 hover:bg-gray-200 text-black text-sm sm:text-base rounded-lg disabled:opacity-50 transition-colors"
          >
            Previous
          </button>

          <span className="text-black text-sm sm:text-base font-medium">
            Page {page} of {totalPages}
          </span>

          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 sm:px-4 py-2 bg-gray-100 hover:bg-gray-200 text-black text-sm sm:text-base rounded-lg disabled:opacity-50 transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* REEL MODAL */}
      {showReelModal && selectedReel && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
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

export default UserComments;