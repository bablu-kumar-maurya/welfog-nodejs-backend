import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api/axios";
import { MdArrowBack, MdPerson } from "react-icons/md";

const LIMIT = 10;

const UserFollowing = () => {
  const { userId } = useParams(); // userid
  const navigate = useNavigate();
  const topRef = useRef(null);

  const [following, setFollowing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  useEffect(() => {
    if (userId) {
      fetchFollowing();
    }
  }, [userId]);

  const fetchFollowing = async () => {
    try {
      setLoading(true);
     
      const res = await api.get(
        `/api/users/admin/users/${userId}/following`);
      const list = res.data.following || [];
      setFollowing(list);
      setTotalItems(list.length);
    } catch (error) {
      console.error("Error fetching following:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalItems / LIMIT));
  const start = (page - 1) * LIMIT;
  const paginatedList = following.slice(start, start + LIMIT);

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
      {/* Header */}
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <MdArrowBack className="text-black text-xl" />
        </button>

        <h1 className="text-xl sm:text-2xl font-bold text-black">
          User Following
        </h1>
      </div>

      {/* Following list */}
      {paginatedList.length === 0 ? (
        <div className="col-span-full w-full min-h-[60vh] flex flex-col items-center justify-center text-gray-500">
          <MdPerson className="text-4xl mb-3 opacity-60" />
          <p className="text-sm">Not following anyone</p>
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedList.map((user) => (

           <div
              key={user._id}
              className="flex items-center gap-3 bg-white border border-gray-200 shadow-sm rounded-lg p-3"
            >
              {user.profilePicture ? (
                <img
                  src={user.profilePicture}
                  alt={user.username}
                  className="w-10 h-10 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center shrink-0">
                  <MdPerson className="text-white" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-black font-medium truncate">
                  @{user.username}
                </p>
                {user.name && (
                  <p className="text-xs text-gray-500 truncate">
                    {user.name}
                  </p>
                )}
              </div>
            </div>

          ))}
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

export default UserFollowing;
