
import { useState, useEffect, useMemo, useRef } from 'react';
import api from "../api/axios";
import { MdSearch, MdDelete, MdMusicNote, MdPlayArrow } from 'react-icons/md';
import toast from 'react-hot-toast';
const Music = () => {
  const [musicTracks, setMusicTracks] = useState([]);
  const [filteredTracks, setFilteredTracks] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [confirmTrack, setConfirmTrack] = useState(null);

  const LIMIT = 12;
  const topRef = useRef(null);

  const [filters, setFilters] = useState({
    search: "",
    startDate: "",
    endDate: ""
  });

  useEffect(() => {
    fetchMusic();

    if (topRef.current) {
      topRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }

  }, [page, filters]);

  const fetchMusic = async () => {
    try {
      setLoading(true);

      const { search, startDate, endDate } = filters;
    
      const res = await api.get(`/api/music/admin-view`, {
        params: {
          page,
          limit: LIMIT,
          search,
          startDate,
          endDate
        },

      });

      const tracks = Array.isArray(res.data?.data) ? res.data.data : [];

      setMusicTracks(tracks);
      setFilteredTracks(tracks);
      setTotalPages(res.data.totalPages || 1);

    } catch (error) {
      console.error('Failed to fetch music:', error);
      toast.error(error.response?.data?.message || 'Failed to fetch music');
      setMusicTracks([]);
      setFilteredTracks([]);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (track) => {
    try {
     
      await api.delete(`/api/music/delete/${track._id}`, {
      }

      );

      toast.success('Music track deleted successfully');

      setFilteredTracks((prev) =>
        prev.filter((item) => item._id !== track._id)
      );

      setMusicTracks((prev) =>
        prev.filter((item) => item._id !== track._id)
      );
    } catch (error) {
      console.error('Error deleting music:', error);
      toast.error('Permission denied');
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

  const openModal = (track) => {
    setSelectedTrack(track);
    setShowModal(true);
  };

  const closeModal = () => {
    setSelectedTrack(null);
    setShowModal(false);
  };

  const goToPreviousPage = () => {
    if (page > 1) setPage((prev) => prev - 1);
  };

  const goToNextPage = () => {
    if (page < totalPages) setPage((prev) => prev + 1);
  };

  return (
    <div
      ref={topRef}
      className="space-y-6 animate-fadeIn bg-white text-gray-900 p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Music
          </h1>
          <p className="text-gray-500">
            Manage all music tracks
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="relative">
          <MdSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl" />
          <input
            type="text"
            placeholder="Search by title or artist..."
            name="search"
            value={filters.search}
            onChange={handleFilterChange}
            className="w-full pl-12 pr-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex gap-3 flex-wrap mt-3">

        <input
          type="date"
          name="startDate"
          value={filters.startDate}
          onChange={handleFilterChange}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />

        <input
          type="date"
          name="endDate"
          value={filters.endDate}
          onChange={handleFilterChange}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />

        <button
          onClick={() => {
            setFilters({
              search: "",
              startDate: "",
              endDate: ""
            });
            setPage(1);
          }}
          className="text-xs font-bold text-red-500"
        >
          Reset
        </button>

      </div>

      {/* Music Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredTracks.map((track) => (
          <div
            key={track._id}
            className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300 hover:scale-105"
          >
            {/* Thumbnail */}
            <div className="relative aspect-square bg-gray-100">
              {track.thumbnail ? (
                <img
                  src={track.thumbnail}
                  alt={track.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <MdMusicNote className="text-6xl text-gray-400" />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
              <div>
                <h3 className="text-gray-900 font-medium line-clamp-1">
                  {track.title || 'Unknown Title'}
                </h3>
                <p className="text-gray-500 text-sm line-clamp-1">
                  {track.artist || 'Unknown Artist'}
                </p>
              </div>

              {track.duration && (
                <p className="text-gray-600 text-sm">
                  Duration: {Math.floor(track.duration / 60)}:
                  {String(track.duration % 60).padStart(2, '0')}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => openModal(track)}
                  className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <MdPlayArrow /> <span>View</span>
                </button>
                <button
                  onClick={() => setConfirmTrack(track)}
                  className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                  title="Delete"
                >
                  <MdDelete />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex justify-center gap-4 mt-6">
        <button
          onClick={goToPreviousPage}
          disabled={page === 1}
          className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg disabled:opacity-50"
        >
          &lt; Previous
        </button>

        <span className="text-gray-800">
          Page {page} of {totalPages}
        </span>

        <button
          onClick={goToNextPage}
          disabled={page === totalPages}
          className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg disabled:opacity-50"
        >
          Next &gt;
        </button>
      </div>

      {/* Music Details Modal */}
      {showModal && selectedTrack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white border border-gray-200 rounded-xl w-[450px] h-[450px] p-4 flex flex-col">
            <div className="flex-shrink-0 text-center border-b border-gray-200 pb-2 mb-2">
              <h2 className="text-gray-900 text-2xl font-bold">
                Music Details
              </h2>
            </div>

            <div className="w-full mb-3 flex items-center justify-center">
              {selectedTrack.thumbnail ? (
                <img
                  src={selectedTrack.thumbnail}
                  alt={selectedTrack.title}
                  className="h-[180px] w-auto max-w-full object-stretch rounded-lg"
                />
              ) : (
                <MdMusicNote className="text-6xl text-gray-400" />
              )}
            </div>

            <div className="flex-1 flex flex-col justify-between">
              <div className="text-gray-900 text-sm space-y-1">
                <p>
                  <span className="text-gray-500 font-medium">Title:</span>{' '}
                  {selectedTrack.title || 'Unknown'}
                </p>
                <p>
                  <span className="text-gray-500 font-medium">Artist:</span>{' '}
                  {selectedTrack.artist || 'Unknown'}
                </p>
                {selectedTrack.duration && (
                  <p>
                    <span className="text-gray-500 font-medium">
                      Duration:
                    </span>{' '}
                    {Math.floor(selectedTrack.duration / 60)}:
                    {String(selectedTrack.duration % 60).padStart(2, '0')}
                  </p>
                )}
                <p>
                  <span className="text-gray-500 font-medium">
                    Created:
                  </span>{' '}
                  {new Date(selectedTrack.createdAt).toLocaleString()}
                </p>
              </div>

              {selectedTrack.url && (
                <audio controls className="w-full mt-2 h-10">
                  <source
                    src={selectedTrack.url}
                    type="audio/mpeg"
                  />
                  Your browser does not support the audio element.
                </audio>
              )}
            </div>

            <div className="flex-shrink-0 mt-2 flex justify-center">
              <button
                onClick={closeModal}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmTrack && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-3">
          <div className="bg-white border border-gray-200 rounded-lg p-5 w-[320px] max-w-full">
            <h3 className="text-gray-900 text-lg font-semibold mb-2">
              Delete Music?
            </h3>

            <p className="text-gray-600 text-sm mb-4">
              This music track will be permanently deleted. This action
              cannot be undone.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmTrack(null)}
                className="px-4 py-2 bg-gray-100 text-gray-800 rounded"
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  handleDelete(confirmTrack);
                  setConfirmTrack(null);
                }}
                className="px-4 py-2 text-white rounded bg-red-600 hover:bg-red-700"
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

export default Music;

