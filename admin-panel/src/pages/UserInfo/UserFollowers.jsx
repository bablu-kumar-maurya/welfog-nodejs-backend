import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api/axios";
import { MdArrowBack, MdPerson } from "react-icons/md";

const LIMIT = 10;

const UserFollowers = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const topRef = useRef(null);

  const [followers, setFollowers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [appliedStartDate, setAppliedStartDate] = useState("");
  const [appliedEndDate, setAppliedEndDate] = useState("");

  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  useEffect(() => {
    if (userId) {
      fetchFollowers();
    }
  }, [userId, appliedStartDate, appliedEndDate]);

  const fetchFollowers = async () => {
    try {
      setLoading(true);
  
      const res = await api.get(`/api/users/${userId}/followers`, {
        params: {
          startDate: appliedStartDate || undefined,
          endDate: appliedEndDate || undefined
        },
      });
console.log("API Response:", res.data);
      // ✅ REMOVE NULL VALUES (VERY IMPORTANT)
      const list = (res.data.followers || []).filter(f => f !== null);

      setFollowers(list);
      setTotalItems(list.length);
      setPage(1);

    } catch (error) {
      console.error("Error fetching followers:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalItems / LIMIT));
  const start = (page - 1) * LIMIT;
  const paginatedList = followers.slice(start, start + LIMIT);

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);

    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (loading) {
    return <div className="spinner" />;
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
          User Followers
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
            className="border px-3 py-2 rounded-lg w-full bg-white"
          />
        </div>

        <div className="flex flex-col w-full sm:w-auto sm:flex-1 md:flex-none">
          <label className="text-xs text-gray-500 mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border px-3 py-2 rounded-lg w-full bg-white"
          />
        </div>

        {/* BUTTONS */}
        <div className="flex flex-col min-[480px]:flex-row gap-2 w-full md:w-auto mt-2 sm:mt-0">
          <button
            onClick={() => {
              setAppliedStartDate(startDate);
              setAppliedEndDate(endDate);
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
            }}
            className="px-4 py-2 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 w-full min-[480px]:w-auto transition-colors"
          >
            Clear Filter
          </button>
        </div>
      </div>

      {paginatedList.length === 0 ? (
        <div className="col-span-full w-full min-h-[60vh] flex flex-col items-center justify-center text-gray-500">
          <MdPerson className="text-4xl mb-3 opacity-60" />
          <p className="text-sm">No followers found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedList.map((follower) => {
            if (!follower) return null; // ✅ Extra safety

         return (
              <div
                key={follower._id}
                className="flex items-center gap-3 bg-white border border-gray-200 shadow-sm rounded-lg p-3"
              >
                {follower.profilePicture ? (
                  <img
                    src={follower.profilePicture}
                    alt={follower.username}
                    className="w-10 h-10 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center shrink-0">
                    <MdPerson className="text-white" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-black font-medium truncate">
                    @{follower.username}
                  </p>
                  {follower.name && (
                    <p className="text-xs text-gray-500 truncate">
                      {follower.name}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
            Page <span className="text-black font-bold">{page}</span> of {totalPages}
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
    </div>
  );
};

export default UserFollowers;