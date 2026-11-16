import React from 'react';
import { Download, Printer, QrCode } from 'lucide-react';
import type { InvoicePrintFormat } from '../utils/invoicePdf';

export function InvoicePdfControls({
  format,
  includeQr,
  isBusy,
  onChangeFormat,
  onToggleQr,
  onDownloadPdf,
  onPrint,
}: {
  format: InvoicePrintFormat;
  includeQr: boolean;
  isBusy: boolean;
  onChangeFormat: (f: InvoicePrintFormat) => void;
  onToggleQr: () => void;
  onDownloadPdf: () => void;
  onPrint: () => void;
}) {
  return (
    <div className="p-3 bg-white border-t border-slate-200 space-y-2.5 shrink-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex bg-slate-100 p-0.5 rounded-lg text-[11px] font-bold">
          <button
            type="button"
            onClick={() => onChangeFormat('thermal')}
            className={`px-2.5 py-1 rounded-md transition ${
              format === 'thermal' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-600'
            }`}
          >
            Thermal 80mm
          </button>
          <button
            type="button"
            onClick={() => onChangeFormat('a4')}
            className={`px-2.5 py-1 rounded-md transition ${
              format === 'a4' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-600'
            }`}
          >
            A4 Tax PDF
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleQr}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 border transition ${
            includeQr
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}
        >
          <QrCode className="w-3.5 h-3.5" />
          {includeQr ? 'QR On' : 'QR Off'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={isBusy}
          onClick={onDownloadPdf}
          className="py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
        >
          <Download className="w-4 h-4" />
          Download PDF
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={onPrint}
          className="py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
        >
          <Printer className="w-4 h-4" />
          Print Receipt
        </button>
      </div>
    </div>
  );
}
