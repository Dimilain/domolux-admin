'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import axios from 'axios';
import AdminLayout from '@/components/AdminLayout';
import {
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  EyeSlashIcon,
  FunnelIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline';
import Image from 'next/image';

interface Product {
  id: number;
  attributes: {
    name: string;
    sku?: string;
    slug?: string;
    category?: string;
    price?: number;
    currency?: string;
    availability?: boolean;
    hotel_grade?: boolean;
    publishedAt?: string;
    images?: {
      data?: Array<{
        id: number;
        attributes: {
          url: string;
          alternativeText?: string;
        };
      }>;
    };
    thumbnail?: {
      data?: {
        attributes: {
          url: string;
        };
      };
    };
  };
}

interface StrapiResponse {
  data: Product[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
  };
}

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_API_URL || 'http://localhost:1337';

// Fetcher function for SWR
const fetcher = async (url: string, token: string) => {
  const response = await axios.get<StrapiResponse>(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data;
};

export default function ProductsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const jwt = (session?.user as any)?.jwt;

  // State for filters and pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [hotelGradeFilter, setHotelGradeFilter] = useState<boolean | null>(null);
  const [dateRangeStart, setDateRangeStart] = useState('');
  const [dateRangeEnd, setDateRangeEnd] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Build API URL with filters
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.append('populate', 'images,thumbnail');
    params.append('pagination[page]', page.toString());
    params.append('pagination[pageSize]', pageSize.toString());
    params.append('sort', 'publishedAt:desc');

    // Search filter
    if (searchQuery) {
      params.append('filters[$or][0][name][$containsi]', searchQuery);
      params.append('filters[$or][1][sku][$containsi]', searchQuery);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      params.append('filters[category][$eq]', categoryFilter);
    }

    // Hotel grade filter
    if (hotelGradeFilter !== null) {
      params.append('filters[hotel_grade][$eq]', hotelGradeFilter.toString());
    }

    // Date range filter
    if (dateRangeStart) {
      params.append('filters[publishedAt][$gte]', dateRangeStart);
    }
    if (dateRangeEnd) {
      params.append('filters[publishedAt][$lte]', dateRangeEnd);
    }

    return `${STRAPI_URL}/api/products?${params.toString()}`;
  }, [page, pageSize, searchQuery, categoryFilter, hotelGradeFilter, dateRangeStart, dateRangeEnd]);

  // Fetch products with SWR
  const { data, error, isLoading, mutate } = useSWR(
    jwt ? [apiUrl, jwt] : null,
    ([url, token]) => fetcher(url, token)
  );

  const products = data?.data || [];
  const pagination = data?.meta?.pagination;

  // Handle bulk actions
  const handleBulkAction = async (action: 'publish' | 'unpublish' | 'delete') => {
    if (selectedProducts.length === 0) return;

    try {
      if (action === 'delete') {
        // Delete products
        await Promise.all(
          selectedProducts.map((id) =>
            axios.delete(`${STRAPI_URL}/api/products/${id}`, {
              headers: {
                Authorization: `Bearer ${jwt}`,
              },
            })
          )
        );
      } else {
        // Publish/unpublish products
        const publishedAt = action === 'publish' ? new Date().toISOString() : null;
        await Promise.all(
          selectedProducts.map((id) =>
            axios.put(
              `${STRAPI_URL}/api/products/${id}`,
              {
                data: { publishedAt },
              },
              {
                headers: {
                  Authorization: `Bearer ${jwt}`,
                  'Content-Type': 'application/json',
                },
              }
            )
          )
        );
      }

      setSelectedProducts([]);
      mutate(); // Refresh data
    } catch (error) {
      console.error(`Bulk ${action} error:`, error);
      alert(`Failed to ${action} products. Please try again.`);
    }
  };

  // Handle individual actions
  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
      await axios.delete(`${STRAPI_URL}/api/products/${id}`, {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      });
      mutate();
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete product. Please try again.');
    }
  };

  const handleTogglePublish = async (product: Product) => {
    try {
      const publishedAt = product.attributes.publishedAt ? null : new Date().toISOString();
      await axios.put(
        `${STRAPI_URL}/api/products/${product.id}`,
        {
          data: { publishedAt },
        },
        {
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json',
          },
        }
      );
      mutate();
    } catch (error) {
      console.error('Toggle publish error:', error);
      alert('Failed to update product. Please try again.');
    }
  };

  // Toggle selection
  const toggleSelect = (id: number) => {
    setSelectedProducts((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedProducts.length === products.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(products.map((p) => p.id));
    }
  };

  const getThumbnailUrl = (product: Product) => {
    if (product.attributes.thumbnail?.data?.attributes?.url) {
      return product.attributes.thumbnail.data.attributes.url.startsWith('http')
        ? product.attributes.thumbnail.data.attributes.url
        : `${STRAPI_URL}${product.attributes.thumbnail.data.attributes.url}`;
    }
    if (product.attributes.images?.data?.[0]?.attributes?.url) {
      const url = product.attributes.images.data[0].attributes.url;
      return url.startsWith('http') ? url : `${STRAPI_URL}${url}`;
    }
    return '/placeholder.jpg';
  };

  return (
    <AdminLayout>
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-serif font-bold text-midnight mb-2">Products</h1>
            <p className="text-slate-600">
              {pagination ? `Total: ${pagination.total} products` : 'Loading...'}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => router.push('/admin/products/import')}
              className="bg-gray-100 text-slate-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Import CSV
            </button>
            <button
              onClick={() => router.push('/admin/products/new')}
              className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary/90 transition-colors"
            >
              Add Product
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow-soft p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name or SKU..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1); // Reset to first page on search
                  }}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
            </div>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg border transition-colors ${
                showFilters
                  ? 'bg-primary/10 border-primary text-primary'
                  : 'border-gray-300 text-slate-700 hover:bg-gray-50'
              }`}
            >
              <FunnelIcon className="w-5 h-5" />
              <span>Filters</span>
            </button>
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Category Filter */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Category</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                >
                  <option value="all">All Categories</option>
                  <option value="Chair">Chair</option>
                  <option value="Table">Table</option>
                  <option value="Lighting">Lighting</option>
                  <option value="Bed">Bed</option>
                  <option value="Accessory">Accessory</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>

              {/* Hotel Grade Filter */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Hotel Grade</label>
                <select
                  value={hotelGradeFilter === null ? 'all' : hotelGradeFilter ? 'true' : 'false'}
                  onChange={(e) => {
                    const value = e.target.value;
                    setHotelGradeFilter(value === 'all' ? null : value === 'true');
                    setPage(1);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                >
                  <option value="all">All</option>
                  <option value="true">Hotel Grade</option>
                  <option value="false">Not Hotel Grade</option>
                </select>
              </div>

              {/* Date Range Start */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">From Date</label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="date"
                    value={dateRangeStart}
                    onChange={(e) => {
                      setDateRangeStart(e.target.value);
                      setPage(1);
                    }}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  />
                </div>
              </div>

              {/* Date Range End */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">To Date</label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="date"
                    value={dateRangeEnd}
                    onChange={(e) => {
                      setDateRangeEnd(e.target.value);
                      setPage(1);
                    }}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bulk Actions */}
        {selectedProducts.length > 0 && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-6 flex items-center justify-between">
            <span className="text-primary font-medium">
              {selectedProducts.length} product{selectedProducts.length > 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleBulkAction('publish')}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm"
              >
                Publish
              </button>
              <button
                onClick={() => handleBulkAction('unpublish')}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm"
              >
                Unpublish
              </button>
              <button
                onClick={() => handleBulkAction('delete')}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        )}

        {/* Products Table */}
        <div className="bg-white rounded-lg shadow-soft overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="mt-4 text-slate-600">Loading products...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <p className="text-red-600">Failed to load products. Please try again.</p>
            </div>
          ) : products.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-600">No products found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedProducts.length === products.length && products.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                      Thumbnail
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                      SKU
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                      Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                      Available
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                      Hotel Grade
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                      Published
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-700 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {products.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedProducts.includes(product.id)}
                          onChange={() => toggleSelect(product.id)}
                          className="rounded border-gray-300 text-primary focus:ring-primary"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="w-16 h-16 relative rounded-lg overflow-hidden bg-gray-100">
                          <Image
                            src={getThumbnailUrl(product)}
                            alt={product.attributes.name}
                            fill
                            className="object-cover"
                            sizes="64px"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-midnight">{product.attributes.name}</div>
                        {product.attributes.slug && (
                          <div className="text-xs text-slate-500">{product.attributes.slug}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700">
                        {product.attributes.sku || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary">
                          {product.attributes.category || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700">
                        {product.attributes.price
                          ? `${product.attributes.currency || 'EUR'} ${product.attributes.price.toFixed(2)}`
                          : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${
                            product.attributes.availability
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {product.attributes.availability ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {product.attributes.hotel_grade ? (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800">
                            Yes
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {product.attributes.publishedAt ? (
                          <div className="text-sm text-slate-700">
                            {new Date(product.attributes.publishedAt).toLocaleDateString()}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-sm">Draft</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleTogglePublish(product)}
                            className="p-2 text-slate-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title={product.attributes.publishedAt ? 'Unpublish' : 'Publish'}
                          >
                            {product.attributes.publishedAt ? (
                              <EyeIcon className="w-5 h-5" />
                            ) : (
                              <EyeSlashIcon className="w-5 h-5" />
                            )}
                          </button>
                          <button
                            onClick={() => router.push(`/admin/products/${product.id}`)}
                            className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <PencilIcon className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(product.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <TrashIcon className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination && pagination.pageCount > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-slate-600">
                Showing {((pagination.page - 1) * pagination.pageSize) + 1} to{' '}
                {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
                {pagination.total} products
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-slate-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span className="px-4 py-2 text-sm text-slate-700">
                  Page {pagination.page} of {pagination.pageCount}
                </span>
                <button
                  onClick={() => setPage(Math.min(pagination.pageCount, page + 1))}
                  disabled={page === pagination.pageCount}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-slate-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

