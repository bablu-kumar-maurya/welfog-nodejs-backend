
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/axios";
import { MdArrowBack } from "react-icons/md";
import toast from "react-hot-toast";
import { PERMISSIONS_CONFIG } from "../../config/permissions"; 


const CreateRole = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(false);

  // ================= LOAD ROLE (EDIT MODE) =================
  useEffect(() => {
    if (!isEdit) return;

    const fetchRole = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/api/roles/${id}`);

        setName(res.data.name);

        const permsObj = {};
        res.data.permissions.forEach((p) => {
          permsObj[p] = true;
        });
        setPermissions(permsObj);
      } catch {
        toast.error("Permission denied");
        navigate("/roles");
      } finally {
        setLoading(false);
      }
    };

    fetchRole();
  }, [id, isEdit, navigate]);

  // ================= TOGGLE PERMISSION =================
  const togglePermission = (key) => {
    setPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // ================= SAVE / UPDATE =================
  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Role name is required");
      return;
    }

    const selectedPermissions = Object.keys(permissions).filter(
      (p) => permissions[p]
    );

    try {
      setLoading(true);

      if (isEdit) {
        await api.put(`/api/roles/${id}`, {
          name,
          permissions: selectedPermissions,
        });
        toast.success("Role updated successfully");
      } else {
        await api.post("/api/roles", {
          name,
          permissions: selectedPermissions,
        });
        toast.success("Role created successfully");
      }

      navigate("/roles");
    } catch {
      toast.error("Permission denied");
    } finally {
      setLoading(false);
    }
  };

  // ================= UI =================
  return (
    <div className="max-w-6xl space-y-6 animate-fadeIn p-4 md:p-0">
      {/* HEADER */}
      <div className="flex flex-row items-center justify-between gap-4">
        <h1 className="text-xl md:text-2xl font-bold text-black truncate">
          {isEdit ? "Edit Role" : "Create Role"}
        </h1>

        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-lg bg-gray-100 text-blue-600 hover:bg-gray-200 transition text-sm md:text-base whitespace-nowrap"
        >
          <MdArrowBack className="text-lg" />
          <span>Go Back</span>
        </button>
      </div>

      {/* ROLE NAME */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
        <label className="text-sm font-medium text-gray-700 block mb-2">Role Name</label>
        <input
          placeholder="e.g. Content Manager"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full p-3 bg-white border border-gray-300 rounded-lg text-black focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
          disabled={loading}
        />
      </div>

      {/* PERMISSIONS GROUPS */}
      {Object.entries(PERMISSIONS_CONFIG).map(([group, perms]) => (
        <div
          key={group}
          className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm"
        >
          <h3 className="text-md font-bold text-black mb-4 border-b pb-2 border-gray-100 uppercase tracking-wider text-xs md:text-sm">
            {group}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {perms.map((perm) => (
              <div
                key={perm.key}
                className={`
                  rounded-xl border p-4 flex flex-col justify-between gap-3
                  transition-all duration-200 ease-out min-h-[100px]
                  ${permissions[perm.key] 
                    ? "bg-blue-50 border-blue-200 shadow-sm" 
                    : "bg-white border-gray-200 hover:border-gray-300"}
                `}
              >
                <span className="text-sm font-semibold text-gray-800 leading-tight">
                  {perm.label}
                </span>

                <div className="flex justify-between items-center">
                   <span className="text-[10px] text-gray-400 font-mono">
                    {permissions[perm.key] ? "ENABLED" : "DISABLED"}
                   </span>
                   <button
                    type="button"
                    disabled={loading}
                    onClick={() => togglePermission(perm.key)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      permissions[perm.key]
                        ? "bg-blue-600"
                        : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        permissions[perm.key]
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* SAVE BUTTON */}
      <div className="flex justify-end pt-4 pb-10 md:pb-0">
        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full md:w-auto px-10 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-100 disabled:opacity-60 active:scale-95"
        >
          {loading ? "Processing..." : "Save Role"}
        </button>
      </div>
    </div>
  );
};

export default CreateRole;