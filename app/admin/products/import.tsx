'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import AdminLayout from '@/components/AdminLayout';
import { ArrowLeftIcon, CloudArrowUpIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Papa from 'papaparse';
import axios from 'axios';

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_API_URL || 'http://localhost:1337';

interface CSVRow {
  [key: string]: string;
}

interface FieldMapping {
  csvColumn: string;
  productField: string;
}

interface ImportJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  total: number;
  processed: number;
  errors: string[];
}

const PRODUCT_FIELDS = [
  { value: '', label: '-- Skip --' },
  { value: 'name', label: 'Name' },
  { value: 'sku', label: 'SKU' },
  { value: 'slug', label: 'Slug' },
  { value: 'shortDesc', label: 'Short Description' },
  { value: 'longDesc', label: 'Long Description' },
  { value: 'price', label: 'Price' },
  { value: 'currency', label: 'Currency' },
  { value: 'category', label: 'Category' },
  { value: 'tags', label: 'Tags (comma-separated)' },
  { value: 'width', label: 'Width' },
  { value: 'depth', label: 'Depth' },
  { value: 'height', label: 'Height' },
  { value: 'unit', label: 'Unit' },
  { value: 'finishes', label: 'Finishes (comma-separated)' },
  { value: 'image_urls', label: 'Image URLs (comma-separated)' },
  { value: 'glb_url', label: 'GLB URL' },
  { value: 'usdz_url', label: 'USDZ URL' },
  { value: 'cad_urls', label: 'CAD URLs (comma-separated)' },
  { value: 'availability', label: 'Availability' },
  { value: 'hotel_grade', label: 'Hotel Grade' },
];

export default function ImportProductsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const jwt = (session?.user as any)?.jwt;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvData, setCsvData] = useState<CSVRow[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});
  const [isImporting, setIsImporting] = useState(false);
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      alert('Please upload a CSV file');
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          const rows = results.data as CSVRow[];
          setCsvData(rows);
          setCsvHeaders(Object.keys(rows[0]));
          
          // Auto-map headers if they match product fields
          const autoMappings: Record<string, string> = {};
          Object.keys(rows[0]).forEach((header) => {
            const lowerHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '');
            const matchingField = PRODUCT_FIELDS.find(
              (field) => field.value && lowerHeader.includes(field.value.toLowerCase())
            );
            if (matchingField && matchingField.value) {
              autoMappings[header] = matchingField.value;
            }
          });
          setFieldMappings(autoMappings);
        } else {
          alert('CSV file is empty or invalid');
        }
      },
      error: (error) => {
        console.error('CSV parsing error:', error);
        alert(`Failed to parse CSV: ${error.message}`);
      },
    });
  };

  // Update field mapping
  const updateMapping = (csvColumn: string, productField: string) => {
    setFieldMappings((prev) => ({
      ...prev,
      [csvColumn]: productField,
    }));
  };

  // Start import
  const handleStartImport = async () => {
    if (csvData.length === 0) {
      alert('Please upload a CSV file first');
      return;
    }

    if (!jwt) {
      alert('Please log in to import products');
      return;
    }

    setIsImporting(true);

    try {
      const response = await axios.post(
        '/api/admin/import',
        {
          csvData,
          fieldMappings,
        },
        {
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const job = response.data;
      setImportJob(job);

      // If job ID is returned, start polling
      if (job.id) {
        startPolling(job.id);
      } else {
        // Synchronous import completed
        setIsImporting(false);
        if (job.success) {
          alert(`Successfully imported ${job.processed} products`);
        } else {
          alert(`Import completed with errors: ${job.errors?.join(', ') || 'Unknown error'}`);
        }
      }
    } catch (error: any) {
      console.error('Import error:', error);
      alert(`Failed to start import: ${error.response?.data?.error || error.message}`);
      setIsImporting(false);
    }
  };

  // Poll job status
  const startPolling = (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await axios.get(`/api/admin/import/${jobId}`, {
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
        });

        const job = response.data;
        setImportJob(job);

        if (job.status === 'completed' || job.status === 'failed') {
          clearInterval(interval);
          setPollInterval(null);
          setIsImporting(false);

          if (job.status === 'completed') {
            alert(`Successfully imported ${job.processed}/${job.total} products`);
          } else {
            alert(`Import failed: ${job.errors?.join(', ') || 'Unknown error'}`);
          }
        }
      } catch (error: any) {
        console.error('Polling error:', error);
        clearInterval(interval);
        setPollInterval(null);
        setIsImporting(false);
      }
    }, 2000); // Poll every 2 seconds

    setPollInterval(interval);
  };

  // Cancel import
  const handleCancelImport = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }
    setIsImporting(false);
    setImportJob(null);
  };

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
              <h1 className="text-3xl font-serif font-bold text-midnight">Import Products</h1>
              <p className="text-slate-600">Upload a CSV file to import products in bulk</p>
            </div>
          </div>
        </div>

        {/* File Upload */}
        <div className="bg-white rounded-lg shadow-soft p-6 mb-6">
          <h2 className="text-xl font-serif font-semibold text-midnight mb-4">Upload CSV File</h2>
          <div className="flex items-center space-x-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              <CloudArrowUpIcon className="w-5 h-5" />
              <span>Choose CSV File</span>
            </button>
            {csvData.length > 0 && (
              <span className="text-slate-600">
                {csvData.length} rows loaded
              </span>
            )}
          </div>
        </div>

        {/* Field Mapping */}
        {csvHeaders.length > 0 && (
          <div className="bg-white rounded-lg shadow-soft p-6 mb-6">
            <h2 className="text-xl font-serif font-semibold text-midnight mb-4">
              Map CSV Columns to Product Fields
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-medium text-slate-700">CSV Column</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-700">Sample Value</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-700">Product Field</th>
                  </tr>
                </thead>
                <tbody>
                  {csvHeaders.map((header) => (
                    <tr key={header} className="border-b border-gray-100">
                      <td className="py-3 px-4 font-medium text-slate-800">{header}</td>
                      <td className="py-3 px-4 text-sm text-slate-600 max-w-xs truncate">
                        {csvData[0]?.[header] || ''}
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={fieldMappings[header] || ''}
                          onChange={(e) => updateMapping(header, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                        >
                          {PRODUCT_FIELDS.map((field) => (
                            <option key={field.value} value={field.value}>
                              {field.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Import Progress */}
        {importJob && (
          <div className="bg-white rounded-lg shadow-soft p-6 mb-6">
            <h2 className="text-xl font-serif font-semibold text-midnight mb-4">Import Progress</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-700">
                  Status: <span className="font-medium">{importJob.status}</span>
                </span>
                <span className="text-slate-600">
                  {importJob.processed} / {importJob.total} products
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${importJob.progress}%` }}
                />
              </div>
              {importJob.errors && importJob.errors.length > 0 && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <h3 className="font-medium text-red-800 mb-2">Errors:</h3>
                  <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                    {importJob.errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end space-x-4">
          {isImporting && (
            <button
              onClick={handleCancelImport}
              className="px-6 py-2 border border-gray-300 rounded-lg text-slate-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleStartImport}
            disabled={csvData.length === 0 || isImporting}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isImporting ? 'Importing...' : 'Start Import'}
          </button>
        </div>

        {/* Help Text */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium text-slate-800 mb-2">CSV Format Guidelines</h3>
          <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
            <li>First row must contain column headers</li>
            <li>Required fields: Name (or name column)</li>
            <li>Image URLs should be comma-separated for multiple images</li>
            <li>Tags and Finishes should be comma-separated</li>
            <li>Price should be numeric (e.g., 100.00)</li>
            <li>Currency should be EUR, USD, or GBP</li>
            <li>Hotel Grade should be true/false or yes/no</li>
          </ul>
        </div>
      </div>
    </AdminLayout>
  );
}





