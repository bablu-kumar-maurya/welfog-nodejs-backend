import { useState, useEffect, useRef } from 'react';
import api from "../api/axios";

import {
  MdSearch,
  MdDelete,
  MdBlock,
  MdVisibility,
  MdThumbUp,
  MdComment,
  MdPlayArrow,
} from 'react-icons/md';
import toast from 'react-hot-toast';

const Reels = () => {
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedReel, setSelectedReel] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [playVideo, setPlayVideo] = useState(false);
  const videoRef = useRef(null);
  const userPausedRef = useRef(false);
  const videoRefs = useRef({});
  const [page, setPage] = useState(1);
  const [totalReels, setTotalReels] = useState(0);
  const limit = 12; // Number of reels per page
  const searchInputRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const topRef = useRef(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isUserPlaying, setIsUserPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const clickCountRef = useRef(0);
  const isFullscreenRef = useRef(false); // Ref for immediate fullscreen state checks
  const hoverEnabledRef = useRef(true); // Track if hover should be active
  const [confirmReel, setConfirmReel] = useState(null);
  const [confirmDeleteReel, setConfirmDeleteReel] = useState(null);


  // Track fullscreen state with both state and ref
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      isFullscreenRef.current = isCurrentlyFullscreen;
      setIsFullscreen(isCurrentlyFullscreen);

      // When exiting fullscreen, ensure hover can work again if user hasn't clicked
      if (!isCurrentlyFullscreen && !isUserPlaying) {
        hoverEnabledRef.current = true;
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, [isUserPlaying]);

  const togglePlay = (e) => {
    const video = videoRef.current;
    if (!video) return;

    // CRITICAL: Check fullscreen state via ref for immediate check
    if (isFullscreenRef.current) {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }

      if (e && e.target !== video && e.target.tagName !== 'VIDEO' && e.target.tagName !== 'IMG') {
        return;
      }

      if (video.paused) {
        userPausedRef.current = false;
        video.play().catch(() => { });
      } else {
        userPausedRef.current = true;
        video.pause();
      }
      return;
    }

    // NON-FULLSCREEN MODE
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    if (video.paused) {
      userPausedRef.current = false;
      video.muted = false;
      setIsMuted(false);
      setIsUserPlaying(true);
      hoverEnabledRef.current = false;
      clickCountRef.current = 1;
      setPlayVideo(false);
      video.play().catch(() => { });
    } else {
      userPausedRef.current = true;
      clickCountRef.current = 0;
      video.pause();
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    const delay = setTimeout(() => {
      fetchReels(page, searchTerm, statusFilter, signal);
    }, 100);

    return () => {
      clearTimeout(delay);
      controller.abort();
    };
  }, [page, searchTerm, statusFilter, startDate, endDate]);

  useEffect(() => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [page]);



  const fetchReels = async (pageNumber, search, status, signal) => {
    try {
      setLoading(true);
      const params = { page: pageNumber, limit, search, status, startDate, endDate };
    const res = await api.get("/api/reels/admin_reels", {
  params,
  signal,
});
      setReels(Array.isArray(res.data.data) ? res.data.data : []);
      setTotalReels(res.data.total || 0);
    } catch (err) {
    if (err.code === "ERR_CANCELED") return;
      toast.error("permission denied");
    } finally {
      setLoading(false);
    }
  };


  const handleStatusChange = async (reel) => {
    try {
      const action = reel.status === "Blocked" ? "unblock" : "block";
      
      await api.put(`/api/reels/admin_block/${reel._id}`, {
        action
      }, {
        
      });

      toast.success(
        action === "block"
          ? "Reel blocked successfully"
          : "Reel unblocked successfully"
      );

      fetchReels(page, searchTerm, statusFilter);
    } catch (error) {
      console.error("Block/unblock error:", error);
      toast.error("permission denied ");
    }
  };



  const openModal = (reel) => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      videoRef.current.muted = true;
    }
    setIsPlaying(false);
    setIsMuted(true);
    setPlayVideo(false);
    setIsUserPlaying(false);
    clickCountRef.current = 0;
    userPausedRef.current = false;
    hoverEnabledRef.current = true;
    setSelectedReel(reel);
    setShowModal(true);
  };

  const closeModal = () => {
    if (isFullscreenRef.current) {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      videoRef.current.muted = true;
    }
    setIsPlaying(false);
    setIsMuted(true);
    setPlayVideo(false);
    setIsUserPlaying(false);
    clickCountRef.current = 0;
    userPausedRef.current = false;
    hoverEnabledRef.current = true;
    isFullscreenRef.current = false;
    setIsFullscreen(false);
    setShowModal(false);
    setSelectedReel(null);
  };

  const handleDelete = async (reel) => {
    try {
      
      await api.delete(
        `/api/reels/admin_delete/${reel._id}/${reel.userid}`, {
      }
      );

      toast.success("Reel deleted successfully");

      setReels(prev => prev.filter(r => r._id !== reel._id));
      setTotalReels(prev => prev - 1);

    } catch (error) {
      console.error("Delete reel error:", error);
      toast.error(error.response?.data?.message || "permission denied");
    }
  };





  return (
    <div ref={topRef} className="space-y-6 animate-fadeIn bg-gray-50 p-6 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Reels</h1>
          <p className="text-gray-600">
            {/* Manage all video content ({totalReels}) */}
             Manage all video content 
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4 space-y-4">

        {/* 🔍 Search */}
        <div className="relative">
          <MdSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search by caption or username..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* 📅 Date Filter Added (Nothing Removed) */}
        <div className="flex gap-3 flex-wrap items-center">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          />

          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          />

          <button
            onClick={() => {
              setStartDate('');
              setEndDate('');
              setPage(1);
            }}
            className="text-xs font-bold text-red-500 hover:underline"
          >
            Reset
          </button>
        </div>

        {/* 🎛 Status Filter (Unchanged) */}
        <div className="flex gap-2 flex-wrap">
          {['all', 'Published', 'Processing', 'Blocked', 'Reported'].map(
            (status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${statusFilter === status
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            )
          )}
        </div>

      </div>

      {/* Reels Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {reels.length > 0 ? (
          reels.map((reel) => (
            <div
              key={reel._id}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 hover:scale-[1.02]"
            >
              {/* Thumbnail with hover play */}
              <div
                className="relative aspect-[9/10] bg-gray-200 overflow-hidden"
                onMouseEnter={() => {
                  setPlayVideo(reel._id);
                  videoRefs.current[reel._id]?.play();
                }}
                onMouseLeave={() => {
                  setPlayVideo(null);
                  const video = videoRefs.current[reel._id];
                  if (video) {
                    video.pause();
                    video.currentTime = 0;
                  }
                }}
              >
                {/* Video */}
                <video
                  ref={(el) => (videoRefs.current[reel._id] = el)}
                  src={reel.videoUrl}
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${playVideo === reel._id ? "opacity-100" : "opacity-0"
                    }`}
                  muted
                  loop
                  playsInline
                  preload="auto"
                />

                {/* Thumbnail */}
                {reel.thumbnailUrl && (
                  <img
                    src={reel.thumbnailUrl}
                    alt={reel.caption}
                    className={`w-full h-full object-cover transition-opacity duration-300 ${playVideo === reel._id ? "opacity-0" : "opacity-100"
                      }`}
                  />
                )}

                {/* Status badge */}
                <div className="absolute top-2 right-2 z-10">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${reel.status === "Published"
                      ? "bg-green-100 text-green-700 border border-green-200"
                      : reel.status === "Processing"
                        ? "bg-yellow-100 text-yellow-700 border border-yellow-200"
                        : "bg-red-100 text-red-700 border border-red-200"
                      }`}
                  >
                    {reel.status}
                  </span>
                </div>
              </div>

              {/* Content */}
              <div className="p-4 space-y-3">
                <p className="text-gray-900 font-medium line-clamp-2">
                  {reel.caption || "No caption"}
                </p>
                <p className="text-gray-500 text-sm">@{reel.username}</p>

                {/* Stats */}
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <div className="flex items-center gap-1">
                    <MdVisibility />
                    <span>{reel.views?.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MdThumbUp />
                    <span>{reel.likes?.length?.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MdComment />
                    <span>{reel.comments?.length?.toLocaleString() || 0}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => openModal(reel)}
                    className="flex-1 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded-lg transition-colors"
                  >
                    View
                  </button>

                  <button
                    onClick={() => setConfirmReel(reel)}
                    className={`p-2 rounded-lg transition-colors ${reel.status === "Blocked"
                      ? "bg-green-600 hover:bg-green-700 text-white"
                      : "bg-yellow-500 hover:bg-yellow-600 text-white"
                      }`}
                  >
                    <MdBlock />
                  </button>

                  <button
                    onClick={() => setConfirmDeleteReel(reel)}
                    className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                  >
                    <MdDelete />
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          !loading && (
            <div className="col-span-full min-h-[60vh] flex flex-col items-center justify-center text-gray-400">
              <MdVisibility className="text-5xl mb-4 opacity-40" />
              <p className="text-sm">No reels found</p>
            </div>
          )
        )}
      </div>


      {/* Reel Details Modal */}
      {showModal && selectedReel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div
            className="
        bg-white border border-gray-200 rounded-2xl shadow-2xl
        w-[780px] max-w-full
        h-[520px]
        flex flex-col overflow-hidden
      "
          >
            {/* HEADER */}
            <div className="p-4 border-b border-gray-100 shrink-0">
              <h2 className="text-xl font-bold text-gray-900">Reel Details</h2>
            </div>

            {/* BODY */}
            <div className="flex-1 p-4 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">

                {/* ================= VIDEO PREVIEW ================= */}
                <div
                  className="w-full h-full bg-black rounded-xl overflow-hidden relative shadow-inner"
                  onMouseEnter={(e) => {
                    if (
                      hoverEnabledRef.current &&
                      !isFullscreenRef.current &&
                      !isUserPlaying &&
                      videoRef.current
                    ) {
                      setPlayVideo(true);
                      videoRef.current.muted = true;
                      videoRef.current.play().catch(() => { });
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (
                      hoverEnabledRef.current &&
                      !isFullscreenRef.current &&
                      !isUserPlaying &&
                      videoRef.current
                    ) {
                      setPlayVideo(false);
                      videoRef.current.pause();
                      videoRef.current.currentTime = 0;
                    }
                  }}
                >
                  {/* THUMBNAIL - Visible only if user hasn't started playing and not hovering */}
                  {selectedReel.thumbnailUrl && (
                    <img
                      src={selectedReel.thumbnailUrl}
                      alt="thumbnail"
                      className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${(playVideo || isUserPlaying) ? "opacity-0" : "opacity-100"
                        }`}
                      onClick={togglePlay}
                    />
                  )}

                  {/* VIDEO - Corrected opacity logic to prevent black screen */}
                  <video
                    ref={videoRef}
                    src={selectedReel.videoUrl}
                    className={`absolute inset-0 w-full h-full object-cover ${(playVideo || isUserPlaying) ? "opacity-100" : "opacity-0"}`}
                    muted={!isUserPlaying}
                    playsInline
                    loop
                    controls={isFullscreen}
                    onClick={togglePlay}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => {
                      setIsPlaying(false);
                      if (isFullscreenRef.current && videoRef.current?.paused) {
                        userPausedRef.current = true;
                      }
                    }}
                    onEnded={() => {
                      if (!userPausedRef.current && !isFullscreenRef.current && videoRef.current) {
                        videoRef.current.currentTime = 0;
                        videoRef.current.play();
                      }
                    }}
                  />

                  {/* PLAY ICON */}
                  {!isPlaying && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                      <MdPlayArrow className="text-white text-6xl drop-shadow-lg" />
                    </div>
                  )}

                  {/* CONTROLS */}
                  {isUserPlaying && !isFullscreen && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3 flex items-center justify-between">
                      <button onClick={togglePlay} className="text-white text-xl">
                        {isPlaying ? "⏸" : "▶"}
                      </button>
                      <button
                        onClick={() => {
                          const muted = !isMuted;
                          setIsMuted(muted);
                          if (videoRef.current) videoRef.current.muted = muted;
                        }}
                        className="text-white text-xl"
                      >
                        {isMuted ? "🔇" : "🔊"}
                      </button>
                      <button
                        onClick={() => {
                          const v = videoRef.current;
                          if (v) {
                            if (v.requestFullscreen) v.requestFullscreen();
                            else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
                          }
                        }}
                        className="text-white text-xl"
                      >
                        ⛶
                      </button>
                    </div>
                  )}
                </div>

                {/* ================= DETAILS ================= */}
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="text-gray-500 font-medium">Caption</p>
                    <p className="text-gray-900 line-clamp-3">
                      {selectedReel.caption || "No caption"}
                    </p>
                  </div>

                  <div>
                    <p className="text-gray-500 font-medium">Creator</p>
                    <p className="text-primary-600 font-semibold">@{selectedReel.username}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <div>
                      <p className="text-gray-500">Views</p>
                      <p className="text-gray-900 font-bold">
                        {selectedReel.views?.toLocaleString() || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Likes</p>
                      <p className="text-gray-900 font-bold">
                        {selectedReel.likes?.length?.toLocaleString() || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Comments</p>
                      <p className="text-gray-900 font-bold">
                        {selectedReel.comments?.length?.toLocaleString() || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Status</p>
                      <p className="text-gray-900 font-bold">{selectedReel.status}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-gray-500">Created At</p>
                    <p className="text-gray-700">
                      {new Date(selectedReel.createdAt).toLocaleString()}
                    </p>
                  </div>

                  {selectedReel.videoUrl && (
                    <div>
                      <p className="text-gray-500">Video Link</p>
                      <a
                        href={selectedReel.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:underline text-xs break-all italic"
                      >
                        {selectedReel.videoUrl}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* FOOTER */}
            <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 shrink-0">
              <button
                onClick={() => setConfirmReel(selectedReel)}
                className={`px-5 py-2 rounded-lg text-white font-medium shadow-sm transition-colors ${selectedReel.status === "Blocked"
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-yellow-500 hover:bg-yellow-600"
                  }`}
              >
                {selectedReel.status === "Blocked" ? "Unblock Reel" : "Block Reel"}
              </button>

              <button
                onClick={closeModal}
                className="px-5 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}


      <div className="flex justify-center items-center gap-6 mt-6">
        <button
          onClick={() => page > 1 && setPage(p => p - 1)}
          disabled={page === 1}
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg shadow-sm disabled:opacity-40 hover:bg-gray-50 transition-colors"
        >
          &lt; Previous
        </button>

        <span className="text-gray-700 font-medium">
          Page {page} of {Math.ceil(totalReels / limit)}
        </span>

        <button
          onClick={() => page < Math.ceil(totalReels / limit) && setPage(p => p + 1)}
          disabled={page >= Math.ceil(totalReels / limit)}
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg shadow-sm disabled:opacity-40 hover:bg-gray-50 transition-colors"
        >
          Next &gt;
        </button>
      </div>

      {confirmReel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-3">
          <div className="bg-white border border-gray-200 rounded-xl p-6 w-[360px] max-w-full shadow-2xl">
            <h3 className="text-gray-900 text-lg font-bold mb-2">
              {confirmReel.status === "Blocked"
                ? "Unblock Reel?"
                : "Block Reel?"}
            </h3>
            <p className="text-gray-600 text-sm mb-6">
              {confirmReel.status === "Blocked"
                ? "This reel will be visible to users again."
                : "This reel will be hidden from user feed."}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmReel(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleStatusChange(confirmReel);
                  setConfirmReel(null);
                }}
                className={`px-4 py-2 text-white rounded-lg font-medium transition-colors ${confirmReel.status === "Blocked"
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-red-600 hover:bg-red-700"
                  }`}
              >
                Confirm Action
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteReel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-3">
          <div className="bg-white border border-gray-200 rounded-xl p-6 w-[360px] max-w-full shadow-2xl">
            <h3 className="text-gray-900 text-lg font-bold mb-2">
              Delete Reel?
            </h3>
            <p className="text-gray-600 text-sm mb-6">
              This action is permanent. This reel will be deleted forever from the database.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteReel(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleDelete(confirmDeleteReel);
                  setConfirmDeleteReel(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reels;