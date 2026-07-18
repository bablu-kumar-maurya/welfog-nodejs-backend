import React, { useEffect, useState } from "react";
import api from "../api/axios";

const ErrorLogs = () => {
    const [logs, setLogs] = useState([]);
    const [page, setPage] = useState(1);

    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

    const [selectedError, setSelectedError] = useState(null);

    const fetchLogs = async () => {
        try {
            let url = `/api/admin/errors?page=${page}`;

            if (startDate) {
                url += `&startDate=${startDate}`;
            }

            if (endDate) {
                url += `&endDate=${endDate}`;
            }

            const res = await api.get(url, {
            });

            setLogs(res.data.logs || []);

        } catch (err) {
            console.error("Failed to fetch logs", err);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [page]);

    const applyFilter = () => {
        setPage(1);
        fetchLogs();
    };

    const resetFilter = () => {
        setStartDate("");
        setEndDate("");
        setPage(1);

        setTimeout(() => {
            fetchLogs();
        }, 0);
    };

return (
        <div className="p-4 sm:p-6 w-full max-w-full mx-auto box-border min-h-screen bg-white">

            {/* Header and Filter Section */}
            <div className="mb-6 flex flex-col lg:flex-row items-start lg:items-end justify-between gap-5 w-full">
                
                {/* Page Header */}
                <div className="shrink-0 w-full lg:w-auto">
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 tracking-tight">Error Logs</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Monitor backend API errors and system issues
                    </p>
                </div>

                {/* Grid-based Date Filter */}
                <div className="w-full lg:w-auto grid grid-cols-1 sm:grid-cols-2 md:flex md:items-end gap-3 sm:gap-4">

                    <div className="w-full md:w-36 lg:w-40">
                        <label className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
                            Start Date
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow bg-white"
                        />
                    </div>

                    <div className="w-full md:w-36 lg:w-40">
                        <label className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
                            End Date
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow bg-white"
                        />
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-2 w-full sm:col-span-2 md:w-auto mt-2 sm:mt-0">
                        <button
                            onClick={applyFilter}
                            className="flex-1 md:flex-none px-5 py-2 bg-blue-600 text-white font-medium rounded-lg text-sm hover:bg-blue-700 transition-colors whitespace-nowrap shadow-sm"
                        >
                            Apply
                        </button>

                        <button
                            onClick={resetFilter}
                            className="flex-1 md:flex-none px-5 py-2 bg-gray-100 text-gray-700 font-medium border border-gray-300 rounded-lg text-sm hover:bg-gray-200 transition-colors whitespace-nowrap shadow-sm"
                        >
                            Reset
                        </button>
                    </div>

                </div>
            </div>

            {/* Table Section */}
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 w-full overflow-hidden">

                <div className="overflow-x-auto w-full">
                  <table className="w-full min-w-[900px] text-sm text-left whitespace-nowrap">

                        <thead className="bg-gray-50/80 text-gray-600 uppercase text-xs tracking-wider border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-3.5 font-semibold">API</th>
                                <th className="px-4 py-3.5 font-semibold">Method</th>
                                <th className="px-4 py-3.5 font-semibold">Status</th>
                                <th className="px-4 py-3.5 font-semibold">Error</th>
                                {/* Hidden on mobile, visible on medium+ screens */}
                                <th className="px-4 py-3.5 font-semibold hidden md:table-cell">IP</th>
                                {/* Hidden on small/medium screens, visible on large+ screens */}
                                <th className="px-4 py-3.5 font-semibold hidden lg:table-cell">Time</th>
                                <th className="px-4 py-3.5 font-semibold text-right sm:text-left">Action</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100">

                            {logs.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="text-center py-10 text-gray-400 font-medium">
                                        <div className="flex flex-col items-center justify-center">
                                            <span className="text-3xl mb-2">✅</span>
                                            No error logs found
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log._id} className="hover:bg-gray-50/80 transition-colors group">

                                        <td className="px-4 py-3 font-mono text-xs text-blue-600 max-w-[120px] sm:max-w-[180px] truncate">
                                            {log.api}
                                        </td>

                                        <td className="px-4 py-3">
                                            <span className="px-2 py-1 text-[11px] uppercase tracking-wide font-bold bg-gray-100 text-gray-700 rounded">
                                                {log.method}
                                            </span>
                                        </td>

                                        <td className="px-4 py-3 text-xs">
                                            <span className={`px-2.5 py-1 font-bold rounded-full ${log.statusCode >= 500 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {log.statusCode || 500}
                                            </span>
                                        </td>

                                        <td className="px-4 py-3 text-gray-700 font-medium max-w-[150px] sm:max-w-[200px] xl:max-w-[350px] truncate" title={log.errorMessage}>
                                            {log.errorMessage}
                                        </td>

                                        <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">
                                            {log.ip}
                                        </td>

                                        <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">
                                            {new Date(log.createdAt).toLocaleString()}
                                        </td>

                                        <td className="px-4 py-3 text-right sm:text-left">
                                            <button
                                                onClick={() => setSelectedError(log)}
                                                className="px-3 py-1.5 bg-blue-50 text-blue-600 font-semibold text-xs rounded-md hover:bg-blue-600 hover:text-white transition-all focus:outline-none focus:ring-2 focus:ring-blue-300 shadow-sm"
                                            >
                                                View
                                            </button>
                                        </td>

                                    </tr>
                                ))
                            )}

                        </tbody>
                    </table>
                </div>

              {/* Pagination */}
                <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 px-4 py-3.5 bg-gray-50/50 border-t border-gray-200">

                    <button
                        onClick={() => setPage(page - 1)}
                        disabled={page === 1}
                        className="w-full sm:w-auto px-4 py-2 text-sm font-medium bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm order-2 sm:order-1"
                    >
                        Previous
                    </button>

                    <div className="w-full sm:w-auto flex justify-center order-1 sm:order-2 mb-2 sm:mb-0">
                        <span className="text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-md">
                            Page <span className="text-gray-900 font-bold">{page}</span>
                        </span>
                    </div>

                    <button
                        onClick={() => setPage(page + 1)}
                        className="w-full sm:w-auto px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors shadow-sm order-3"
                    >
                        Next
                    </button>

                </div>
            </div>

          {/* Error Detail Modal */}
            {selectedError && (

                <div className="fixed inset-0 bg-gray-900/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">

                    <div 
                        className="bg-white w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl relative animate-in fade-in zoom-in duration-200"
                    >
                        {/* Modal Header - Fixed at top */}
                        <div className="flex justify-between items-center p-4 sm:p-6 border-b border-gray-100 shrink-0">
                            <div>
                                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Error Details</h2>
                                <p className="text-xs text-gray-500 mt-1 hidden sm:block">Detailed diagnostic information for this request.</p>
                            </div>
                            <button 
                                onClick={() => setSelectedError(null)}
                                className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full transition-colors focus:outline-none"
                            >
                                <span className="text-xl leading-none">&times;</span>
                            </button>
                        </div>

                        {/* Modal Body - Scrollable */}
                        <div className="p-4 sm:p-6 overflow-y-auto grow">
                            
                            {/* Key Value Grid */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
                                <div className="bg-gray-50 p-3 sm:p-4 rounded-xl border border-gray-100 col-span-2 lg:col-span-1">
                                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Status Code</p>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${selectedError.statusCode >= 500 ? 'bg-red-500' : 'bg-amber-500'}`}></div>
                                        <p className="text-lg font-bold text-gray-900">{selectedError.statusCode || 500}</p>
                                    </div>
                                </div>
                                <div className="bg-gray-50 p-3 sm:p-4 rounded-xl border border-gray-100 col-span-2 lg:col-span-3">
                                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">API Endpoint</p>
                                    <p className="text-sm font-mono text-blue-600 break-all">{selectedError.method} {selectedError.api}</p>
                                </div>
                                {/* Added IP and Time here so they aren't lost on mobile */}
                                <div className="bg-gray-50 p-3 sm:p-4 rounded-xl border border-gray-100 col-span-1">
                                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Client IP</p>
                                    <p className="text-sm font-medium text-gray-800 break-all">{selectedError.ip || 'N/A'}</p>
                                </div>
                                <div className="bg-gray-50 p-3 sm:p-4 rounded-xl border border-gray-100 col-span-1 lg:col-span-3">
                                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Timestamp</p>
                                    <p className="text-sm font-medium text-gray-800">{new Date(selectedError.createdAt).toLocaleString()}</p>
                                </div>
                            </div>

                            <div className="space-y-5">
                                <div>
                                    <p className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">
                                        <span className="text-red-500">⚠️</span> Error Message
                                    </p>
                                    <div className="bg-red-50/50 border border-red-100 p-3.5 text-sm text-red-800 rounded-xl whitespace-pre-wrap break-words font-medium">
                                        {selectedError.errorMessage}
                                    </div>
                                </div>

                                <div>
                                    <p className="text-sm font-bold text-gray-800 mb-2">Stack Trace</p>
                                    <div className="relative">
                                        <pre className="bg-[#0f172a] text-gray-300 p-4 text-[11px] sm:text-xs rounded-xl whitespace-pre-wrap break-all max-h-[250px] sm:max-h-[350px] overflow-y-auto font-mono leading-relaxed shadow-inner">
                                            {selectedError.stack}
                                        </pre>
                                    </div>
                                </div>

                                {selectedError.requestBody && Object.keys(selectedError.requestBody).length > 0 && (
                                    <div>
                                        <p className="text-sm font-bold text-gray-800 mb-2">Request Payload</p>
                                        <pre className="bg-gray-50 border border-gray-200 text-gray-700 p-4 text-[11px] sm:text-xs rounded-xl overflow-x-auto whitespace-pre-wrap break-words font-mono">
                                            {JSON.stringify(selectedError.requestBody, null, 2)}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Modal Footer - Fixed at bottom */}
                        <div className="p-4 sm:p-5 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl shrink-0 flex justify-end">
                            <button
                                onClick={() => setSelectedError(null)}
                                className="w-full sm:w-auto px-8 py-2.5 bg-gray-900 text-white font-medium rounded-lg hover:bg-black transition-colors shadow-sm"
                            >
                                Close View
                            </button>
                        </div>

                    </div>
                </div>
            )}

        </div>
    );
};

export default ErrorLogs;