import React, { useState } from 'react';
import { UploadCloud, Image as ImageIcon, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';
import { uploadToImgBB } from '../../services/imgbb';

export default function ImgBBUploader({ value, onChange, label = "Upload Image (Hosted on ImgBB)" }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (e.g. max 10MB for ImgBB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image file size exceeds 10MB limit.');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      const result = await uploadToImgBB(file);

      if (result.success && result.url) {
        onChange(result.url);
      } else {
        setError(result.error || 'Upload to ImgBB failed');
      }
    } catch (err) {
      setError(err.message || 'Error uploading image to ImgBB');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    onChange('');
    setError(null);
  };

  return (
    <div className="space-y-1.5 text-xs">
      <label className="block font-bold text-slate-700 dark:text-slate-300">{label}</label>

      {value ? (
        <div className="relative group w-full h-32 rounded-xl overflow-hidden bg-pos-dark border border-pos-border">
          <img
            src={value}
            alt="Uploaded preview"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1 rounded-lg bg-pos-surface text-slate-200 text-[11px] font-bold hover:bg-slate-700"
            >
              View Full
            </a>
            <button
              type="button"
              onClick={handleRemove}
              className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold hover:bg-rose-500 flex items-center space-x-1 shadow"
            >
              <X className="w-3 h-3" />
              <span>Remove</span>
            </button>
          </div>
        </div>
      ) : (
        <label className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
          uploading
            ? 'bg-pos-dark/70 border-emerald-500/50'
            : 'bg-pos-dark hover:bg-pos-surface border-pos-border hover:border-emerald-500'
        }`}>
          <div className="flex flex-col items-center justify-center pt-2 pb-2 text-center px-4">
            {uploading ? (
              <div className="flex flex-col items-center space-y-1 text-emerald-500 dark:text-emerald-400">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-[11px] font-bold">Uploading to ImgBB Cloud...</span>
              </div>
            ) : (
              <>
                <UploadCloud className="w-6 h-6 text-slate-400 mb-1" />
                <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold">
                  <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">Click to upload</span> or drag and drop
                </p>
                <p className="text-[10px] text-slate-500">JPG, PNG, WebP up to 10MB (Free ImgBB Hosting)</p>
              </>
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      )}

      {/* Manual URL input fallback */}
      <div className="pt-1">
        <input
          type="url"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Or paste direct image URL (https://...)"
          className="w-full px-3 py-1.5 bg-pos-dark border border-pos-border rounded-lg text-xs text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500"
        />
      </div>

      {error && (
        <div className="flex items-center space-x-1 text-rose-400 text-[11px] pt-0.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
