import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api/axios";
import {
  MdDelete,
  MdMusicNote,
  MdPlayArrow,
  MdArrowBack,
} from "react-icons/md";
import toast from "react-hot-toast";

const LIMIT = 8;

const UserMusicUploads = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const topRef = useRef(null);
  const isFirstLoad = useRef(true); // 🔥 KEY

  const [music, setMusic] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);

  const [selectedTrack, setSelectedTrack] = useState(null);
  const [confirmTrack, setConfirmTrack] = useState(null);

  useEffect(() => {
    fetchMusic();
  }, [page, userId]);

  // ✅ FIX: page change ke BAAD scroll hoga
  useEffect(() => {
    if (!isFirstLoad.current) {
      topRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [page]);

  const fetchMusic = async () => {
    try {
      if (isFirstLoad.current) {
        setLoading(true);
      }

      const res = await api.get(
        `/api/reels/users/${userId}/music?page=${page}&limit=${LIMIT}`);

      setMusic(res.data.music || []);
      setPagination(res.data.pagination);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load music");
    } finally {
      setLoading(false);
      isFirstLoad.current = false;
    }
  };

  const handleDelete = async (track) => {
    try {

      const res = await api.delete(`/api/music/delete/${track._id}`);
      if (res.data?.success) {
        toast.success("Music deleted");
        setMusic((prev) =>
          prev.filter((item) => item._id !== track._id)
        );
      }
    } catch (error) {
      toast.error("Delete failed");
    }
  };

  return (
  <div ref={topRef} className="space-y-6 animate-fadeIn bg-white min-h-screen p-4 sm:p-6">

      {/* Header */}
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <MdArrowBack className="text-black text-xl" />
        </button>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-black">
          User Music Uploads
        </h1>
      </div>

      {music.length === 0 && !loading && (
        <div className="col-span-full w-full min-h-[60vh] flex flex-col items-center justify-center text-gray-400">
          <MdMusicNote className="text-4xl mb-3 opacity-60" />
          <p className="text-sm">Music not found</p>
        </div>
      )}

      {/* GRID */}
      <div className="relative min-h-[600px]">
        <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {music.map((track) => (
            <div
              key={track._id}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition shadow-sm"
            >
              <div className="relative aspect-square bg-gray-100">
                {track.thumbnail ? (
                  <img
                    src={track.thumbnail}
                    alt={track.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <MdMusicNote className="text-6xl text-gray-300" />
                  </div>
                )}
              </div>

              <div className="p-4 space-y-3">
                <h3 className="text-black font-semibold line-clamp-1">
                  {track.title}
                </h3>
                <p className="text-gray-500 text-sm line-clamp-1">
                  {track.artist}
                </p>

                {track.duration && (
                  <p className="text-gray-400 text-sm">
                    Duration: {Math.floor(track.duration / 60)}:
                    {String(track.duration % 60).padStart(2, "0")}
                  </p>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setSelectedTrack(track)}
                    className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg flex items-center justify-center gap-2 transition"
                  >
                    <MdPlayArrow /> View
                  </button>

                  <button
                    onClick={() => setConfirmTrack(track)}
                    className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
                  >
                    <MdDelete />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {loading && isFirstLoad.current && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm">
            <div className="spinner"></div>
          </div>
        )}
      </div>

      {/* Pagination */}
  
      {pagination && pagination.totalPages > 1 && (
        <div className="flex flex-wrap justify-center gap-3 sm:gap-4 mt-6 pb-8 items-center">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 sm:px-4 py-2 bg-gray-100 text-black text-sm sm:text-base border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-200 transition font-medium"
          >
            &lt; Previous
          </button>

          <span className="text-gray-700 text-sm sm:text-base font-medium">
            Page {pagination.currentPage} of {pagination.totalPages}
          </span>

          <button
            disabled={page === pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 sm:px-4 py-2 bg-gray-100 text-black text-sm sm:text-base border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-200 transition font-medium"
          >
            Next &gt;
          </button>
        </div>
      )}

     {/* View Modal */}
      {selectedTrack && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 shadow-2xl rounded-xl w-full max-w-[420px] p-4 sm:p-6">
            <h3 className="text-black font-bold text-lg mb-2 truncate">{selectedTrack.title}</h3>
            <audio
              controls
              autoPlay
              src={selectedTrack.url}
              className="w-full mt-3"
            />
            <div className="flex justify-center mt-6">
              <button
                onClick={() => setSelectedTrack(null)}
                className="px-8 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {confirmTrack && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 shadow-2xl rounded-xl p-4 sm:p-6 w-full max-w-[320px]">
            <p className="text-black font-medium mb-6 text-sm sm:text-base">
              This music will be permanently deleted. Are you sure?
            </p>
            <div className="flex justify-end gap-2 sm:gap-3">
              <button
                onClick={() => setConfirmTrack(null)}
                className="px-3 sm:px-4 py-2 bg-gray-100 text-black hover:bg-gray-200 rounded-lg transition font-medium text-sm sm:text-base"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleDelete(confirmTrack);
                  setConfirmTrack(null);
                }}
                className="px-3 sm:px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition font-medium text-sm sm:text-base"
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

export default UserMusicUploads;