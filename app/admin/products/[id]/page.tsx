'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import axios from 'axios';
import dynamic from 'next/dynamic';
import AdminLayout from '@/components/AdminLayout';
import { ArrowLeftIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import '@google/model-viewer';

// Dynamically import ReactQuill to avoid SSR issues
const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });
import 'react-quill/dist/quill.snow.css';

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_API_URL || 'http://localhost:1337';
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

interface Product {
  id: number;
  attributes: {
    name: string;
    sku?: string;
    slug?: string;
    shortDesc?: string;
    longDesc?: string;
    price?: number;
    currency?: string;
    category?: string;
    tags?: string[];
    dimensions?: {
      width?: number;
      depth?: number;
      height?: number;
      unit?: string;
    };
    finishes?: Array<{
      name: string;
      colorHex?: string;
      textureImage?: string;
    }>;
    images?: {
      data?: Array<{
        id: number;
        attributes: {
          url: string;
          name: string;
        };
      }>;
    };
    glb?: {
      data?: {
        attributes: {
          url: string;
          name: string;
        };
      };
    };
    usdz?: {
      data?: {
        attributes: {
          url: string;
          name: string;
        };
      };
    };
    cad_files?: {
      data?: Array<{
        id: number;
        attributes: {
          url: string;
          name: string;
        };
      }>;
    };
    publishedAt?: string;
  };
}

interface UploadProgress {
  file: File;
  progress: number;
  status: 'uploading' | 'success' | 'error';
  error?: string;
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

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const { data: session } = useSession();
  const jwt = (session?.user as any)?.jwt;
  const productId = params?.id as string;

  const isNewProduct = productId === 'new';

  // Fetch product data
  const { data, error, isLoading, mutate } = useSWR(
    !isNewProduct && jwt ? [`${STRAPI_URL}/api/products/${productId}?populate=*`, jwt] : null,
    ([url, token]) => fetcher(url, token)
  );

  const product: Product | undefined = data?.data;

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    slug: '',
    shortDesc: '',
    longDesc: '',
    price: '',
    currency: 'EUR',
    category: 'Chair',
    tags: [] as string[],
    dimensions: {
      width: '',
      depth: '',
      height: '',
      unit: 'cm',
    },
    finishes: [] as Array<{ name: string; colorHex: string; textureImage?: string }>,
  });

  const [tagInput, setTagInput] = useState('');
  const [finishInput, setFinishInput] = useState({ name: '', colorHex: '#000000' });
  const [uploadProgress, setUploadProgress] = useState<Map<string, UploadProgress>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);

  // Initialize form data from product
  useEffect(() => {
    if (product) {
      setFormData({
        name: product.attributes.name || '',
        sku: product.attributes.sku || '',
        slug: product.attributes.slug || '',
        shortDesc: product.attributes.shortDesc || '',
        longDesc: product.attributes.longDesc || '',
        price: product.attributes.price?.toString() || '',
        currency: product.attributes.currency || 'EUR',
        category: product.attributes.category || 'Chair',
        tags: product.attributes.tags || [],
        dimensions: {
          width: product.attributes.dimensions?.width?.toString() || '',
          depth: product.attributes.dimensions?.depth?.toString() || '',
          height: product.attributes.dimensions?.height?.toString() || '',
          unit: product.attributes.dimensions?.unit || 'cm',
        },
        finishes: product.attributes.finishes || [],
      });
      setGlbUrl(
        product.attributes.glb?.data?.attributes?.url
          ? `${STRAPI_URL}${product.attributes.glb.data.attributes.url}`
          : null
      );
    }
  }, [product]);

  // Generate slug from name
  useEffect(() => {
    if (formData.name && !formData.slug) {
      const slug = formData.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setFormData((prev) => ({ ...prev, slug }));
    }
  }, [formData.name]);

  // Upload file with presigned URL
  const uploadFile = async (
    file: File,
    type: 'image' | 'glb' | 'usdz' | 'cad',
    productId?: number
  ) => {
    const fileKey = `${type}-${Date.now()}-${file.name}`;
    const contentType = file.type;

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum allowed size (100MB)`);
    }

    // Update progress
    setUploadProgress((prev) => {
      const newMap = new Map(prev);
      newMap.set(fileKey, {
        file,
        progress: 0,
        status: 'uploading',
      });
      return newMap;
    });

    try {
      // Get presigned URL
      const presignResponse = await axios.post('/api/admin/presign', {
        filename: file.name,
        contentType,
        method: 'POST',
      });

      const { url, fields } = presignResponse.data;

      // Upload to Supabase Storage
      const formData = new FormData();
      Object.keys(fields).forEach((key) => {
        formData.append(key, fields[key]);
      });
      formData.append('file', file);

      await axios.post(url, formData, {
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress((prev) => {
              const newMap = new Map(prev);
              const current = newMap.get(fileKey);
              if (current) {
                newMap.set(fileKey, { ...current, progress });
              }
              return newMap;
            });
          }
        },
      });

      // Attach to product in Strapi (if product exists)
      if (productId) {
        const fileKey = fields.key || presignResponse.data.fileKey;
        // Use publicUrl from response if available, otherwise construct Supabase URL
        const fileUrl = presignResponse.data.publicUrl || 
          (fileKey && process.env.NEXT_PUBLIC_SUPABASE_URL
            ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'uploads'}/${fileKey}`
            : url);

        // Get the product to check existing media
        const productResponse = await axios.get(
          `${STRAPI_URL}/api/products/${productId}?populate=*`,
          {
            headers: {
              Authorization: `Bearer ${jwt}`,
            },
          }
        );

        const currentProduct = productResponse.data.data;

        // Prepare update payload based on file type
        let updatePayload: any = {};

        if (type === 'image') {
          const existingImages = currentProduct.attributes.images?.data || [];
          updatePayload.images = [
            ...existingImages.map((img: any) => img.id),
            { url: fileUrl, name: file.name },
          ];
        } else if (type === 'glb') {
          updatePayload.glb = { url: fileUrl, name: file.name };
        } else if (type === 'usdz') {
          updatePayload.usdz = { url: fileUrl, name: file.name };
        } else if (type === 'cad') {
          const existingCad = currentProduct.attributes.cad_files?.data || [];
          updatePayload.cad_files = [
            ...existingCad.map((file: any) => file.id),
            { url: fileUrl, name: file.name },
          ];
        }

        // Update product with new media
        await axios.put(
          `${STRAPI_URL}/api/products/${productId}`,
          {
            data: updatePayload,
          },
          {
            headers: {
              Authorization: `Bearer ${jwt}`,
              'Content-Type': 'application/json',
            },
          }
        );
      }

      // Update progress
      setUploadProgress((prev) => {
        const newMap = new Map(prev);
        const current = newMap.get(fileKey);
        if (current) {
          newMap.set(fileKey, { ...current, progress: 100, status: 'success' });
        }
        return newMap;
      });

      // Update GLB URL if GLB file
      if (type === 'glb' && presignResponse.data.fileKey) {
        // Use publicUrl from response if available, otherwise construct Supabase URL
        const fileUrl = presignResponse.data.publicUrl || 
          (presignResponse.data.fileKey && process.env.NEXT_PUBLIC_SUPABASE_URL
            ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'uploads'}/${presignResponse.data.fileKey}`
            : url);
        setGlbUrl(fileUrl);
      }

      // Refresh product data
      if (productId) {
        mutate();
      }

      return presignResponse.data.fileKey;
    } catch (error: any) {
      setUploadProgress((prev) => {
        const newMap = new Map(prev);
        const current = newMap.get(fileKey);
        if (current) {
          newMap.set(fileKey, {
            ...current,
            status: 'error',
            error: error.message || 'Upload failed',
          });
        }
        return newMap;
      });
      throw error;
    }
  };

  // Handle file upload
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'image' | 'glb' | 'usdz' | 'cad'
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const productIdNum = isNewProduct ? undefined : parseInt(productId);

    for (const file of Array.from(files)) {
      try {
        await uploadFile(file, type, productIdNum);
      } catch (error: any) {
        alert(`Failed to upload ${file.name}: ${error.message}`);
      }
    }
  };

  // Add tag
  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData((prev) => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()],
      }));
      setTagInput('');
    }
  };

  // Remove tag
  const removeTag = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tag),
    }));
  };

  // Add finish
  const addFinish = () => {
    if (finishInput.name.trim()) {
      setFormData((prev) => ({
        ...prev,
        finishes: [...prev.finishes, { ...finishInput }],
      }));
      setFinishInput({ name: '', colorHex: '#000000' });
    }
  };

  // Remove finish
  const removeFinish = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      finishes: prev.finishes.filter((_, i) => i !== index),
    }));
  };

  // Save draft
  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      const payload = {
        data: {
          name: formData.name,
          sku: formData.sku,
          slug: formData.slug,
          shortDesc: formData.shortDesc,
          longDesc: formData.longDesc,
          price: formData.price ? parseFloat(formData.price) : null,
          currency: formData.currency,
          category: formData.category,
          tags: formData.tags,
          dimensions: {
            width: formData.dimensions.width ? parseFloat(formData.dimensions.width) : null,
            depth: formData.dimensions.depth ? parseFloat(formData.dimensions.depth) : null,
            height: formData.dimensions.height ? parseFloat(formData.dimensions.height) : null,
            unit: formData.dimensions.unit,
          },
          finishes: formData.finishes,
        },
      };

      if (isNewProduct) {
        const response = await axios.post(`${STRAPI_URL}/api/products`, payload, {
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json',
          },
        });
        router.push(`/admin/products/${response.data.data.id}`);
      } else {
        await axios.put(`${STRAPI_URL}/api/products/${productId}`, payload, {
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json',
          },
        });
        mutate();
        alert('Draft saved successfully!');
      }
    } catch (error: any) {
      console.error('Save error:', error);
      alert(`Failed to save draft: ${error.response?.data?.error?.message || error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Publish
  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      const payload = {
        data: {
          name: formData.name,
          sku: formData.sku,
          slug: formData.slug,
          shortDesc: formData.shortDesc,
          longDesc: formData.longDesc,
          price: formData.price ? parseFloat(formData.price) : null,
          currency: formData.currency,
          category: formData.category,
          tags: formData.tags,
          dimensions: {
            width: formData.dimensions.width ? parseFloat(formData.dimensions.width) : null,
            depth: formData.dimensions.depth ? parseFloat(formData.dimensions.depth) : null,
            height: formData.dimensions.height ? parseFloat(formData.dimensions.height) : null,
            unit: formData.dimensions.unit,
          },
          finishes: formData.finishes,
          publishedAt: new Date().toISOString(),
        },
      };

      if (isNewProduct) {
        const response = await axios.post(`${STRAPI_URL}/api/products`, payload, {
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json',
          },
        });
        router.push(`/admin/products/${response.data.data.id}`);
      } else {
        await axios.put(`${STRAPI_URL}/api/products/${productId}`, payload, {
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json',
          },
        });
        mutate();
        alert('Product published successfully!');
      }
    } catch (error: any) {
      console.error('Publish error:', error);
      alert(`Failed to publish: ${error.response?.data?.error?.message || error.message}`);
    } finally {
      setIsPublishing(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </AdminLayout>
    );
  }

  if (error && !isNewProduct) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-red-600">Failed to load product. Please try again.</p>
          <button
            onClick={() => router.push('/admin/products')}
            className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            Back to Products
          </button>
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
              onClick={() => router.push('/admin/products')}
              className="p-2 rounded-lg text-slate-700 hover:bg-gray-100 transition-colors"
            >
              <ArrowLeftIcon className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-3xl font-serif font-bold text-midnight">
                {isNewProduct ? 'New Product' : 'Edit Product'}
              </h1>
              <p className="text-slate-600">
                {isNewProduct ? 'Create a new product' : `Editing: ${formData.name || 'Product'}`}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => router.push(`/admin/logs?entity=product&entityId=${productId}`)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-slate-700 hover:bg-gray-50 transition-colors"
            >
              View History
            </button>
            <button
              onClick={handleSaveDraft}
              disabled={isSaving || isPublishing}
              className="px-6 py-2 border border-gray-300 rounded-lg text-slate-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              onClick={handlePublish}
              disabled={isSaving || isPublishing}
              className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPublishing ? 'Publishing...' : 'Publish'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Information */}
            <div className="bg-white rounded-lg shadow-soft p-6">
              <h2 className="text-xl font-serif font-semibold text-midnight mb-4">
                Basic Information
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">SKU</label>
                    <input
                      type="text"
                      value={formData.sku}
                      onChange={(e) => setFormData((prev) => ({ ...prev, sku: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Slug</label>
                    <input
                      type="text"
                      value={formData.slug}
                      onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none bg-gray-50"
                      placeholder="Auto-generated from name"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Short Description
                  </label>
                  <textarea
                    value={formData.shortDesc}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, shortDesc: e.target.value }))
                    }
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Long Description
                  </label>
                  {typeof window !== 'undefined' && (
                    <ReactQuill
                      value={formData.longDesc}
                      onChange={(value) => setFormData((prev) => ({ ...prev, longDesc: value }))}
                      theme="snow"
                      className="bg-white"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Pricing */}
            <div className="bg-white rounded-lg shadow-soft p-6">
              <h2 className="text-xl font-serif font-semibold text-midnight mb-4">Pricing</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, price: e.target.value }))
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Currency</label>
                  <select
                    value={formData.currency}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, currency: e.target.value }))
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  >
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Category & Tags */}
            <div className="bg-white rounded-lg shadow-soft p-6">
              <h2 className="text-xl font-serif font-semibold text-midnight mb-4">
                Category & Tags
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, category: e.target.value }))
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  >
                    <option value="Chair">Chair</option>
                    <option value="Table">Table</option>
                    <option value="Lighting">Lighting</option>
                    <option value="Bed">Bed</option>
                    <option value="Accessory">Accessory</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Tags</label>
                  <div className="flex space-x-2 mb-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                      placeholder="Add tag and press Enter"
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                    />
                    <button
                      onClick={addTag}
                      className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {formData.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center space-x-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                      >
                        <span>{tag}</span>
                        <button
                          onClick={() => removeTag(tag)}
                          className="text-primary hover:text-primary/70"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Dimensions */}
            <div className="bg-white rounded-lg shadow-soft p-6">
              <h2 className="text-xl font-serif font-semibold text-midnight mb-4">Dimensions</h2>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Width</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.dimensions.width}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        dimensions: { ...prev.dimensions, width: e.target.value },
                      }))
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Depth</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.dimensions.depth}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        dimensions: { ...prev.dimensions, depth: e.target.value },
                      }))
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Height</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.dimensions.height}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        dimensions: { ...prev.dimensions, height: e.target.value },
                      }))
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Unit</label>
                  <select
                    value={formData.dimensions.unit}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        dimensions: { ...prev.dimensions, unit: e.target.value },
                      }))
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  >
                    <option value="cm">cm</option>
                    <option value="m">m</option>
                    <option value="in">in</option>
                    <option value="ft">ft</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Finishes */}
            <div className="bg-white rounded-lg shadow-soft p-6">
              <h2 className="text-xl font-serif font-semibold text-midnight mb-4">Finishes</h2>
              <div className="space-y-4">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={finishInput.name}
                    onChange={(e) =>
                      setFinishInput((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="Finish name"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  />
                  <input
                    type="color"
                    value={finishInput.colorHex}
                    onChange={(e) =>
                      setFinishInput((prev) => ({ ...prev, colorHex: e.target.value }))
                    }
                    className="w-16 h-10 border border-gray-300 rounded-lg"
                  />
                  <button
                    onClick={addFinish}
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    Add
                  </button>
                </div>
                <div className="space-y-2">
                  {formData.finishes.map((finish, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className="w-8 h-8 rounded border border-gray-300"
                          style={{ backgroundColor: finish.colorHex }}
                        />
                        <span className="font-medium">{finish.name}</span>
                      </div>
                      <button
                        onClick={() => removeFinish(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <XMarkIcon className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Asset Uploads */}
            <div className="bg-white rounded-lg shadow-soft p-6">
              <h2 className="text-xl font-serif font-semibold text-midnight mb-4">Assets</h2>
              <div className="space-y-4">
                {/* Images */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Images</label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleFileUpload(e, 'image')}
                    className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary file:text-white hover:file:bg-primary/90"
                  />
                  {product?.attributes.images?.data && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {product.attributes.images.data.map((img) => (
                        <div
                          key={img.id}
                          className="relative w-full h-24 rounded-lg overflow-hidden bg-gray-100"
                        >
                          <Image
                            src={`${STRAPI_URL}${img.attributes.url}`}
                            alt={img.attributes.name}
                            fill
                            className="object-cover"
                            sizes="(max-width: 768px) 50vw, 25vw"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* GLB */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    3D Model (GLB)
                  </label>
                  <input
                    type="file"
                    accept=".glb"
                    onChange={(e) => handleFileUpload(e, 'glb')}
                    className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary file:text-white hover:file:bg-primary/90"
                  />
                  <p className="mt-1 text-xs text-slate-500">Max size: 100MB</p>
                </div>

                {/* USDZ */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    USDZ (iOS AR)
                  </label>
                  <input
                    type="file"
                    accept=".usdz"
                    onChange={(e) => handleFileUpload(e, 'usdz')}
                    className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary file:text-white hover:file:bg-primary/90"
                  />
                  <p className="mt-1 text-xs text-slate-500">Max size: 100MB</p>
                </div>

                {/* CAD Files */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    CAD Files
                  </label>
                  <input
                    type="file"
                    accept=".step,.dwg,.pdf"
                    multiple
                    onChange={(e) => handleFileUpload(e, 'cad')}
                    className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary file:text-white hover:file:bg-primary/90"
                  />
                  <p className="mt-1 text-xs text-slate-500">Max size: 100MB per file</p>
                </div>

                {/* Upload Progress */}
                {uploadProgress.size > 0 && (
                  <div className="mt-4 space-y-2">
                    {Array.from(uploadProgress.entries()).map(([key, progress]) => (
                      <div key={key} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-700 truncate">{progress.file.name}</span>
                          {progress.status === 'success' && (
                            <CheckIcon className="w-5 h-5 text-green-600" />
                          )}
                          {progress.status === 'error' && (
                            <XMarkIcon className="w-5 h-5 text-red-600" />
                          )}
                        </div>
                        {progress.status === 'uploading' && (
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full transition-all"
                              style={{ width: `${progress.progress}%` }}
                            />
                          </div>
                        )}
                        {progress.error && (
                          <p className="text-xs text-red-600">{progress.error}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 3D Preview */}
            {glbUrl && (
              <div className="bg-white rounded-lg shadow-soft p-6">
                <h2 className="text-xl font-serif font-semibold text-midnight mb-4">3D Preview</h2>
                <div className="w-full h-96 rounded-lg overflow-hidden bg-gray-100">
                  {/* @ts-ignore */}
                  <model-viewer
                    src={glbUrl}
                    alt="3D Model"
                    camera-controls
                    auto-rotate
                    ar
                    ar-modes="webxr scene-viewer quick-look"
                    shadow-intensity="1"
                    exposure="1"
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
                {formData.finishes.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-medium text-slate-700 mb-2">Material Swatches</h3>
                    <div className="flex flex-wrap gap-2">
                      {formData.finishes.map((finish, index) => (
                        <button
                          key={index}
                          className="w-12 h-12 rounded border border-gray-300 hover:border-primary transition-colors"
                          style={{ backgroundColor: finish.colorHex }}
                          title={finish.name}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

