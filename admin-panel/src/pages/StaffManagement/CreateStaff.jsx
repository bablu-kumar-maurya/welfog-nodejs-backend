
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/axios";
import toast from "react-hot-toast";
import { MdArrowBack } from "react-icons/md";

const CreateStaff = () => {
  const navigate = useNavigate();
  const { id } = useParams(); 
  const isEdit = Boolean(id);

  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    roleId: "",
  });

  // ================= FETCH ROLES =================
  const fetchRoles = async () => {
    try {

      const res = await api.get(`/api/roles`); 
      setRoles(res.data.roles || []);
    } catch {
      toast.error("Failed to load roles");
    }
  };

  // ================= FETCH STAFF (EDIT MODE) =================
  const fetchStaff = async () => {
    if (!isEdit) return;

    try {
      const res = await api.get(`/api/roles/staffs/${id}`); 
      const s = res.data;

      setForm({
        name: s.name,
        email: s.email,
        phone: s.phone || "",
        password: "", 
        roleId: s.role?._id || "",
      });
    } catch {
      toast.error("Staff not found");
      navigate("/staffs");
    }
  };

  useEffect(() => {
    fetchRoles();
    fetchStaff();
  }, [id]);

  // ================= SAVE =================
  const handleSave = async () => {
    if (!form.name || !form.email || !form.roleId) {
      toast.error("Please fill all required fields");
      return;
    }

    try {
      setLoading(true);

      if (isEdit) {
        await api.put(`/api/roles/staffs/${id}`, {
          name: form.name,
          email: form.email,
          phone: form.phone,
          roleId: form.roleId,
        });
        toast.success("Staff updated successfully");
      } else {
        if (!form.password) {
          toast.error("Password is required");
          return;
        }
        await api.post(`/api/roles/staffs/create`, form);
        toast.success("Staff created successfully");
      }

      navigate("/staffs");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Operation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6 animate-fadeIn p-4 md:p-6 text-left">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl md:text-2xl font-bold text-black truncate">
          {isEdit ? "Edit Staff" : "Staff Information"}
        </h1>

        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 text-blue-600 hover:bg-gray-200 transition text-sm md:text-base flex-shrink-0"
        >
          <MdArrowBack className="text-lg" />
          <span className="hidden sm:inline">Go Back</span>
          <span className="sm:hidden">Back</span>
        </button>
      </div>

      {/* FORM SECTION */}
      <div className="bg-white p-5 md:p-6 rounded-xl border border-gray-200 space-y-5 shadow-sm">
        {["name", "email", "phone"].map((field) => (
          <div key={field}>
            <label className="text-sm font-medium text-gray-700 block mb-2 font-semibold">
              {field.charAt(0).toUpperCase() + field.slice(1)}
            </label>
            <input
              value={form[field]}
              onChange={(e) =>
                setForm({ ...form, [field]: e.target.value })
              }
              placeholder={`Enter ${field}`}
              className="w-full p-3 bg-white text-black rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-sm md:text-base"
            />
          </div>
        ))}

        {!isEdit && (
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2 font-semibold">Password</label>
            <input
              type="password"
              value={form.password}
              autoComplete="new-password"
              placeholder="Enter password"
              onChange={(e) =>
                setForm({ ...form, password: e.target.value })
              }
              className="w-full p-3 bg-white text-black rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-sm md:text-base"
            />
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2 font-semibold">Role</label>
          <select
            value={form.roleId}
            onChange={(e) =>
              setForm({ ...form, roleId: e.target.value })
            }
            className="w-full p-3 bg-white text-black rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition cursor-pointer text-sm md:text-base"
          >
            <option value="">Select Role</option>
            {roles.map((r) => (
              <option key={r._id} value={r._id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-start">
        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full sm:w-auto sm:px-10 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition shadow-md disabled:opacity-60 active:scale-95"
        >
          {loading ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
};

export default CreateStaff;