
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import toast from "react-hot-toast";
import { MdAdd, MdDelete, MdEdit } from "react-icons/md";
const Staffs = () => {
  const navigate = useNavigate();
  const topRef = useRef(null);

  const [staffs, setStaffs] = useState([]);
  const [filters, setFilters] = useState({
    search: "",
    startDate: "",
    endDate: ""
  });

  const [staffToDelete, setStaffToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 10;

  // ================= FETCH STAFFS =================
  const fetchStaffs = async () => {
    try {
      const res = await api.get(`/api/roles/staffs/all`, {
        params: {
          page,
          limit,
          search: filters.search,
          startDate: filters.startDate,
          endDate: filters.endDate
        },
       

      });

      setStaffs(res.data.staffs || []);

    } catch (err) {
      console.error(err);
      toast.error("Permission denied");
    }
  };

  useEffect(() => {
    fetchStaffs();
  }, [page, filters]);

  // ================= DELETE STAFF =================
  const confirmDelete = async () => {
    if (!staffToDelete) return;

    try {
      setDeleting(true);

      await api.delete(`/api/roles/staffs/${staffToDelete._id}`, {
      });

      toast.success("Staff deleted successfully");
      setStaffs((prev) =>
        prev.filter((s) => s._id !== staffToDelete._id)
      );
    } catch {
      toast.error("Permission denied");
    } finally {
      setDeleting(false);
      setStaffToDelete(null);
    }
  };

  // ================= SEARCH FILTER =================
  const filteredStaffs = staffs.filter((s) => {
    const matchesSearch =
      [s.name, s.email, s.phone]
        .join(" ")
        .toLowerCase()
        .includes(filters.search.toLowerCase());

    const createdDate = new Date(s.createdAt);

    const matchesStart =
      !filters.startDate ||
      createdDate >= new Date(filters.startDate);

    const matchesEnd =
      !filters.endDate ||
      createdDate <= new Date(
        new Date(filters.endDate).setHours(23, 59, 59, 999)
      );

    return matchesSearch && matchesStart && matchesEnd;
  });


  useEffect(() => {
    setPage(1);
  }, [filters]);

  // ================= PAGINATION LOGIC =================
  const totalPages = Math.ceil(filteredStaffs.length / limit);

  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;

  const currentPageStaffs = filteredStaffs.slice(
    startIndex,
    endIndex
  );

  // ================= PAGE CHANGE + SMOOTH SCROLL =================
  useEffect(() => {
    if (topRef.current) {
      topRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [page]);

  const goToPreviousPage = () => {
    if (page > 1) setPage((p) => p - 1);
  };

  const goToNextPage = () => {
    if (page < totalPages) setPage((p) => p + 1);
  };

  return (
    <div ref={topRef} className="space-y-6 animate-fadeIn bg-white text-gray-900 p-4 md:p-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            All Staffs
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {/* Manage all staff members ({filteredStaffs.length}) */}
            Manage all staff members
          </p>
        </div>

        <button
          onClick={() => navigate("/staffs/create")}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 px-5 py-2.5 rounded-lg text-white flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
        >
          <MdAdd size={20} />
          <span>Add New Staff</span>
        </button>
      </div>

      {/* SEARCH */}
      <div className="bg-white p-2 md:p-4 rounded-xl border border-gray-200 shadow-sm">
        <input
          placeholder="Search by Name, Email or Phone....."
          value={filters.search}
          onChange={(e) =>
            setFilters(prev => ({
              ...prev,
              search: e.target.value
            }))
          }
          className="w-full p-3 bg-white text-gray-900 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
        />
      </div>

      <div className="flex gap-3 flex-wrap mt-3">
        <input
          type="date"
          value={filters.startDate}
          onChange={(e) =>
            setFilters(prev => ({
              ...prev,
              startDate: e.target.value
            }))
          }
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />

        <input
          type="date"
          value={filters.endDate}
          onChange={(e) =>
            setFilters(prev => ({
              ...prev,
              endDate: e.target.value
            }))
          }
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

      {/* STAFF TABLE / CARDS */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {/* DESKTOP HEADER - Hidden on mobile */}
        <div className="hidden lg:grid grid-cols-12 p-4 text-sm font-semibold text-gray-600 border-b border-gray-200 bg-gray-50">
          <div className="col-span-1">S/N</div>
          <div className="col-span-2 text-center">Name</div>
          <div className="col-span-3 text-center">Email</div>
          <div className="col-span-2 text-center">Phone</div>
          <div className="col-span-2 text-center">Role</div>
          <div className="col-span-1 text-center">User Type</div>
          <div className="col-span-1 text-right">Options</div>
        </div>

        {/* BODY */}
        <div className="divide-y divide-gray-200">
          {currentPageStaffs.length === 0 ? (
            <div className="text-gray-500 p-12 text-center">
              No staff found
            </div>
          ) : (
            currentPageStaffs.map((s, index) => (
              <div
                key={s._id}
                className="flex flex-col lg:grid lg:grid-cols-12 items-start lg:items-center p-4 lg:p-4 hover:bg-gray-50 transition-colors gap-3 lg:gap-0"
              >
                {/* S/N - Badge on Mobile */}
                <div className="col-span-1 flex items-center gap-2">
                  <span className="lg:hidden text-xs font-bold text-gray-400 uppercase tracking-wider">S/N:</span>
                  <span className="bg-gray-100 lg:bg-transparent px-2 py-0.5 rounded text-gray-900">{startIndex + index + 1}</span>
                </div>

                {/* Name */}
                <div className="col-span-2 w-full lg:text-center">
                  <span className="lg:hidden text-xs font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Name</span>
                  <span className="text-gray-900 font-medium">{s.name}</span>
                </div>

                {/* Email */}
                <div className="col-span-3 w-full lg:text-center truncate">
                  <span className="lg:hidden text-xs font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Email</span>
                  <span className="text-gray-700">{s.email}</span>
                </div>

                {/* Phone */}
                <div className="col-span-2 w-full lg:text-center">
                  <span className="lg:hidden text-xs font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Phone</span>
                  <span className="text-gray-700">{s.phone || "-"}</span>
                </div>

                {/* Role */}
                <div className="col-span-2 w-full lg:text-center">
                  <span className="lg:hidden text-xs font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Role</span>
                  <span className="inline-block bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold">
                    {s.role?.name || "-"}
                  </span>
                </div>

                {/* User Type */}
                <div className="col-span-1 w-full lg:text-center">
                  <span className="lg:hidden text-xs font-bold text-gray-400 uppercase tracking-wider block mb-0.5">User Type</span>
                  <span className="text-gray-600 lg:text-gray-900 capitalize text-sm">{s.userType || "admin"}</span>
                </div>

                {/* Options */}
                <div className="col-span-1 w-full flex justify-end gap-4 border-t lg:border-none pt-3 lg:pt-0 mt-2 lg:mt-0">
                  <button
                    onClick={() => navigate(`/staffs/edit/${s._id}`)}
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                  >
                    <MdEdit size={20} />
                    <span className="lg:hidden text-sm">Edit</span>
                  </button>

                  <button
                    onClick={() => setStaffToDelete(s)}
                    className="flex items-center gap-1 text-red-600 hover:text-red-800 font-medium"
                  >
                    <MdDelete size={20} />
                    <span className="lg:hidden text-sm">Delete</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* PAGINATION */}
      <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mt-6">
        <div className="flex items-center gap-3">
          <button
            onClick={goToPreviousPage}
            disabled={page === 1}
            className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg border border-gray-200 disabled:opacity-50 hover:bg-gray-200 transition-all font-medium text-sm"
          >
            &lt; Previous
          </button>

          <span className="text-gray-600 text-sm font-medium">
            Page <span className="text-gray-900">{page}</span> of {totalPages || 1}
          </span>

          <button
            onClick={goToNextPage}
            disabled={page === totalPages || totalPages === 0}
            className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg border border-gray-200 disabled:opacity-50 hover:bg-gray-200 transition-all font-medium text-sm"
          >
            Next &gt;
          </button>
        </div>
      </div>

      {/* DELETE CONFIRM POPUP */}
      {staffToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm border border-gray-200 shadow-2xl animate-in zoom-in duration-200">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Delete Staff
            </h2>

            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete{" "}
              <span className="text-gray-900 font-bold underline decoration-red-200">
                {staffToDelete.name}
              </span>
              ? This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setStaffToDelete(null)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-lg bg-gray-100 text-gray-800 font-semibold hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>

              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition-all shadow-lg shadow-red-200 disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Staffs;