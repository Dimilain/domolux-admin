'use client';

import { useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import axios from 'axios';
import AdminLayout from '@/components/AdminLayout';
import {
  MagnifyingGlassIcon,
  EnvelopeIcon,
  CheckCircleIcon,
  DocumentArrowDownIcon,
  DocumentTextIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_API_URL || 'http://localhost:1337';

interface Lead {
  id: number;
  attributes: {
    name: string;
    email: string;
    company?: string;
    message: string;
    contacted?: boolean;
    contactedAt?: string;
    products?: {
      data?: Array<{
        id: number;
        attributes: {
          name: string;
          sku?: string;
          price?: number;
          currency?: string;
          thumbnail?: {
            data?: {
              attributes: {
                url: string;
              };
            };
          };
        };
      }>;
    };
    product_ids?: string;
    createdAt: string;
    updatedAt: string;
  };
}

interface StrapiResponse {
  data: Lead[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
  };
}

const fetcher = async (url: string, token: string) => {
  const response = await axios.get<StrapiResponse>(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data;
};

export default function LeadsPage() {
  const { data: session } = useSession();
  const jwt = (session?.user as any)?.jwt;

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [searchQuery, setSearchQuery] = useState('');
  const [contactedFilter, setContactedFilter] = useState<'all' | 'contacted' | 'uncontacted'>('all');
  const [selectedLeads, setSelectedLeads] = useState<number[]>([]);

  // Build API URL with filters
  const apiUrl = useMemo(() => {
    if (!jwt) return null;

    const params = new URLSearchParams();
    params.append('populate', 'products');
    params.append('pagination[page]', page.toString());
    params.append('pagination[pageSize]', pageSize.toString());
    params.append('sort', 'createdAt:desc');

    if (searchQuery) {
      params.append('filters[$or][0][name][$containsi]', searchQuery);
      params.append('filters[$or][1][email][$containsi]', searchQuery);
      params.append('filters[$or][2][company][$containsi]', searchQuery);
    }

    if (contactedFilter === 'contacted') {
      params.append('filters[contacted][$eq]', 'true');
    } else if (contactedFilter === 'uncontacted') {
      params.append('filters[contacted][$ne]', 'true');
    }

    return `${STRAPI_URL}/api/leads?${params.toString()}`;
  }, [page, pageSize, searchQuery, contactedFilter, jwt]);

  const { data, error, isLoading, mutate } = useSWR(
    apiUrl ? [apiUrl, jwt] : null,
    ([url, token]) => fetcher(url, token)
  );

  const leads: Lead[] = useMemo(() => {
    return data?.data || [];
  }, [data]);

  const pagination = data?.meta?.pagination;

  // Mark as contacted
  const handleMarkContacted = async (leadId: number) => {
    try {
      await axios.put(
        `${STRAPI_URL}/api/leads/${leadId}`,
        {
          data: {
            contacted: true,
            contactedAt: new Date().toISOString(),
          },
        },
        {
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json',
          },
        }
      );
      mutate();
      alert('Lead marked as contacted');
    } catch (error: any) {
      console.error('Error marking lead as contacted:', error);
      alert(`Failed to mark lead as contacted: ${error.response?.data?.error?.message || error.message}`);
    }
  };

  // Forward to sales (email)
  const handleForwardToSales = async (leadId: number) => {
    try {
      const lead = leads.find((l) => l.id === leadId);
      if (!lead) return;

      await axios.post('/api/admin/leads/forward', {
        leadId,
        lead: {
          name: lead.attributes.name,
          email: lead.attributes.email,
          company: lead.attributes.company,
          message: lead.attributes.message,
          products: lead.attributes.products?.data || [],
        },
      }, {
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
      });

      alert('Lead forwarded to sales team');
    } catch (error: any) {
      console.error('Error forwarding lead:', error);
      alert(`Failed to forward lead: ${error.response?.data?.error || error.message}`);
    }
  };

  // Generate quote PDF
  const handleGenerateQuote = async (leadId: number) => {
    try {
      const lead = leads.find((l) => l.id === leadId);
      if (!lead) return;

      const response = await axios.post(
        '/api/admin/leads/generate-quote',
        {
          leadId,
          lead: {
            name: lead.attributes.name,
            email: lead.attributes.email,
            company: lead.attributes.company,
            products: lead.attributes.products?.data || [],
          },
        },
        {
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json',
          },
          responseType: 'blob',
        }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `quote-${leadId}-${Date.now()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Error generating quote:', error);
      alert(`Failed to generate quote: ${error.response?.data?.error || error.message}`);
    }
  };

  // Download spec pack
  const handleDownloadSpecPack = async (leadId: number) => {
    try {
      const lead = leads.find((l) => l.id === leadId);
      if (!lead) return;

      const response = await axios.post(
        '/api/admin/leads/spec-pack',
        {
          leadId,
          lead: {
            name: lead.attributes.name,
            email: lead.attributes.email,
            company: lead.attributes.company,
            products: lead.attributes.products?.data || [],
          },
        },
        {
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json',
          },
          responseType: 'blob',
        }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `spec-pack-${leadId}-${Date.now()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Error downloading spec pack:', error);
      alert(`Failed to download spec pack: ${error.response?.data?.error || error.message}`);
    }
  };

  // Bulk mark as contacted
  const handleBulkMarkContacted = async () => {
    if (selectedLeads.length === 0) return;

    try {
      for (const leadId of selectedLeads) {
        await axios.put(
          `${STRAPI_URL}/api/leads/${leadId}`,
          {
            data: {
              contacted: true,
              contactedAt: new Date().toISOString(),
            },
          },
          {
            headers: {
              Authorization: `Bearer ${jwt}`,
              'Content-Type': 'application/json',
            },
          }
        );
      }
      setSelectedLeads([]);
      mutate();
      alert(`${selectedLeads.length} leads marked as contacted`);
    } catch (error: any) {
      console.error('Error bulk marking leads:', error);
      alert(`Failed to mark leads as contacted: ${error.response?.data?.error?.message || error.message}`);
    }
  };

  // Toggle selection
  const toggleSelect = (leadId: number) => {
    setSelectedLeads((prev) =>
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedLeads.length === leads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(leads.map((l) => l.id));
    }
  };

  if (error) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-red-600">Failed to load leads. Please try again.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-serif font-bold text-midnight mb-2">Leads</h1>
            <p className="text-slate-600">
              {pagination ? `Total: ${pagination.total} leads` : 'Loading...'}
            </p>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow-soft p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, email, or company..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
            </div>
            <div className="flex items-center space-x-2">
              <FunnelIcon className="w-5 h-5 text-slate-700" />
              <select
                value={contactedFilter}
                onChange={(e) => {
                  setContactedFilter(e.target.value as 'all' | 'contacted' | 'uncontacted');
                  setPage(1);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              >
                <option value="all">All Leads</option>
                <option value="contacted">Contacted</option>
                <option value="uncontacted">Uncontacted</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedLeads.length > 0 && (
          <div className="bg-white rounded-lg shadow-soft p-4 mb-6 flex items-center justify-between">
            <p className="text-slate-700">
              {selectedLeads.length} lead(s) selected
            </p>
            <button
              onClick={handleBulkMarkContacted}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              Mark as Contacted
            </button>
          </div>
        )}

        {/* Leads Table */}
        <div className="bg-white rounded-lg shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4">
                    <input
                      type="checkbox"
                      checked={selectedLeads.length === leads.length && leads.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Name</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Email</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Company</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Products</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Date</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                    </td>
                  </tr>
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-600">
                      No leads found
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={selectedLeads.includes(lead.id)}
                          onChange={() => toggleSelect(lead.id)}
                          className="rounded border-gray-300 text-primary focus:ring-primary"
                        />
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">{lead.attributes.name}</td>
                      <td className="py-3 px-4 text-sm text-slate-600">{lead.attributes.email}</td>
                      <td className="py-3 px-4 text-sm text-slate-600">
                        {lead.attributes.company || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600">
                        {lead.attributes.products?.data?.length || 0} product(s)
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600">
                        {format(new Date(lead.attributes.createdAt), 'MMM dd, yyyy')}
                      </td>
                      <td className="py-3 px-4">
                        {lead.attributes.contacted ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Contacted
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            New
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleForwardToSales(lead.id)}
                            className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            title="Forward to Sales"
                          >
                            <EnvelopeIcon className="w-5 h-5" />
                          </button>
                          {!lead.attributes.contacted && (
                            <button
                              onClick={() => handleMarkContacted(lead.id)}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              title="Mark as Contacted"
                            >
                              <CheckCircleIcon className="w-5 h-5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleGenerateQuote(lead.id)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Generate Quote"
                          >
                            <DocumentTextIcon className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDownloadSpecPack(lead.id)}
                            className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                            title="Download Spec Pack"
                          >
                            <DocumentArrowDownIcon className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <div className="text-sm text-slate-600">
                Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, pagination.total)} of {pagination.total} results
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
                  Page {page} of {pagination.pageCount}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.pageCount, p + 1))}
                  disabled={page >= pagination.pageCount}
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


