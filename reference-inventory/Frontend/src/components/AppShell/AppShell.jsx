import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Topbar from '../Topbar/Topbar.jsx';
import Sidebar from '../Sidebar/Sidebar.jsx';
import QuickReprintModal from '../QuickReprintModal/QuickReprintModal.jsx';
import SecretAIOcrModal from '../SecretAIOcr/SecretAIOcrModal.jsx';
import { useApp } from '../../context/AppContext.jsx';
import './AppShell.css';

export default function AppShell() {
  const navigate = useNavigate();
  const { user } = useApp();
  const userRole = user?.role?.toLowerCase();
  const isSales = userRole === 'sales_person' || userRole === 'sales';

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reprintModalOpen, setReprintModalOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  const handleToggleSidebar = () => {
    setSidebarOpen((prev) => !prev);
  };

  const handleCloseSidebar = () => {
    setSidebarOpen(false);
  };

  const handleOpenReprintModal = () => {
    if (isSales) return;
    setReprintModalOpen(true);
  };

  const handleCloseReprintModal = () => {
    setReprintModalOpen(false);
  };

  // Global keyboard shortcut listeners:
  // 1. (Alt + L or Ctrl + Shift + L) -> Quick Reprint Label
  // 2. (Ctrl + Shift + O or Cmd + Shift + O) -> Secret AI OCR Assistant
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Secret Shortcut: Ctrl + Shift + O (AI Smart Scanner)
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        (e.key === 'o' || e.key === 'O' || e.code === 'KeyO')
      ) {
        e.preventDefault();
        setAiModalOpen((prev) => !prev);
        return;
      }

      // Secret Shortcut: Ctrl + Shift + L (Quick Reprint)
      if (!isSales) {
        if (
          (e.altKey && (e.key === 'l' || e.key === 'L')) ||
          ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'l' || e.key === 'L'))
        ) {
          e.preventDefault();
          setReprintModalOpen((prev) => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSales]);

  // Handle Apply to Goods In
  const handleApplyToGoodsIn = (extractedData) => {
    try {
      sessionStorage.setItem('docuflow_ai_pending_import', JSON.stringify({
        type: 'goods_in',
        data: extractedData,
        timestamp: Date.now(),
      }));
      window.dispatchEvent(new CustomEvent('docuflow_ai_import_event', {
        detail: { type: 'goods_in', data: extractedData },
      }));
      navigate('/goods-in');
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Apply to PO
  const handleApplyToPo = (extractedData) => {
    try {
      sessionStorage.setItem('docuflow_ai_pending_import', JSON.stringify({
        type: 'po',
        data: extractedData,
        timestamp: Date.now(),
      }));
      window.dispatchEvent(new CustomEvent('docuflow_ai_import_event', {
        detail: { type: 'po', data: extractedData },
      }));
      navigate('/purchase-orders/new');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="app-shell">
      <div className="app-shell__topbar">
        <Topbar onToggleSidebar={handleToggleSidebar} />
      </div>

      <div className="app-shell__sidebar">
        <Sidebar 
          isOpen={sidebarOpen} 
          onClose={handleCloseSidebar} 
          onOpenReprintModal={handleOpenReprintModal}
        />
      </div>

      <main className="app-shell__content">
        <Outlet />
      </main>

      {/* Secret Quick Scan & Reprint Label Modal */}
      <QuickReprintModal
        isOpen={reprintModalOpen}
        onClose={handleCloseReprintModal}
      />

      {/* Secret AI Smart Scanner Modal (Ctrl + Shift + O) */}
      <SecretAIOcrModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onApplyToGoodsIn={handleApplyToGoodsIn}
        onApplyToPo={handleApplyToPo}
      />
    </div>
  );
}


