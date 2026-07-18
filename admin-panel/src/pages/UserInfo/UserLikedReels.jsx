import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api/axios";
import {
  MdArrowBack,
  MdPlayArrow,
  MdVisibility,
  MdThumbUp,
  MdComment,
  MdVideoLibrary,
} from "react-icons/md";
import toast from "react-hot-toast";

const UserLikedReels = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  
  // Ref for jumping to the top of the content
  const topOfListRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [reels, setReels] = useState([]);
  const [activeVideoId, setActiveVideoId] = useState(null);
  const [confirmBlockReel, setConfirmBlockReel] = useState(null);
  const [confirmDeleteReel, setConfirmDeleteReel] = useState(null);
  const LIMIT = 10;
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [slideDirection, setSlideDirection] = useState(1); // 1 = next (up), -1 = prev (down)

  // ================= JUMP LOGIC (smooth, no blink) =================
  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    setSlideDirection(newPage > page ? 1 : -1);
    setPage(newPage);
    if (topOfListRef.current) {
      topOfListRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // ================= FETCH LIKED REELS =================
  useEffect(() => {
    if (userId) fetchLikedReels(page);
    // eslint-disable-next-line
  }, [userId, page]);

  const fetchLikedReels = async (pageNo) => {
    try {
      // Only show loading overlay on first page load to prevent blinking on page change
      setLoading(pageNo === 1);
      
      const res = await api.get(
        `/api/reels/admin/users/${userId}/liked-reels`,
        {
          params: {
            page: pageNo,
            limit: LIMIT,
          },
        } , 
        
      );

      const total = res.data.totalPages ?? 1;
      setReels(res.data.reels || []);
      setTotalPages(total);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load liked reels");
    } finally {
      setLoading(false);
    }
  };

  // ================= VIDEO CONTROLS =================
  const handleMouseEnter = (video, reelId) => {
    if (!video) return;
    if (activeVideoId !== reelId) {
      video.currentTime = 0;
      video.muted = true;
      video.play().catch(() => {});
    }
  };

  const handleMouseLeave = (video, reelId) => {
    if (!video) return;
    if (activeVideoId !== reelId) {
      video.pause();
      video.currentTime = 0;
    }
  };

  const handleClickActivate = (video, reelId) => {
    if (!video || activeVideoId === reelId) return;
    setActiveVideoId(reelId);
    video.muted = false;
    video.controls = true;
    video.play().catch(() => {});
  };

  // ================= ADMIN ACTIONS =================
  const handleBlockReel = async (reel) => {
    try {
       
      const action = reel.status === "Blocked" ? "unblock" : "block";
      await api.put(`/api/reels/admin_block/${reel._id}`, {
        action,
        reason: action === "block" ? "Admin blocked this reel" : null,
      });

      toast.success(action === "block" ? "Reel blocked" : "Reel unblocked");

      setReels((prev) =>
        prev.map((r) =>
          r._id === reel._id
            ? { ...r, status: action === "block" ? "Blocked" : "Published" }
            : r
        )
      );
    } catch {
      toast.error("Failed to update status");
    }
  };

 const handleDeleteReel = async (reel) => {
  try {

    await api.delete(
      `/api/reels/admin_delete/${reel._id}/${reel.userid}`);

    toast.success("Reel deleted");

    setReels((prev) => prev.filter((r) => r._id !== reel._id));
  } catch (err) {
    console.error(err);
    toast.error("Failed to delete reel");
  }
};


  // ================= UI =================
  return (
    <div className="space-y-6 relative min-h-screen bg-white p-6">
      {/* Scroll Target */}
      <div ref={topOfListRef} className="absolute -top-10" />

      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors border border-gray-200"
        >
          <MdArrowBack className="text-black text-xl" />
        </button>
        <h1 className="text-2xl font-bold text-black">Liked Reels</h1>
      </div>

      {/* GRID CONTAINER: overlay only on initial load; smooth slide on page change */}
      <div className="relative min-h-[200px]">
        {loading && reels.length === 0 && (
          <div className="absolute inset-0 z-20 flex items-start justify-center bg-white/60 backdrop-blur-[1px] pt-20">
            <div className="spinner" />
          </div>
        )}

       <div
          key={page}
          className={`grid grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6 ${
            slideDirection === 1 ? "animate-slideUp" : "animate-slideDown"
          }`}
        >
          {reels.length > 0 ? (
            reels.map((reel) => (
              <div
                key={reel._id}
                className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition flex flex-col h-full overflow-hidden"
              >
                {/* VIDEO AREA */}
                <div className="relative aspect-[9/10] bg-black">
                  {activeVideoId !== reel._id && reel.thumbnailUrl && (
                    <img
                      src={reel.thumbnailUrl}
                      alt="thumbnail"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}

                  <video
                    src={reel.videoUrl}
                    preload="none"
                    playsInline
                    muted={activeVideoId !== reel._id}
                    controls={activeVideoId === reel._id}
                    className="absolute inset-0 w-full h-full object-cover"
                    onMouseEnter={(e) => handleMouseEnter(e.currentTarget, reel._id)}
                    onMouseLeave={(e) => handleMouseLeave(e.currentTarget, reel._id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClickActivate(e.currentTarget, reel._id);
                    }}
                  />

                  {activeVideoId !== reel._id && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="bg-black/40 p-3 rounded-full">
                        <MdPlayArrow className="text-white text-4xl" />
                      </div>
                    </div>
                  )}
                </div>

                {/* DETAILS AREA */}
                <div className="px-3 py-3 bg-white border-t border-gray-100 flex flex-col justify-between flex-grow space-y-3">
                  <p className="text-sm text-black truncate font-semibold">
                    {reel.caption || "No caption"}
                  </p>

                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <MdVisibility /> <span>{reel.views || 0}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MdThumbUp /> <span>{Array.isArray(reel.likes) ? reel.likes.length : reel.likes || 0}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MdComment /> <span>{Array.isArray(reel.comments) ? reel.comments.length : reel.comments || 0}</span>
                    </div>
                  </div>

                  {/* BUTTONS */}
                  <div className="flex flex-col min-[480px]:flex-row min-[480px]:items-center justify-between gap-3 pt-1">
                    <span className={`text-[10px] sm:text-xs font-bold uppercase shrink-0 ${reel.status === "Blocked" ? "text-red-500" : "text-green-600"}`}>
                      {reel.status || "Active"}
                    </span>
                    <div className="flex gap-2 w-full min-[480px]:w-auto">
                      <button
                        onClick={() => setConfirmBlockReel(reel)}
                        className="flex-1 min-[480px]:flex-none px-2 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[10px] sm:text-xs rounded-md font-medium text-center transition-colors"
                      >
                        {reel.status === "Blocked" ? "Unblock" : "Block"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteReel(reel)}
                        className="flex-1 min-[480px]:flex-none px-2 py-1.5 bg-white border border-gray-300 text-black text-[10px] sm:text-xs rounded-md hover:bg-gray-50 font-medium text-center transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
         ) : (
  !loading && (
    <div className="col-span-full flex flex-col items-center justify-center py-20">
      <div className="bg-gray-100 p-6 rounded-full mb-4">
        <MdVideoLibrary className="text-6xl text-gray-400" />
      </div>

      <h3 className="text-xl font-bold text-gray-800 mb-2">
        No Liked Reels Found
      </h3>
      <p className="text-gray-500 text-center max-w-sm">
        This user has not liked any reels yet.
      </p>
    </div>
  )
)}
        </div>
      </div>

      {/* PAGINATION */}
      {totalPages > 1 && (
       <div className="flex flex-wrap items-center justify-center gap-4 mt-8 pb-10">
          <button
            disabled={page <= 1}
            onClick={() => handlePageChange(page - 1)}
            className="px-4 py-2 bg-gray-100 text-black rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-200 transition-all font-medium"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page <span className="text-black font-bold">{page}</span> of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => handlePageChange(page + 1)}
            className="px-4 py-2 bg-gray-100 text-black rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-200 transition-all font-medium"
          >
            Next
          </button>
        </div>
      )}

      {/* MODALS */}
      {confirmBlockReel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
          <div className="bg-white border border-gray-200 rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-black text-lg font-bold mb-2">
              {confirmBlockReel.status === "Blocked" ? "Unblock" : "Block"} Reel?
            </h3>
            <p className="text-gray-600 text-sm mb-6">Are you sure you want to change the status of this reel?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmBlockReel(null)} className="px-4 py-2 text-black bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">Cancel</button>
              <button 
                onClick={() => { handleBlockReel(confirmBlockReel); setConfirmBlockReel(null); }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 shadow-md"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteReel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
          <div className="bg-white border border-gray-200 rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-black text-lg font-bold mb-2">Delete Reel?</h3>
            <p className="text-gray-600 text-sm mb-6">Warning: This action is permanent and cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDeleteReel(null)} className="px-4 py-2 text-black bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">Cancel</button>
              <button 
                onClick={() => { handleDeleteReel(confirmDeleteReel); setConfirmDeleteReel(null); }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 shadow-md"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserLikedReels;