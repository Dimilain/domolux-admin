import AdminLayout from '@/components/AdminLayout';

export default function Home() {
  return (
    <AdminLayout>
      <div>
        <h1 className="text-3xl font-serif font-bold text-midnight mb-6">Dashboard</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Stats cards */}
          <div className="bg-white rounded-lg shadow-soft p-6">
            <h3 className="text-sm font-medium text-slate-600 mb-2">Total Products</h3>
            <p className="text-3xl font-bold text-midnight">0</p>
          </div>
          <div className="bg-white rounded-lg shadow-soft p-6">
            <h3 className="text-sm font-medium text-slate-600 mb-2">Total Articles</h3>
            <p className="text-3xl font-bold text-midnight">0</p>
          </div>
          <div className="bg-white rounded-lg shadow-soft p-6">
            <h3 className="text-sm font-medium text-slate-600 mb-2">Pending Leads</h3>
            <p className="text-3xl font-bold text-midnight">0</p>
          </div>
          <div className="bg-white rounded-lg shadow-soft p-6">
            <h3 className="text-sm font-medium text-slate-600 mb-2">Media Files</h3>
            <p className="text-3xl font-bold text-midnight">0</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-soft p-6">
          <h2 className="text-xl font-serif font-semibold text-midnight mb-4">Welcome to Domolux Admin</h2>
          <p className="text-slate-700">
            Manage your products, articles, media, and more from this admin panel.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
