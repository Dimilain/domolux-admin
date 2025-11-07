'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import axios from 'axios';
import AdminLayout from '@/components/AdminLayout';
import { ArrowLeftIcon, FunnelIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_API_URL || 'http://localhost:1337';

interface Audit {
  id: number;
  attributes: {
    action: 'create' | 'update' | 'delete' | 'publish' | 'unpublish';
    entity: string;
    entityId: number;
    timestamp: string;
    before: any;
    after: any;
    user?: {
      data?: {
        id: number;
        attributes: {
          username: string;
          email: string;
        };
      };
    };
  };
}

const fetcher = async (url: string, token: string) => {
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data;
};

export default function LogsPage() {
  const { data: session } = useSession();
  const jwt = (session?.user as any)?.jwt;

  const [filters, setFilters] = useState({
    entity: 'all',
    action: 'all',
    userId: 'all',
    startDate: '',
    endDate: '',
  });

  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Build API URL with filters
  const apiUrl = jwt
    ? `${STRAPI_URL}/api/audits?page=${page}&pageSize=${pageSize}&${Object.entries(filters)
        .filter(([_, value]) => value !== 'all' && value !== '')
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&')}`
    : null;

  const { data, error, isLoading, mutate } = useSWR(
    apiUrl ? [apiUrl, jwt] : null,
    ([url, token]) => fetcher(url, token)
  );

  const audits: Audit[] = data?.data || [];

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1); // Reset to first page on filter change
  };

  const handleRollback = async (versionId: number) => {
    if (!confirm('Are you sure you want to rollback to this version?')) {
      return;
    }

    try {
      await axios.post(
        `${STRAPI_URL}/api/versions/${versionId}/rollback`,
        {},
        {
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json',
          },
        }
      );

      alert('Successfully rolled back to version');
      mutate(); // Refresh audit logs
    } catch (error: any) {
      console.error('Rollback error:', error);
      alert(`Failed to rollback: ${error.response?.data?.error || error.message}`);
    }
  };

  if (error) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-red-600">Failed to load audit logs. Please try again.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => window.history.back()}
              className="p-2 rounded-lg text-slate-700 hover:bg-gray-100 transition-colors"
            >
              <ArrowLeftIcon className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-3xl font-serif font-bold text-midnight">Audit Logs</h1>
              <p className="text-slate-600">View recent actions and changes</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-soft p-6 mb-6">
          <div className="flex items-center space-x-2 mb-4">
            <FunnelIcon className="w-5 h-5 text-slate-700" />
            <h2 className="text-lg font-serif font-semibold text-midnight">Filters</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Entity</label>
              <select
                value={filters.entity}
                onChange={(e) => handleFilterChange('entity', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              >
                <option value="all">All Entities</option>
                <option value="product">Product</option>
                <option value="article">Article</option>
                <option value="collection">Collection</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Action</label>
              <select
                value={filters.action}
                onChange={(e) => handleFilterChange('action', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              >
                <option value="all">All Actions</option>
                <option value="create">Create</option>
                <option value="update">Update</option>
                <option value="delete">Delete</option>
                <option value="publish">Publish</option>
                <option value="unpublish">Unpublish</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Start Date</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">End Date</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setFilters({
                    entity: 'all',
                    action: 'all',
                    userId: 'all',
                    startDate: '',
                    endDate: '',
                  });
                  setPage(1);
                }}
                className="w-full px-4 py-2 bg-gray-100 text-slate-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Audit Logs Table */}
        <div className="bg-white rounded-lg shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Timestamp</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">User</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Action</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Entity</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Entity ID</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                    </td>
                  </tr>
                ) : audits.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-600">
                      No audit logs found
                    </td>
                  </tr>
                ) : (
                  audits.map((audit) => (
                    <tr key={audit.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm text-slate-700">
                        {format(new Date(audit.attributes.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-700">
                        {audit.attributes.user?.data?.attributes?.username ||
                          audit.attributes.user?.data?.attributes?.email ||
                          'Unknown'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            audit.attributes.action === 'create'
                              ? 'bg-green-100 text-green-800'
                              : audit.attributes.action === 'update'
                              ? 'bg-blue-100 text-blue-800'
                              : audit.attributes.action === 'delete'
                              ? 'bg-red-100 text-red-800'
                              : audit.attributes.action === 'publish'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {audit.attributes.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-700">
                        {audit.attributes.entity}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-700">
                        {audit.attributes.entityId}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => {
                            // Show before/after diff in modal or new page
                            const diff = {
                              before: audit.attributes.before,
                              after: audit.attributes.after,
                            };
                            console.log('Audit diff:', diff);
                            alert('Check console for audit details');
                          }}
                          className="text-primary hover:text-primary/70 text-sm"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data?.pagination && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <div className="text-sm text-slate-600">
                Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, data.pagination.total)} of {data.pagination.total} results
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-slate-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span className="px-3 py-2 text-sm text-slate-700">
                  Page {page} of {data.pagination.pageCount}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(data.pagination.pageCount, p + 1))}
                  disabled={page >= data.pagination.pageCount}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-slate-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}





