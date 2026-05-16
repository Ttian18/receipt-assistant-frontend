import React from 'react';
import { Boxes, Tag, ChevronRight } from 'lucide-react';
import Layout from './components/Layout';
import type { DockDestination } from './components/FloatingDock';
import Dashboard from './components/Dashboard';
import Transactions from './components/Transactions';
import MonthlyReview from './components/MonthlyReview';
import YearlyReview from './components/YearlyReview';
import Batches from './components/Batches';
import BatchDetail from './components/BatchDetail';
import Capture from './components/Capture';
import ProcessingToast from './components/ProcessingToast';
import { useProcessingJobs } from './components/useProcessingJobs';
import ReceiptDetail from './components/ReceiptDetail';
import MerchantDetail from './components/MerchantDetail';
import Products from './components/Products';
import Brands from './components/Brands';
import BuildInfoPanel from './components/BuildInfoPanel';
import { fetchBackendBuildInfo, type BuildInfo } from './lib/api';

type ActiveTab =
  | 'dashboard'
  | 'transactions'
  | 'batches'
  | 'monthly'
  | 'yearly'
  | 'settings'
  | 'products'
  | 'brands'
  | 'add';

/** Map App.tsx's fine-grained tab state onto the 3-pill dock. */
function dockDestinationFor(tab: ActiveTab): DockDestination {
  if (tab === 'add') return 'add';
  if (tab === 'monthly' || tab === 'yearly') return 'review';
  if (tab === 'settings' || tab === 'products' || tab === 'brands') return 'settings';
  // dashboard / transactions / batches → Books
  return 'books';
}

export default function App() {
  const [activeTab, setActiveTab] = React.useState<ActiveTab>('dashboard');
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [selectedReceiptId, setSelectedReceiptId] = React.useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = React.useState<string | null>(null);
  const [selectedMerchantBrandId, setSelectedMerchantBrandId] = React.useState<string | null>(null);
  const [backendBuildInfo, setBackendBuildInfo] = React.useState<BuildInfo | null>(null);
  const [transactionsSearch, setTransactionsSearch] = React.useState('');
  const { jobs, addJob, removeJob } = useProcessingJobs();

  React.useEffect(() => {
    fetchBackendBuildInfo().then(setBackendBuildInfo).catch(() => setBackendBuildInfo(null));
  }, []);

  const handleUploadComplete = (job: { batchId: string; ingestId: string; filename: string }) => {
    addJob(job);
    setRefreshKey((k) => k + 1);
    // After upload, drop back to Books so the user sees their entry processing.
    goToTab('dashboard');
  };

  const goToTab = (tab: ActiveTab) => {
    setSelectedReceiptId(null);
    setSelectedBatchId(null);
    setSelectedMerchantBrandId(null);
    setTransactionsSearch('');
    setActiveTab(tab);
  };

  const handleDockNavigate = (dest: 'books' | 'review') => {
    if (dest === 'books') {
      goToTab('dashboard');
    } else {
      goToTab('monthly');
    }
  };

  const handleSelectReceipt = (receiptId: string) => setSelectedReceiptId(receiptId);
  const handleBackFromDetail = () => setSelectedReceiptId(null);
  const handleSelectBatch = (batchId: string) => setSelectedBatchId(batchId);
  const handleBackFromBatch = () => setSelectedBatchId(null);
  const handleSelectMerchant = (brandId: string) => {
    setSelectedReceiptId(null);
    setSelectedMerchantBrandId(brandId);
  };
  const handleBackFromMerchant = () => setSelectedMerchantBrandId(null);

  const renderContent = () => {
    if (activeTab === 'add') {
      return (
        <Capture
          onCancel={() => goToTab('dashboard')}
          onComplete={handleUploadComplete}
        />
      );
    }

    if (selectedReceiptId) {
      return (
        <ReceiptDetail
          receiptId={selectedReceiptId}
          onBack={handleBackFromDetail}
          onSelectMerchant={handleSelectMerchant}
          onAfterMutation={() => setRefreshKey((k) => k + 1)}
        />
      );
    }

    if (selectedMerchantBrandId) {
      return (
        <MerchantDetail
          key={selectedMerchantBrandId}
          brandId={selectedMerchantBrandId}
          onBack={handleBackFromMerchant}
          onSelectReceipt={handleSelectReceipt}
        />
      );
    }

    if (activeTab === 'batches' && selectedBatchId) {
      return (
        <BatchDetail
          batchId={selectedBatchId}
          onBack={handleBackFromBatch}
          onSelectTransaction={handleSelectReceipt}
        />
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            key={refreshKey}
            onSelectReceipt={handleSelectReceipt}
            onSelectMerchant={handleSelectMerchant}
            onViewAllTransactions={() => setActiveTab('transactions')}
          />
        );
      case 'transactions':
        return (
          <Transactions
            key={refreshKey}
            onSelectReceipt={handleSelectReceipt}
            onSelectMerchant={handleSelectMerchant}
            searchQuery={transactionsSearch}
            onSearchChange={setTransactionsSearch}
            onClearSearch={() => setTransactionsSearch('')}
          />
        );
      case 'batches':
        return <Batches key={refreshKey} onSelectBatch={handleSelectBatch} />;
      case 'monthly':
        return <MonthlyReview />;
      case 'yearly':
        return <YearlyReview />;
      case 'products':
        return <Products onBack={() => goToTab('settings')} />;
      case 'brands':
        return <Brands onBack={() => goToTab('settings')} />;
      case 'settings':
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="font-display text-3xl italic font-medium tracking-tight">Settings</h2>
              <p className="text-[color:var(--color-ink-muted)] max-w-2xl">
                Catalog management and deployment metadata.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <SettingsCard
                icon={<Boxes size={18} />}
                title="Products"
                subtitle="Catalog SSOT, owned items, merge duplicates"
                onClick={() => setActiveTab('products')}
              />
              <SettingsCard
                icon={<Tag size={18} />}
                title="Brands"
                subtitle="Brand registry + icon asset picker"
                onClick={() => setActiveTab('brands')}
              />
            </div>

            <div className="space-y-2 pt-4">
              <h3 className="font-display text-xl italic font-medium tracking-tight">Build &amp; Deploy</h3>
              <p className="text-[color:var(--color-ink-muted)] text-sm">
                Which frontend / backend build is currently deployed.
              </p>
            </div>
            <BuildInfoPanel backendBuildInfo={backendBuildInfo} />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Layout
        dockActive={dockDestinationFor(activeTab)}
        onDockNavigate={handleDockNavigate}
        onAddTransaction={() => goToTab('add')}
        onSettings={() => goToTab('settings')}
        dockHidden={activeTab === 'add'}
      >
        {renderContent()}
      </Layout>

      <ProcessingToast
        jobs={jobs}
        onJobDone={removeJob}
        onRefresh={() => setRefreshKey((k) => k + 1)}
      />
    </>
  );
}

function SettingsCard({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-[18px] border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-5 py-4 flex items-center gap-4 hover:bg-[color:var(--color-paper-deep)]/30 transition-colors"
    >
      <div className="shrink-0 w-10 h-10 rounded-full bg-[color:var(--color-paper-deep)] flex items-center justify-center text-[color:var(--color-ink)]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-[15px]">{title}</div>
        <div className="text-[12px] text-[color:var(--color-ink-muted)] mt-0.5">{subtitle}</div>
      </div>
      <ChevronRight size={16} className="text-[color:var(--color-ink-muted)]" />
    </button>
  );
}
